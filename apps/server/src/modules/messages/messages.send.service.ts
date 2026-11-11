/**
 * Sending a message: text, images, files, voice, stickers, replies, mentions and
 * forwards, with idempotent retries and the media written before the row.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { MessageDTO } from "@chatty/shared-types";
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
import { getIO } from "../../lib/socket-bus.js";
import { assertDirectContactAvailable, isDirectConversationBlocked } from "../blocks/blocks.service.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { messageSelect, toMessageDTO, type MessageRow } from "./messages.mapper.js";

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
	/** A built-in animated sticker, already checked against the list by the schema. */
	stickerKey?: string | undefined;
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

async function discardPreparedAttachments(attachmentIds: string[]): Promise<void> {
	await Promise.all(
		attachmentIds.map((attachmentId) =>
			deleteAttachment(attachmentId).catch((error: unknown) => {
				logger.error({ err: error, attachmentId }, "failed to clean up an uncommitted upload");
			}),
		),
	);
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
				id: string;
				conversationId: string;
				isSticker: boolean;
				stickerKey: string | null;
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
				id: true,
				conversationId: true,
				content: true,
				isSticker: true,
				stickerKey: true,
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
	// A writer can make a file and then reject (for example when writing one of
	// an image's two representations fails). Record its key before invoking it,
	// because a row-shaped `StoredMessageAttachment` only exists after success.
	const preparedAttachmentIds: string[] = [];

	let result: { message: MessageRow; isReplay: boolean };
	try {
		// A sticker is *copied* into a fresh attachment rather than referenced.
		// Referencing would tie every message it was ever sent in to one row, so
		// removing it from the tray would blank pictures out of other people's
		// conversations — the same failure that made a message delete a tombstone.
		if (input.stickerId) {
			const stickerPath = await readOwnedStickerPath(currentUserId, input.stickerId);
			const id = randomUUID();
			preparedAttachmentIds.push(id);
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
			preparedAttachmentIds.push(id);
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
			preparedAttachmentIds.push(id);
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
			preparedAttachmentIds.push(id);
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
				preparedAttachmentIds.push(id);
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

		try {
			result = await prisma.$transaction(async (transaction) => {
				// Forwarding depends on two memberships. Lock in one deterministic order
				// so simultaneous A → B and B → A forwards cannot deadlock, and source
				// edits, retractions, hides and removals have one order with the send.
				const conversationIds = [
					...new Set([conversationId, ...(forwardedSource ? [forwardedSource.conversationId] : [])]),
				];
				await transaction.$queryRaw`
					SELECT id FROM "Conversation"
					WHERE id IN (${Prisma.join(conversationIds)})
					ORDER BY id
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

				if (forwardedSource) {
					await assertParticipant(currentUserId, forwardedSource.conversationId, transaction);
					const source = await transaction.message.findFirst({
						where: {
							id: forwardedSource.id,
							conversationId: forwardedSource.conversationId,
							kind: "USER",
							deletedAt: null,
							hiddenFor: { none: { userId: currentUserId } },
						},
						select: { content: true },
					});
					if (!source) throw new NotFoundError("Message not found");
					// Attachments are immutable while a message is live. Text can be edited
					// during media preparation, so copy the current caption under the lock.
					content = source.content;
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
						...(input.stickerKey || forwardedSource?.stickerKey
							? { stickerKey: input.stickerKey ?? forwardedSource?.stickerKey ?? null }
							: {}),
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
	} catch (error) {
		await discardPreparedAttachments(preparedAttachmentIds);
		throw error;
	}

	if (result.isReplay) {
		// A concurrent request may have passed the first lookup and prepared files
		// before the locked lookup found the winner. They have no rows and are safe
		// to remove immediately instead of waiting for the orphan sweeper.
		await discardPreparedAttachments(preparedAttachmentIds);

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
