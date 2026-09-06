import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { MessageContextDTO, MessageDTO, MessageEditDTO, PinnedMessageDTO } from "@chatty/shared-types";
import { Prisma } from "@prisma/client";
import {
	deleteAttachment,
	findAttachmentPath,
	saveAttachment,
	saveFileAttachment,
} from "../../lib/attachment-storage.js";
import { saveVoiceAttachment } from "../../lib/audio-storage.js";
import { extractLinks } from "../../lib/extract-links.js";
import { normalizeFileName, sniffFileMediaType } from "../../lib/file-attachment.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { readOwnedStickerPath } from "../stickers/stickers.service.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import {
	assertDirectContactAvailable,
	assertDirectConversationAvailable,
	isDirectConversationBlocked,
} from "../blocks/blocks.service.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { messageSelect, toMessageDTO, type MessageRow } from "./messages.mapper.js";
import { MESSAGE_AUTHOR_ACTION_WINDOW_MS } from "./messages.constants.js";
import type {
	EditMessageInput,
	ListMessagesQuery,
	MessageContextQuery,
	ToggleReactionInput,
} from "./messages.schema.js";

/**
 * What `sendMessage` takes. Not the Zod type: the image arrives as `req.file`
 * rather than in the body, so it never passes through a body schema.
 */
export interface SendMessageArgs {
	/** Empty string for a message that is only images. */
	content: string;
	/** In the order the sender picked them; empty for a text-only message. */
	attachments?: Buffer[] | undefined;
	file?: { buffer: Buffer; fileName: string } | undefined;
	voice?: Buffer | undefined;
	/** One of the sender's own stickers. The whole message when it is set. */
	stickerId?: string | undefined;
	/** The message being answered, already validated as a string by the schema. */
	replyToId?: string | undefined;
	forwardOfMessageId?: string | undefined;
	mentionedUserIds?: string[] | undefined;
	/** Stored as this sender's idempotency key and echoed for optimistic reconciliation. */
	clientId?: string | undefined;
}

interface StoredMessageAttachment {
	id: string;
	conversationId: string;
	position: number;
	kind: "IMAGE" | "FILE" | "AUDIO";
	mediaType: string;
	fileName: string | null;
	width: number | null;
	height: number | null;
	byteSize: number;
	durationMs: number | null;
	waveform: number[];
	hasThumbnail: boolean;
}

export async function sendMessage(
	currentUserId: string,
	conversationId: string,
	input: SendMessageArgs,
): Promise<MessageDTO> {
	// Fail before decoding/writing an attachment for the ordinary unauthorized
	// case. This is only a cheap guard; the check inside the locked transaction
	// below is the authority when membership changes concurrently.
	await assertParticipant(currentUserId, conversationId);
	// Give a blocked direct sender the cheap rejection before media decoding and
	// disk writes. This snapshot is deliberately followed by the locked check in
	// the transaction below: it improves resource use, but cannot be the policy
	// authority when a block commits concurrently.
	if (await isDirectConversationBlocked(currentUserId, conversationId)) {
		throw new ForbiddenError("This conversation is unavailable");
	}

	// Most retries never reach media processing. A response can disappear after
	// the database commit, so the same device id must retrieve that committed row
	// rather than decode/write an attachment and attempt another INSERT.
	if (input.clientId) {
		const previous = await prisma.message.findFirst({
			where: { authorId: currentUserId, clientId: input.clientId },
			select: messageSelect,
		});
		if (previous) {
			if (previous.conversationId !== conversationId) {
				throw new ValidationError("A message id cannot be reused in another conversation");
			}

			return { ...toMessageDTO(previous), clientId: input.clientId };
		}
	}
	let content = input.content;
	let forwardedSource:
		| {
				isSticker: boolean;
				attachments: {
					id: string;
					kind: "IMAGE" | "FILE" | "AUDIO";
					mediaType: string;
					fileName: string | null;
					width: number | null;
					height: number | null;
					durationMs: number | null;
					waveform: number[];
				}[];
		  }
		| undefined;

	if (input.forwardOfMessageId) {
		const source = await prisma.message.findFirst({
			where: {
				id: input.forwardOfMessageId,
				kind: "USER",
				deletedAt: null,
				hiddenFor: { none: { userId: currentUserId } },
			},
			select: {
				conversationId: true,
				content: true,
				isSticker: true,
				attachments: {
					orderBy: { position: "asc" },
					select: {
						id: true,
						kind: true,
						mediaType: true,
						fileName: true,
						width: true,
						height: true,
						durationMs: true,
						waveform: true,
					},
				},
			},
		});
		if (!source) throw new NotFoundError("Message not found");
		await assertParticipant(currentUserId, source.conversationId);
		content = source.content;
		forwardedSource = source;
	}

	// The ids are generated here, not by the database, so each file can be
	// written before the row that points at it exists. A crash between the two
	// leaves an unreferenced file, which costs bytes and is swept; the other
	// order leaves a message showing a broken image forever. Same trade the
	// avatar upload makes.
	//
	// Sequential rather than `Promise.all`: each of these decodes and re-encodes
	// a full-size image, and ten of them at once is ten sharp pipelines competing
	// for the same cores — slower in wall-clock terms and a memory spike besides.
	const storedAttachments: StoredMessageAttachment[] = [];

	// A sticker is *copied* into a fresh attachment rather than referenced.
	// Referencing would tie every message it was ever sent in to one row, so
	// removing it from the tray would blank pictures out of other people's
	// conversations — the same failure that made a message delete a tombstone.
	if (input.stickerId) {
		const stickerPath = await readOwnedStickerPath(currentUserId, input.stickerId);
		const id = randomUUID();
		storedAttachments.push({
			id,
			conversationId,
			position: 0,
			kind: "IMAGE",
			mediaType: "image/webp",
			fileName: null,
			durationMs: null,
			waveform: [],
			hasThumbnail: true,
			...(await saveAttachment(id, await readFile(stickerPath))),
		});
	}

	for (const [position, buffer] of (input.attachments ?? []).entries()) {
		const id = randomUUID();
		storedAttachments.push({
			id,
			conversationId,
			position,
			kind: "IMAGE",
			mediaType: "image/webp",
			fileName: null,
			durationMs: null,
			waveform: [],
			hasThumbnail: true,
			...(await saveAttachment(id, buffer)),
		});
	}

	if (input.file) {
		const id = randomUUID();
		storedAttachments.push({
			id,
			conversationId,
			position: 0,
			kind: "FILE",
			mediaType: await sniffFileMediaType(input.file.buffer),
			fileName: normalizeFileName(input.file.fileName),
			width: null,
			height: null,
			durationMs: null,
			waveform: [],
			hasThumbnail: false,
			...(await saveFileAttachment(id, input.file.buffer)),
		});
	}

	if (input.voice) {
		const id = randomUUID();
		const storedVoice = await saveVoiceAttachment(id, input.voice);
		storedAttachments.push({
			id,
			conversationId,
			position: 0,
			kind: "AUDIO",
			fileName: null,
			width: null,
			height: null,
			hasThumbnail: false,
			...storedVoice,
		});
	}

	if (forwardedSource) {
		for (const [position, source] of forwardedSource.attachments.entries()) {
			const sourcePath = await findAttachmentPath(source.id, source.kind);
			if (!sourcePath) throw new NotFoundError("Message attachment not found");
			const bytes = await readFile(sourcePath);
			const id = randomUUID();
			if (source.kind === "IMAGE") {
				storedAttachments.push({
					id,
					conversationId,
					position,
					kind: "IMAGE",
					mediaType: "image/webp",
					fileName: null,
					durationMs: null,
					waveform: [],
					hasThumbnail: true,
					...(await saveAttachment(id, bytes)),
				});
			} else {
				storedAttachments.push({
					id,
					conversationId,
					position,
					kind: source.kind,
					mediaType: source.mediaType,
					fileName: source.fileName,
					width: null,
					height: null,
					durationMs: source.durationMs,
					waveform: source.waveform,
					hasThumbnail: false,
					...(await saveFileAttachment(id, bytes)),
				});
			}
		}
	}

	let result: { message: MessageRow; isReplay: boolean };
	try {
		result = await prisma.$transaction(async (transaction) => {
			// Membership changes take the same conversation lock. Re-checking after it
			// means a send racing with a kick has one honest order: it either commits
			// before the removal, or observes the removal and is refused afterwards.
			await transaction.$queryRaw`
			SELECT id
			FROM "Conversation"
			WHERE id = ${conversationId}
			FOR UPDATE
		`;

			await assertParticipant(currentUserId, conversationId, transaction);

			// The conversation lock serialises two tabs replaying the same send in the
			// same thread. This second lookup closes the race after the cheap lookup
			// above while keeping expensive image work outside the transaction.
			if (input.clientId) {
				const previous = await transaction.message.findFirst({
					where: { authorId: currentUserId, clientId: input.clientId },
					select: messageSelect,
				});
				if (previous) {
					if (previous.conversationId !== conversationId) {
						throw new ValidationError("A message id cannot be reused in another conversation");
					}

					return { message: previous, isReplay: true };
				}
			}

			// The half of the reply rule no foreign key can express. Scoping the lookup
			// by `conversationId` rather than fetching the message and comparing is
			// deliberate: it cannot be got wrong by a later edit, and it never reveals
			// that an id exists somewhere the sender cannot see — a miss is a miss
			// whether the message is in another conversation or in none.
			//
			// Inside the transaction, after the membership re-check, so a reply racing
			// with a kick is refused on the same honest ordering the send itself is.
			if (input.replyToId) {
				const parent = await transaction.message.findFirst({
					where: { id: input.replyToId, conversationId },
					select: { id: true },
				});
				if (!parent) throw new ValidationError("You can only reply to a message in this conversation");
			}

			const conversation = await transaction.conversation.findUniqueOrThrow({
				where: { id: conversationId },
				select: { isGroup: true, participants: { select: { userId: true } } },
			});
			const participantIds = new Set(conversation.participants.map((participant) => participant.userId));

			// The check that actually enforces blocking. Refusing to *create* a direct
			// conversation is not enough on its own: two people who have been talking
			// for months already have one, so a block that only guarded creation would
			// stop nothing. Inside the transaction, after the lock, for the same reason
			// the membership re-check is — a send racing a block gets one honest order.
			//
			// Groups are exempt on purpose; see `blocks.service`.
			if (!conversation.isGroup) {
				const otherId = [...participantIds].find((id) => id !== currentUserId);
				if (otherId) await assertDirectContactAvailable(currentUserId, otherId, transaction);
			}

			const mentionedUserIds = [...new Set(input.mentionedUserIds ?? [])];
			if (mentionedUserIds.length > 0 && !conversation.isGroup) {
				throw new ValidationError("Mentions are only available in group conversations");
			}
			if (mentionedUserIds.some((userId) => !participantIds.has(userId))) {
				throw new ValidationError("You can only mention conversation participants");
			}

			const links = extractLinks(content);
			const created = await transaction.message.create({
				data: {
					conversationId,
					authorId: currentUserId,
					...(input.clientId ? { clientId: input.clientId } : {}),
					content,
					...(input.replyToId ? { replyToId: input.replyToId } : {}),
					...(input.stickerId || forwardedSource?.isSticker ? { isSticker: true } : {}),
					...(input.forwardOfMessageId ? { isForwarded: true } : {}),
					...(storedAttachments.length > 0
						? { attachments: { createMany: { data: storedAttachments } } }
						: {}),
					...(links.length > 0
						? {
								links: {
									createMany: {
										data: links.map((url, position) => ({ conversationId, url, position })),
									},
								},
							}
						: {}),
					...(mentionedUserIds.length > 0
						? { mentions: { createMany: { data: mentionedUserIds.map((userId) => ({ userId })) } } }
						: {}),
				},
				select: messageSelect,
			});

			// A conversation whose updatedAt disagrees with its newest message sorts
			// wrongly in the conversation list forever after.
			await transaction.conversation.update({
				where: { id: conversationId },
				data: { updatedAt: new Date() },
				select: { id: true },
			});

			return { message: created, isReplay: false };
		});
	} catch (error) {
		// Different conversations use different row locks. The database's partial
		// unique index is the final authority if two such requests race with one
		// client id; recover the winner instead of surfacing a false failure.
		if (input.clientId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
			const previous = await prisma.message.findFirst({
				where: { authorId: currentUserId, clientId: input.clientId },
				select: messageSelect,
			});
			if (previous) {
				if (previous.conversationId !== conversationId) {
					throw new ValidationError("A message id cannot be reused in another conversation");
				}
				result = { message: previous, isReplay: true };
			} else {
				throw error;
			}
		} else {
			throw error;
		}
	}

	if (result.isReplay) {
		// A concurrent request may have passed the first lookup and prepared files
		// before the locked lookup found the winner. They have no rows and are safe
		// to remove immediately instead of waiting for the orphan sweeper.
		await Promise.all(
			storedAttachments.map((attachment) =>
				deleteAttachment(attachment.id).catch((error: unknown) => {
					logger.error({ err: error, attachmentId: attachment.id }, "failed to clean up a replayed upload");
				}),
			),
		);

		return input.clientId
			? { ...toMessageDTO(result.message), clientId: input.clientId }
			: toMessageDTO(result.message);
	}

	const messageDTO = toMessageDTO(result.message);
	// Carried on the broadcast, not just the response, and that is the whole
	// point of it. The sender has drawn this message optimistically since phase
	// 19, so it needs to recognise its own draft in an event that otherwise
	// arrives looking like anybody else's message. Reconciling on the response
	// alone leaves the thread showing both copies for however long the response
	// trails the broadcast — which is usually milliseconds and, under load, was
	// long enough for a browser to catch it.
	const withClientId = input.clientId ? { ...messageDTO, clientId: input.clientId } : messageDTO;

	// Broadcast to the room, which every participant's socket joined on connect.
	// The sender receives this too, so everyone runs the same code path.
	getIO().to(conversationId).emit("message:new", withClientId);

	return withClientId;
}

export async function listMessages(
	currentUserId: string,
	conversationId: string,
	query: ListMessagesQuery,
): Promise<MessageDTO[]> {
	await assertParticipant(currentUserId, conversationId);
	if (query.after) {
		const newer = await prisma.message.findMany({
			where: { conversationId, hiddenFor: { none: { userId: currentUserId } } },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			take: query.limit,
			cursor: { id: query.after },
			skip: 1,
			select: messageSelect,
		});

		return newer.map(toMessageDTO);
	}

	const messages = await prisma.message.findMany({
		where: { conversationId, hiddenFor: { none: { userId: currentUserId } } },
		// Newest first so `take` returns the most recent page; the client reverses
		// for display. Backed by @@index([conversationId, createdAt]).
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: query.limit,
		// `before` is the id of the oldest message the client already has.
		// `skip: 1` excludes that message itself from the next page.
		...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
		select: messageSelect,
	});

	return messages.map(toMessageDTO);
}

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
}

export async function removeSavedMessage(userId: string, conversationId: string, messageId: string): Promise<void> {
	await assertParticipant(userId, conversationId);
	await prisma.messageStar.deleteMany({ where: { messageId, userId, message: { conversationId } } });
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

export async function getMessageContext(
	currentUserId: string,
	conversationId: string,
	messageId: string,
	query: MessageContextQuery,
): Promise<MessageContextDTO> {
	await assertParticipant(currentUserId, conversationId);
	const target = await prisma.message.findFirst({
		where: { id: messageId, conversationId, hiddenFor: { none: { userId: currentUserId } } },
		select: { id: true },
	});
	if (!target) throw new NotFoundError("Message not found");

	const olderLimit = Math.floor(query.limit / 2);
	const newerLimit = query.limit - olderLimit - 1;
	const [older, current, newer] = await Promise.all([
		prisma.message.findMany({
			where: { conversationId, hiddenFor: { none: { userId: currentUserId } } },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			cursor: { id: messageId },
			skip: 1,
			take: olderLimit + 1,
			select: messageSelect,
		}),
		prisma.message.findUniqueOrThrow({ where: { id: messageId }, select: messageSelect }),
		prisma.message.findMany({
			where: { conversationId, hiddenFor: { none: { userId: currentUserId } } },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			cursor: { id: messageId },
			skip: 1,
			take: newerLimit + 1,
			select: messageSelect,
		}),
	]);

	return {
		messages: [...older.slice(0, olderLimit).reverse(), current, ...newer.slice(0, newerLimit)].map(toMessageDTO),
		hasMoreOlder: older.length > olderLimit,
		hasMoreNewer: newer.length > newerLimit,
	};
}

/**
 * What survives the authorization check: the two facts either operation still
 * has to branch on. Everything else the check consumed — kind, author — has
 * already done its job by the time this is returned.
 */
interface EditableMessage {
	deletedAt: Date | null;
	attachmentIds: string[];
	content: string;
	createdAt: Date;
}

/**
 * Loads a message the caller is allowed to change, with the conversation locked.
 *
 * The lock is the same one `sendMessage` and every group mutation take, for the
 * same reason: it puts a change to a message and a change to who is in the
 * conversation into one honest order. Without it, someone removed from a group
 * could pass the membership check a moment before the removal commits.
 *
 * Called inside the caller's transaction rather than opening its own, so the
 * lock is still held when the write happens — taking it and letting go before
 * the update would order nothing.
 */
async function loadEditableMessage(
	transaction: Prisma.TransactionClient,
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<EditableMessage> {
	await transaction.$queryRaw`
		SELECT id
		FROM "Conversation"
		WHERE id = ${conversationId}
		FOR UPDATE
	`;

	await assertParticipant(currentUserId, conversationId, transaction);
	await assertDirectConversationAvailable(currentUserId, conversationId, transaction);

	const message = await transaction.message.findUnique({
		where: { id: messageId },
		select: {
			conversationId: true,
			kind: true,
			authorId: true,
			deletedAt: true,
			content: true,
			createdAt: true,
			attachments: { select: { id: true }, orderBy: { position: "asc" } },
		},
	});

	// One error for "no such message" and for "a message in a conversation you
	// are in, but not this one", so neither can be used to probe for ids — the
	// same reasoning `markConversationRead` already uses.
	if (!message || message.conversationId !== conversationId) throw new NotFoundError("Message not found");

	// Nobody wrote a system line, so there is nobody who may rewrite it. The
	// database refuses this too (see the phase 8 migration); this is the check
	// that produces a 403 instead of a 500.
	if (message.kind === "SYSTEM") throw new ForbiddenError("A system message cannot be edited or deleted");

	// ForbiddenError, not NotFoundError: the caller is already known to be in this
	// conversation and can see the message perfectly well, so hiding behind a 404
	// would only leave the UI unable to say why nothing happened.
	if (message.authorId !== currentUserId) throw new ForbiddenError("Only the author can change a message");

	return {
		deletedAt: message.deletedAt,
		attachmentIds: message.attachments.map((attachment) => attachment.id),
		content: message.content,
		createdAt: message.createdAt,
	};
}

/**
 * Replaces the text of a message the caller wrote.
 *
 * Deliberately leaves `Conversation.updatedAt` alone, unlike `sendMessage`:
 * fixing a typo in something sent last week is not new activity, and bumping it
 * would throw the thread to the top of everyone's sidebar with nothing new in
 * it. The sidebar *preview* still changes, because it reads the newest message
 * rather than a stored copy.
 */
export async function editMessage(
	currentUserId: string,
	conversationId: string,
	messageId: string,
	input: EditMessageInput,
): Promise<MessageDTO> {
	// Trimmed once, so the emptiness check and the stored value agree — the same
	// rule `sendMessageController` applies on the way in.
	const content = input.content.trim();

	const updated = await prisma.$transaction(async (transaction) => {
		const message = await loadEditableMessage(transaction, currentUserId, conversationId, messageId);

		// Editing a tombstone would have to un-delete it, and "deleted" is the one
		// state everyone else has already been told about.
		if (message.deletedAt) throw new ValidationError("This message was deleted");
		if (Date.now() - message.createdAt.getTime() >= MESSAGE_AUTHOR_ACTION_WINDOW_MS) {
			throw new ValidationError("Messages can only be edited for 8 hours");
		}

		// The send rule, restated where it still applies: a message has to be
		// something. Clearing the caption of a picture is fine; clearing the whole
		// of a text message leaves an empty bubble that only delete should produce.
		if (!content && message.attachmentIds.length === 0) {
			throw new ValidationError("A message needs text, an image, or both");
		}

		await transaction.messageEdit.create({
			data: { messageId, content: message.content },
			select: { id: true },
		});
		await transaction.messageLink.deleteMany({ where: { messageId } });
		await transaction.messageMention.deleteMany({ where: { messageId } });
		const links = extractLinks(content);
		if (links.length > 0) {
			await transaction.messageLink.createMany({
				data: links.map((url, position) => ({ messageId, conversationId, url, position })),
			});
		}

		return transaction.message.update({
			where: { id: messageId },
			data: { content, editedAt: new Date() },
			select: messageSelect,
		});
	});

	const messageDTO = toMessageDTO(updated);

	getIO().to(conversationId).emit("message:updated", messageDTO);

	return messageDTO;
}

export async function listMessageEdits(
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<MessageEditDTO[]> {
	await assertParticipant(currentUserId, conversationId);
	const message = await prisma.message.findFirst({
		where: { id: messageId, conversationId, hiddenFor: { none: { userId: currentUserId } } },
		select: { edits: { orderBy: { editedAt: "desc" }, select: { id: true, content: true, editedAt: true } } },
	});
	if (!message) throw new NotFoundError("Message not found");

	return message.edits.map((edit) => ({ ...edit, editedAt: edit.editedAt.toISOString() }));
}

export async function hideMessageForUser(
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<void> {
	await assertParticipant(currentUserId, conversationId);
	const message = await prisma.message.findFirst({ where: { id: messageId, conversationId }, select: { id: true } });
	if (!message) throw new NotFoundError("Message not found");

	await prisma.messageHiddenFor.upsert({
		where: { messageId_userId: { messageId, userId: currentUserId } },
		create: { messageId, userId: currentUserId },
		update: {},
	});
	getIO().to(userRoom(currentUserId)).emit("message:hidden", { conversationId, messageId });
}

/**
 * Deletes a message the caller wrote, leaving a tombstone in its place.
 *
 * Idempotent: deleting an already-deleted message returns it unchanged and
 * broadcasts nothing. Two tabs pressing the button is the ordinary case, not an
 * error worth reporting.
 */
export async function deleteMessage(
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<MessageDTO> {
	const { deleted, removedAttachmentIds, wasAlreadyDeleted } = await prisma.$transaction(async (transaction) => {
		const message = await loadEditableMessage(transaction, currentUserId, conversationId, messageId);

		if (message.deletedAt) {
			const unchanged = await transaction.message.findUniqueOrThrow({
				where: { id: messageId },
				select: messageSelect,
			});

			return { deleted: unchanged, removedAttachmentIds: [], wasAlreadyDeleted: true };
		}
		if (Date.now() - message.createdAt.getTime() >= MESSAGE_AUTHOR_ACTION_WINDOW_MS) {
			throw new ValidationError("Messages can only be deleted for everyone for 8 hours");
		}

		// The attachment rows go with the text. Leaving them would keep serving the
		// pictures — the images are the part of an image message worth deleting.
		if (message.attachmentIds.length > 0) {
			await transaction.attachment.deleteMany({ where: { messageId } });
		}
		await transaction.messageLink.deleteMany({ where: { messageId } });
		await transaction.messageMention.deleteMany({ where: { messageId } });

		const updated = await transaction.message.update({
			where: { id: messageId },
			// Emptied, not hidden: a client that forgets to check `deletedAt` then
			// renders nothing rather than the message. The check constraint added
			// with this feature is what keeps that true of every future write.
			data: { content: "", deletedAt: new Date() },
			select: messageSelect,
		});

		return { deleted: updated, removedAttachmentIds: message.attachmentIds, wasAlreadyDeleted: false };
	});

	// After the commit, and on purpose. The other order — file first — leaves a
	// message pointing at a picture that is gone if the transaction then rolls
	// back, which is the broken-image case `sendMessage` also refuses to risk.
	// A crash here instead leaves an unreferenced file, which costs bytes.
	for (const attachmentId of removedAttachmentIds) {
		await deleteAttachment(attachmentId).catch((error: unknown) => {
			// Not rethrown, and the loop is not abandoned: the message *is* deleted,
			// and failing the request now would tell the caller otherwise. One file
			// that will not unlink must not strand the nine behind it either — each
			// is independent, and the sweep picks up whatever is left.
			logger.error({ err: error, attachmentId }, "failed to remove attachment file");
		});
	}

	const messageDTO = toMessageDTO(deleted);

	// Nothing to announce when it was already a tombstone: everyone was told the
	// first time, and a second event would only re-render what is already there.
	if (!wasAlreadyDeleted) getIO().to(conversationId).emit("message:updated", messageDTO);

	return messageDTO;
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
