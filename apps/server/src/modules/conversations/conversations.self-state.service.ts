/**
 * What a participant sets on their own membership row: archive, pin, mute and
 * the read marker (with the receipts it may share).
 */
import type { ConversationReadEvent, ConversationSelfUpdatedEvent } from "@chatty/shared-types";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import { isDirectConversationBlockedInTransaction } from "../blocks/blocks.service.js";
import { isDirectConversationRestricted } from "../restrictions/restrictions.service.js";
import { conversationInclude, toConversationUpdatedEvent } from "./conversations.mapper.js";
import type {
	ArchiveConversationInput,
	MarkReadInput,
	MuteConversationInput,
	PinConversationInput,
} from "./conversations.schema.js";
import { announceConversationUpdated, assertParticipant } from "./conversations.shared.js";

const MAX_PINNED_CONVERSATIONS = 5;

function toConversationSelfUpdatedEvent(row: {
	conversationId: string;
	pinnedAt: Date | null;
	archivedAt: Date | null;
	mutedUntil: Date | null;
}): ConversationSelfUpdatedEvent {
	return {
		conversationId: row.conversationId,
		isPinned: row.pinnedAt !== null,
		isArchived: row.archivedAt !== null,
		mutedUntil: row.mutedUntil?.toISOString() ?? null,
	};
}

function announceConversationSelfUpdated(userId: string, event: ConversationSelfUpdatedEvent): void {
	getIO().to(userRoom(userId)).emit("conversation:self-updated", event);
}

const selfStateSelect = {
	conversationId: true,
	pinnedAt: true,
	archivedAt: true,
	mutedUntil: true,
} as const;

export async function setConversationArchived(
	userId: string,
	conversationId: string,
	input: ArchiveConversationInput,
): Promise<ConversationSelfUpdatedEvent> {
	await assertParticipant(userId, conversationId);
	const participant = await prisma.conversationParticipant.update({
		where: { conversationId_userId: { conversationId, userId } },
		data: {
			archivedAt: input.archived ? new Date() : null,
			// A row cannot be intentionally prominent and hidden at once.
			...(input.archived ? { pinnedAt: null } : {}),
		},
		select: selfStateSelect,
	});
	const event = toConversationSelfUpdatedEvent(participant);
	announceConversationSelfUpdated(userId, event);

	return event;
}

export async function setConversationPinned(
	userId: string,
	conversationId: string,
	input: PinConversationInput,
): Promise<ConversationSelfUpdatedEvent> {
	await assertParticipant(userId, conversationId);
	const participant = await prisma.$transaction(async (transaction) => {
		await transaction.$queryRaw`
			SELECT id FROM "ConversationParticipant"
			WHERE "userId" = ${userId}
			FOR UPDATE
		`;
		if (input.pinned) {
			const pinnedCount = await transaction.conversationParticipant.count({
				where: { userId, pinnedAt: { not: null }, conversationId: { not: conversationId } },
			});
			if (pinnedCount >= MAX_PINNED_CONVERSATIONS) {
				throw new ValidationError(`You can pin up to ${MAX_PINNED_CONVERSATIONS} conversations`);
			}
		}

		return transaction.conversationParticipant.update({
			where: { conversationId_userId: { conversationId, userId } },
			data: {
				pinnedAt: input.pinned ? new Date() : null,
				...(input.pinned ? { archivedAt: null } : {}),
			},
			select: selfStateSelect,
		});
	});
	const event = toConversationSelfUpdatedEvent(participant);
	announceConversationSelfUpdated(userId, event);

	return event;
}

export async function setConversationMuted(
	userId: string,
	conversationId: string,
	input: MuteConversationInput,
): Promise<ConversationSelfUpdatedEvent> {
	await assertParticipant(userId, conversationId);
	const until = input.until ? new Date(input.until) : null;
	if (until && until.getTime() <= Date.now()) throw new ValidationError("Mute end time must be in the future");

	const participant = await prisma.conversationParticipant.update({
		where: { conversationId_userId: { conversationId, userId } },
		data: { mutedUntil: until },
		select: selfStateSelect,
	});
	const event = toConversationSelfUpdatedEvent(participant);
	announceConversationSelfUpdated(userId, event);

	return event;
}

/**
 * Moves the caller's read marker to `messageId`.
 *
 * Returns where the marker ended up, which is not always where the caller asked
 * for it — see the backwards check below. The client renders from the returned
 * event rather than from what it sent, so the two cannot disagree.
 */
export async function markConversationRead(
	currentUserId: string,
	conversationId: string,
	input: MarkReadInput,
): Promise<ConversationReadEvent> {
	const { areReceiptsShared, didMove, event } = await prisma.$transaction(async (transaction) => {
		await assertParticipant(currentUserId, conversationId, transaction);
		// A block still lets someone clear their *own* unread badge. What it may
		// not do is advance a shared marker that becomes visible if contact is
		// restored later, so the pair lock and policy check decide whether this
		// read remains private.
		const isBlocked = await isDirectConversationBlockedInTransaction(currentUserId, conversationId, transaction);
		// A restriction is one-directional and silent: the restricted peer must
		// not learn their messages were seen, but the restrictor's own private
		// marker still advances below — their badge clears exactly as normal.
		const isRestrictingPeer = await isDirectConversationRestricted(currentUserId, conversationId, transaction);

		const message = await transaction.message.findUnique({
			where: { id: input.messageId },
			select: { id: true, conversationId: true, createdAt: true },
		});

		// Same error for "no such message" and "a message in someone else's
		// conversation", so this cannot be used to test whether an id exists.
		if (!message || message.conversationId !== conversationId) throw new NotFoundError("Message not found");

		const participant = await transaction.conversationParticipant.findUniqueOrThrow({
			where: { conversationId_userId: { conversationId, userId: currentUserId } },
			select: { lastReadMessageId: true, user: { select: { readReceiptsEnabled: true } } },
		});
		const areReceiptsShared = participant.user.readReceiptsEnabled && !isBlocked && !isRestrictingPeer;

		if (participant.lastReadMessageId) {
			const currentMarker = await transaction.message.findUnique({
				where: { id: participant.lastReadMessageId },
				select: { createdAt: true },
			});

			// A marker only ever moves forward. Scrolling up loads older messages and
			// the client marks what it sees, so without this the marker would follow
			// the viewport backwards and a conversation someone had fully read would
			// turn unread again the moment they looked at its history.
			if (currentMarker && currentMarker.createdAt >= message.createdAt) {
				return {
					areReceiptsShared,
					// Nothing was written, so nothing is announced. Scrolling up marks
					// every older message the viewport passes, and an event apiece would
					// have every client in the room patching state and re-rendering for a
					// marker that did not move.
					didMove: false,
					event: { conversationId, userId: currentUserId, lastReadMessageId: participant.lastReadMessageId },
				};
			}
		}

		await transaction.conversationParticipant.update({
			where: { conversationId_userId: { conversationId, userId: currentUserId } },
			data: {
				lastReadMessageId: message.id,
				// The private marker always moves — clearing your own badge is nobody
				// else's business. The shared one moves only when receipts are on and
				// direct contact is currently allowed.
				...(areReceiptsShared && { lastSharedReadMessageId: message.id }),
			},
			select: { id: true },
		});

		return {
			areReceiptsShared,
			didMove: true,
			event: { conversationId, userId: currentUserId, lastReadMessageId: message.id },
		};
	});

	if (!didMove) return event;

	if (areReceiptsShared) {
		// To the room, so the author sees "Seen" appear without polling. The reader's
		// own other tabs are in that room too, which is what keeps a badge cleared on
		// the phone from staying lit on the laptop.
		getIO().to(conversationId).emit("conversation:read", event);
	} else {
		// Only this reader's own devices. They still need the badge cleared on the
		// laptop when they read on the phone; nobody else gets told anything, which
		// is the same promise the unwritten shared marker makes.
		getIO().to(userRoom(currentUserId)).emit("conversation:read", event);
	}

	return event;
}

/**
 * Withdraws every read receipt this user has given, everywhere.
 *
 * Called when they turn receipts off. Leaving the shared markers where they are
 * would keep yesterday's "Seen" on other people's screens after a setting that
 * says otherwise — and the markers are what the DTO reads, so clearing them is
 * the whole of it.
 *
 * The broadcast is what makes it visible now rather than after a reload:
 * `conversation:updated` already carries every participant's marker, so it is
 * the event that says "these are the markers, forget what you had". One emit per
 * conversation, on an action nobody performs twice in a day.
 *
 * Exported for `users.service`, which owns the setting; the conversation-shaped
 * half of it belongs here for the same reason `assertParticipant` does.
 */
export async function clearSharedReadMarkers(userId: string): Promise<void> {
	const memberships = await prisma.conversationParticipant.findMany({
		where: { userId, lastSharedReadMessageId: { not: null } },
		select: { conversationId: true },
	});
	if (memberships.length === 0) return;

	await prisma.conversationParticipant.updateMany({
		where: { userId },
		data: { lastSharedReadMessageId: null },
	});

	const conversations = await prisma.conversation.findMany({
		where: { id: { in: memberships.map((membership) => membership.conversationId) } },
		include: conversationInclude,
	});

	for (const conversation of conversations) {
		announceConversationUpdated(conversation.id, toConversationUpdatedEvent(conversation));
	}
}
