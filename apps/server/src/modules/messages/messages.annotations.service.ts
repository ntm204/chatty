/**
 * What participants attach to a message without changing it: personal
 * bookmarks, the conversation's pinned messages and reactions.
 */
import type { MessageDTO, PinnedMessageDTO } from "@chatty/shared-types";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import { assertDirectConversationAvailable } from "../blocks/blocks.service.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { messageSelect, toMessageDTO, type MessageRow } from "./messages.mapper.js";
import type { ToggleReactionInput } from "./messages.schema.js";

export async function saveMessageForUser(userId: string, conversationId: string, messageId: string): Promise<void> {
	await assertParticipant(userId, conversationId);
	const message = await prisma.message.findFirst({
		where: { id: messageId, conversationId, deletedAt: null, hiddenFor: { none: { userId } } },
		select: { id: true },
	});
	if (!message) throw new NotFoundError("Message not found");

	await prisma.messageStar.upsert({
		where: { messageId_userId: { messageId, userId } },
		create: { messageId, userId },
		update: {},
	});
	getIO().to(userRoom(userId)).emit("bookmark:changed", { conversationId, messageId, isBookmarked: true });
}

export async function removeSavedMessage(userId: string, conversationId: string, messageId: string): Promise<void> {
	await assertParticipant(userId, conversationId);
	await prisma.messageStar.deleteMany({ where: { messageId, userId, message: { conversationId } } });
	getIO().to(userRoom(userId)).emit("bookmark:changed", { conversationId, messageId, isBookmarked: false });
}

function toPinnedMessageDTO(
	rows: {
		messageId: string;
		pinnedById: string;
		pinnedAt: Date;
		message: MessageRow;
	}[],
): PinnedMessageDTO[] {
	return rows.map((row) => ({
		messageId: row.messageId,
		content: row.message.content,
		message: toMessageDTO(row.message),
		pinnedById: row.pinnedById,
		pinnedAt: row.pinnedAt.toISOString(),
	}));
}

export async function setMessagePinned(
	userId: string,
	conversationId: string,
	messageId: string,
	isPinned: boolean,
): Promise<PinnedMessageDTO[]> {
	const result = await prisma.$transaction(async (transaction) => {
		await transaction.$queryRaw`
			SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE
		`;
		await assertParticipant(userId, conversationId, transaction);
		await assertDirectConversationAvailable(userId, conversationId, transaction);
		const message = await transaction.message.findFirst({
			where: { id: messageId, conversationId, deletedAt: null },
			select: { id: true },
		});
		if (!message) throw new NotFoundError("Message not found");
		const existing = await transaction.pinnedMessage.findUnique({
			where: { conversationId_messageId: { conversationId, messageId } },
			select: { messageId: true },
		});
		let didChange = false;
		if (isPinned && !existing) {
			const count = await transaction.pinnedMessage.count({ where: { conversationId } });
			if (count >= 3) throw new ValidationError("A conversation may have at most 3 pinned messages");
			await transaction.pinnedMessage.create({ data: { conversationId, messageId, pinnedById: userId } });
			didChange = true;
		}
		if (!isPinned && existing) {
			await transaction.pinnedMessage.delete({
				where: { conversationId_messageId: { conversationId, messageId } },
			});
			didChange = true;
		}

		let systemMessage: MessageRow | null = null;
		if (didChange) {
			const actor = await transaction.user.findUniqueOrThrow({
				where: { id: userId },
				select: { displayName: true },
			});
			systemMessage = await transaction.message.create({
				data: {
					conversationId,
					kind: "SYSTEM",
					content: `${actor.displayName} ${isPinned ? "pinned" : "unpinned"} a message`,
				},
				select: messageSelect,
			});
			await transaction.conversation.update({
				where: { id: conversationId },
				data: { updatedAt: new Date() },
				select: { id: true },
			});
		}

		const pinned = await transaction.pinnedMessage.findMany({
			where: { conversationId },
			orderBy: { pinnedAt: "desc" },
			select: {
				messageId: true,
				pinnedById: true,
				pinnedAt: true,
				message: { select: messageSelect },
			},
		});

		return { pinned: toPinnedMessageDTO(pinned), systemMessage };
	});

	if (result.systemMessage) getIO().to(conversationId).emit("message:new", toMessageDTO(result.systemMessage));
	getIO().to(conversationId).emit("message:pins-updated", { conversationId, pinnedMessages: result.pinned });

	return result.pinned;
}

/**
 * Sets, changes or clears the caller's one reaction on one message.
 *
 * One reaction per person, so this is not quite a toggle: sending the emoji they
 * already left removes it, and sending a different one *replaces* it rather than
 * adding a second. That is the rule the primary key enforces and the rule every
 * messenger this was modelled on implements — see the note on `MessageReaction`.
 *
 * One endpoint rather than an add and a remove, because the caller never has to
 * know which it is doing: the button that puts a heart on is the button that
 * takes it off, and asking the client to track its own state would make a
 * double-click across two tabs disagree with the database. The database does the
 * deciding — `deleteMany` reports whether the caller had already left *this*
 * emoji, and the upsert covers both of the remaining cases without a second read.
 *
 * Returns the whole message rather than the reaction, for the same reason
 * `deleteMessage` returns the tombstone: what the client renders is the message,
 * and re-reading it here is what makes the broadcast and the response identical.
 */
export async function toggleReaction(
	currentUserId: string,
	conversationId: string,
	messageId: string,
	input: ToggleReactionInput,
): Promise<MessageDTO> {
	// Three outcomes from one call, and the order is what makes them fall out
	// without a read first: delete the caller's reaction if it is already this
	// emoji, and otherwise write this one over whatever else they had. The upsert
	// is doing double duty — it inserts for someone reacting for the first time
	// and updates for someone changing their mind, which under the
	// `(messageId, userId)` key are the same statement.
	//
	// In a transaction because the pair is a read-modify-write in disguise:
	// double-tapping fires two of these, and without it both can see nothing to
	// delete and race into the upsert.
	const message = await prisma.$transaction(async (transaction) => {
		await transaction.$queryRaw`
			SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE
		`;
		await assertParticipant(currentUserId, conversationId, transaction);
		await assertDirectConversationAvailable(currentUserId, conversationId, transaction);
		const target = await transaction.message.findFirst({
			// Scoped by conversation, so an id from a conversation the caller is not in
			// is a 404 rather than a reaction landing somewhere they cannot see.
			where: { id: messageId, conversationId },
			select: { id: true, deletedAt: true, kind: true },
		});
		if (!target) throw new NotFoundError("Message not found");
		// Both refusals are about there being nothing to react *to*. A tombstone has
		// surrendered its content, and the mapper drops its reactions anyway — storing
		// one would be a row nobody could ever see. A system line is the app talking.
		if (target.deletedAt) throw new ValidationError("This message was deleted");
		if (target.kind === "SYSTEM") throw new ValidationError("You cannot react to a system message");

		const removed = await transaction.messageReaction.deleteMany({
			where: { messageId, userId: currentUserId, emoji: input.emoji },
		});
		if (removed.count === 0) {
			await transaction.messageReaction.upsert({
				where: { messageId_userId: { messageId, userId: currentUserId } },
				create: { messageId, userId: currentUserId, emoji: input.emoji },
				// `createdAt` moves with the emoji. The mapper orders chips by it, so
				// leaving it would put a reaction somebody just changed to in the
				// position of the one they abandoned.
				update: { emoji: input.emoji, createdAt: new Date() },
			});
		}

		return transaction.message.findUniqueOrThrow({ where: { id: messageId }, select: messageSelect });
	});

	const messageDTO = toMessageDTO(message);

	// `message:updated`, not an event of its own. The DTO carries the whole
	// reaction list, so a client replaces by id and has nothing to merge — and a
	// merge that goes wrong on a reaction is a count that drifts and never
	// recovers. It also means every surface that already renders an edit renders
	// this, including the one that arrives while you are scrolled away.
	getIO().to(conversationId).emit("message:updated", messageDTO);

	return messageDTO;
}
