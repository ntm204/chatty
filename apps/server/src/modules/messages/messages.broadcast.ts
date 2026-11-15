/**
 * Announcing a message to its conversation without leaking protected content.
 */
import type { MessageDTO } from "@chatty/shared-types";
import { prisma } from "../../lib/prisma.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import { toMessageDTO, type MessageRow } from "./messages.mapper.js";

/**
 * Emits `message:new` or `message:updated` for one message to everyone in its
 * conversation.
 *
 * An ordinary message is one payload to the room. A protected one is two: the
 * room — minus the author's sockets — receives the cover, and the author's own
 * sockets receive the content, so every tab of theirs keeps showing what they
 * wrote while nobody else's socket ever carries it. The author's copy goes only
 * while they are still a participant: a personal room reaches every device they
 * have, including ones that left the group.
 */
export async function broadcastMessage(
	event: "message:new" | "message:updated",
	row: MessageRow,
	extra: Partial<MessageDTO> = {},
): Promise<void> {
	const io = getIO();
	const authorId = row.author?.id;
	if (!row.isProtected || !authorId) {
		io.to(row.conversationId).emit(event, { ...toMessageDTO(row), ...extra });

		return;
	}

	io.to(row.conversationId)
		.except(userRoom(authorId))
		.emit(event, { ...toMessageDTO(row), ...extra });
	const authorIsParticipant = await prisma.conversationParticipant.count({
		where: { conversationId: row.conversationId, userId: authorId },
	});
	if (authorIsParticipant > 0) io.to(userRoom(authorId)).emit(event, { ...toMessageDTO(row, authorId), ...extra });
}
