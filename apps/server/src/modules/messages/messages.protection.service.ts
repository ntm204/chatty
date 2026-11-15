/**
 * Opening a protected message: the one way its content reaches a recipient.
 * See ADR 0023.
 */
import { PROTECTED_MESSAGE_OPENED_GRACE_SECONDS, type ProtectedMessageContentDTO } from "@chatty/shared-types";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { broadcastMessage } from "./messages.broadcast.js";
import { unexpiredMessageWhere } from "./messages.lifecycle.js";
import { messageSelect, toProtectedContentDTO } from "./messages.mapper.js";

/**
 * Hands one recipient the words and photos of a protected message, once.
 *
 * The view is recorded before anything is returned, under the conversation
 * lock, and its primary key is the "once": a second request — another tab, a
 * replay, a script — finds the row and is refused rather than shown the content
 * again. The author is the exception: they wrote it, so opening their own
 * message records nothing and may be repeated until it expires.
 *
 * Once everyone who was in the conversation when it was sent has opened it,
 * the message is brought forward to expire a minute later — long enough for the
 * last opener's photo to finish loading — rather than living out its 24 hours.
 * People who joined afterwards were never its audience and are not waited for.
 */
export async function openProtectedMessage(
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<ProtectedMessageContentDTO> {
	const result = await prisma.$transaction(async (transaction) => {
		await transaction.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`;
		await assertParticipant(currentUserId, conversationId, transaction);

		const message = await transaction.message.findFirst({
			where: {
				id: messageId,
				conversationId,
				deletedAt: null,
				hiddenFor: { none: { userId: currentUserId } },
				...unexpiredMessageWhere(),
			},
			select: messageSelect,
		});
		if (!message) throw new NotFoundError("Message not found");
		if (!message.isProtected) throw new ValidationError("This message is not protected");

		const content = toProtectedContentDTO(message);
		if (message.author?.id === currentUserId) return { content, updated: null };
		if (message.views.some((view) => view.userId === currentUserId)) {
			throw new ValidationError("You have already opened this message");
		}

		await transaction.messageView.create({ data: { messageId, userId: currentUserId } });

		const [audience, views] = await Promise.all([
			transaction.conversationParticipant.findMany({
				where: {
					conversationId,
					joinedAt: { lte: message.createdAt },
					userId: { not: message.author?.id ?? "" },
				},
				select: { userId: true },
			}),
			transaction.messageView.findMany({ where: { messageId }, select: { userId: true } }),
		]);
		const opened = new Set(views.map((view) => view.userId));
		if (audience.every((participant) => opened.has(participant.userId))) {
			const soon = new Date(Date.now() + PROTECTED_MESSAGE_OPENED_GRACE_SECONDS * 1000);
			if (!message.expiresAt || soon < message.expiresAt) {
				await transaction.message.update({ where: { id: messageId }, data: { expiresAt: soon } });
			}
		}

		return {
			content,
			updated: await transaction.message.findUniqueOrThrow({ where: { id: messageId }, select: messageSelect }),
		};
	});

	// Everyone's cover updates — the author learns it was opened, and the other
	// recipients' clients learn its new expiry.
	if (result.updated) await broadcastMessage("message:updated", result.updated);

	return result.content;
}
