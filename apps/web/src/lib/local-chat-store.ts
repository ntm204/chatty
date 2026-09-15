import { OFFLINE_BINARY_URL, OFFLINE_IMAGE_URL } from "@/constants/offline-media";
import { applyMessageUpdate } from "@/utils/apply-message-update";
import { clearMessageDrafts, getMessageDraftGeneration } from "./message-drafts";
import type { ConversationDTO, CurrentUserDTO, MessageDTO, MessageReplyDTO, UserDTO } from "@chatty/shared-types";

const DATABASE_NAME = "chatty-local";
const DATABASE_VERSION = 1;
const LAST_USER_KEY = "chatty:last-user-id";
const PROFILE_STORE = "profiles";
const CONVERSATION_STORE = "conversation-pages";
const MESSAGE_STORE = "message-snapshots";
const OUTBOX_STORE = "outbox";

interface ConversationPageRecord {
	key: string;
	userId: string;
	isArchived: boolean;
	items: ConversationDTO[];
	hasMore: boolean;
}

interface MessageSnapshotRecord {
	key: string;
	userId: string;
	conversationId: string;
	messages: MessageDTO[];
}

export interface LocalOutboxAttachment {
	bytes: ArrayBuffer;
	name: string;
	type: string;
	lastModified: number;
	width: number | null;
	height: number | null;
}

export interface LocalOutboxMessage {
	id: string;
	userId: string;
	conversationId: string;
	author: UserDTO;
	content: string;
	replyTo: MessageReplyDTO | null;
	mentionedUserIds: string[];
	createdAt: string;
	attachments: LocalOutboxAttachment[];
}

let databasePromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
	if (!("indexedDB" in globalThis)) return Promise.resolve(null);
	if (databasePromise) return databasePromise;

	databasePromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(PROFILE_STORE)) {
				database.createObjectStore(PROFILE_STORE, { keyPath: "id" });
			}
			for (const name of [CONVERSATION_STORE, MESSAGE_STORE, OUTBOX_STORE]) {
				if (database.objectStoreNames.contains(name)) continue;
				const store = database.createObjectStore(name, { keyPath: name === OUTBOX_STORE ? "id" : "key" });
				store.createIndex("by-user", "userId");
			}
			if (!request.transaction?.objectStore(OUTBOX_STORE).indexNames.contains("by-thread")) {
				request.transaction?.objectStore(OUTBOX_STORE).createIndex("by-thread", ["userId", "conversationId"]);
			}
		};
		request.onsuccess = () => {
			const database = request.result;
			database.onversionchange = () => {
				database.close();
				databasePromise = null;
			};
			resolve(database);
		};
		request.onerror = () => {
			databasePromise = null;
			reject(request.error);
		};
		request.onblocked = () => {
			databasePromise = null;
			reject(new Error("Local chat database is blocked by another tab"));
		};
	});

	return databasePromise;
}

async function readRecord<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
	const database = await openDatabase();
	if (!database) return null;

	return new Promise((resolve, reject) => {
		const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
		request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
		request.onerror = () => reject(request.error);
	});
}

async function putRecord(storeName: string, value: unknown, canWrite?: () => boolean): Promise<void> {
	const database = await openDatabase();
	if (canWrite && !canWrite()) throw new Error("The account session changed before the message could be saved");
	if (!database) {
		if (storeName === OUTBOX_STORE) throw new Error("Local message storage is unavailable");

		return;
	}

	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, "readwrite");
		transaction.objectStore(storeName).put(value);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

async function deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
	const database = await openDatabase();
	if (!database) return;

	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, "readwrite");
		transaction.objectStore(storeName).delete(key);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

async function readIndex<T>(storeName: string, indexName: string, key: IDBValidKey): Promise<T[]> {
	const database = await openDatabase();
	if (!database) return [];

	return new Promise((resolve, reject) => {
		const request = database.transaction(storeName, "readonly").objectStore(storeName).index(indexName).getAll(key);
		request.onsuccess = () => resolve(request.result as T[]);
		request.onerror = () => reject(request.error);
	});
}

function pageKey(userId: string, isArchived: boolean): string {
	return `${userId}:${isArchived ? "archived" : "active"}`;
}

function snapshotKey(userId: string, conversationId: string): string {
	return `${userId}:${conversationId}`;
}

function withoutExpiringMedia(message: MessageDTO): MessageDTO {
	const stable = { ...message };
	delete stable.clientId;

	return {
		...stable,
		attachments: stable.attachments.map((attachment) => ({
			...attachment,
			url: attachment.kind === "image" ? OFFLINE_IMAGE_URL : OFFLINE_BINARY_URL,
			thumbUrl: null,
		})),
		replyTo: stable.replyTo ? { ...stable.replyTo, attachmentUrl: null } : null,
	};
}

export async function cacheCurrentUser(user: CurrentUserDTO): Promise<void> {
	localStorage.setItem(LAST_USER_KEY, user.id);
	await putRecord(PROFILE_STORE, user);
}

export async function readCachedCurrentUser(): Promise<CurrentUserDTO | null> {
	const userId = localStorage.getItem(LAST_USER_KEY);

	return userId ? readRecord<CurrentUserDTO>(PROFILE_STORE, userId) : null;
}

export async function cacheConversationPage(
	userId: string,
	isArchived: boolean,
	items: ConversationDTO[],
	hasMore: boolean,
): Promise<void> {
	await putRecord(CONVERSATION_STORE, {
		key: pageKey(userId, isArchived),
		userId,
		isArchived,
		items: items.map((conversation) => ({
			...conversation,
			lastMessage: conversation.lastMessage ? withoutExpiringMedia(conversation.lastMessage) : null,
		})),
		hasMore,
	} satisfies ConversationPageRecord);
}

export async function readConversationPage(
	userId: string,
	isArchived: boolean,
): Promise<{ items: ConversationDTO[]; hasMore: boolean } | null> {
	const record = await readRecord<ConversationPageRecord>(CONVERSATION_STORE, pageKey(userId, isArchived));

	return record ? { items: record.items, hasMore: record.hasMore } : null;
}

export async function cacheMessageSnapshot(
	userId: string,
	conversationId: string,
	messages: MessageDTO[],
): Promise<void> {
	await putRecord(MESSAGE_STORE, {
		key: snapshotKey(userId, conversationId),
		userId,
		conversationId,
		messages: messages.map(withoutExpiringMedia),
	} satisfies MessageSnapshotRecord);
}

export async function readMessageSnapshot(userId: string, conversationId: string): Promise<MessageDTO[]> {
	return (
		(await readRecord<MessageSnapshotRecord>(MESSAGE_STORE, snapshotKey(userId, conversationId)))?.messages ?? []
	);
}

export async function enqueueLocalMessage(
	message: LocalOutboxMessage,
	generation = getMessageDraftGeneration(message.userId),
): Promise<void> {
	await putRecord(OUTBOX_STORE, message, () => getMessageDraftGeneration(message.userId) === generation);
}

export async function readLocalOutbox(userId: string, conversationId: string): Promise<LocalOutboxMessage[]> {
	const records = await readIndex<LocalOutboxMessage>(OUTBOX_STORE, "by-thread", [userId, conversationId]);

	return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function removeLocalMessage(messageId: string): Promise<void> {
	await deleteRecord(OUTBOX_STORE, messageId);
}

export async function clearLocalUserData(userId: string): Promise<void> {
	clearMessageDrafts(userId);
	// A slow cleanup from one account must not erase the pointer written by a
	// different account that signed in while IndexedDB was opening.
	try {
		if (localStorage.getItem(LAST_USER_KEY) === userId) localStorage.removeItem(LAST_USER_KEY);
	} catch {
		// Blocked localStorage must not prevent removal of IndexedDB account data.
	}
	const database = await openDatabase();
	if (!database) return;

	return new Promise((resolve, reject) => {
		const transaction = database.transaction(
			[PROFILE_STORE, CONVERSATION_STORE, MESSAGE_STORE, OUTBOX_STORE],
			"readwrite",
		);
		transaction.objectStore(PROFILE_STORE).delete(userId);
		for (const storeName of [CONVERSATION_STORE, MESSAGE_STORE, OUTBOX_STORE]) {
			const request = transaction.objectStore(storeName).index("by-user").openKeyCursor(userId);
			request.onsuccess = () => {
				const cursor = request.result;
				if (!cursor) return;
				transaction.objectStore(storeName).delete(cursor.primaryKey);
				cursor.continue();
			};
		}
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

/** Retract snapshots even when their conversation is not currently mounted. */
export async function retractCachedMessage(userId: string, message: MessageDTO): Promise<void> {
	const database = await openDatabase();
	if (!database || !message.deletedAt) return;

	return new Promise((resolve, reject) => {
		const transaction = database.transaction([MESSAGE_STORE, CONVERSATION_STORE, OUTBOX_STORE], "readwrite");
		const snapshots = transaction.objectStore(MESSAGE_STORE);
		const snapshotRequest = snapshots.get(snapshotKey(userId, message.conversationId));
		snapshotRequest.onsuccess = () => {
			const record = snapshotRequest.result as MessageSnapshotRecord | undefined;
			if (record)
				snapshots.put({
					...record,
					messages: record.messages.map((existing) =>
						withoutExpiringMedia(applyMessageUpdate(existing, message)),
					),
				});
		};
		const pages = transaction.objectStore(CONVERSATION_STORE);
		const pageRequest = pages.index("by-user").openCursor(userId);
		pageRequest.onsuccess = () => {
			const cursor = pageRequest.result;
			if (!cursor) return;
			const record = cursor.value as ConversationPageRecord;
			cursor.update({
				...record,
				items: record.items.map((conversation) =>
					conversation.id === message.conversationId
						? {
								...conversation,
								lastMessage: conversation.lastMessage
									? withoutExpiringMedia(applyMessageUpdate(conversation.lastMessage, message))
									: null,
								pinnedMessages: conversation.pinnedMessages.filter(
									(pin) => pin.messageId !== message.id,
								),
							}
						: conversation,
				),
			});
			cursor.continue();
		};
		const outboxRequest = transaction
			.objectStore(OUTBOX_STORE)
			.index("by-thread")
			.openCursor([userId, message.conversationId]);
		outboxRequest.onsuccess = () => {
			const cursor = outboxRequest.result;
			if (!cursor) return;
			const record = cursor.value as LocalOutboxMessage;
			if (record.replyTo?.id === message.id)
				cursor.update({
					...record,
					replyTo: {
						...record.replyTo,
						content: "",
						attachmentUrl: null,
						hasAttachment: false,
						isDeleted: true,
					},
				});
			cursor.continue();
		};
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}
