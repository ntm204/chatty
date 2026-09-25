import type { LocalOutboxMessage } from "@/lib/local-chat-store";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useOutboxReplay } from "@/features/chat/hooks/use-outbox-replay";
import { useAuth } from "@/hooks/use-auth";
import { makeCurrentUser, makeMessage } from "./factories";

const { socketHandlers } = vi.hoisted(() => ({ socketHandlers: new Map<string, () => void>() }));
const localStore = vi.hoisted(() => ({
	readLocalOutboxForUser: vi.fn(),
	removeLocalMessage: vi.fn(),
}));

vi.mock("@/api/client", () => ({ api: { sendMessage: vi.fn() } }));
vi.mock("@/lib/local-chat-store", () => localStore);
vi.mock("@/lib/socket", () => ({
	getSocket: () => ({
		on(event: string, handler: () => void) {
			socketHandlers.set(event, handler);
		},
		off(event: string, handler: () => void) {
			if (socketHandlers.get(event) === handler) socketHandlers.delete(event);
		},
	}),
}));

function setOnline(value: boolean): void {
	Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

function makeOutboxMessage(overrides: Partial<LocalOutboxMessage> = {}): LocalOutboxMessage {
	const author = makeCurrentUser({ id: "minh" });

	return {
		id: "draft:queued",
		userId: author.id,
		conversationId: "closed-thread",
		author,
		content: "Saved while offline",
		replyTo: null,
		mentionedUserIds: [],
		createdAt: "2026-09-18T10:00:00.000Z",
		attachments: [],
		...overrides,
	};
}

function useAuthenticatedOutboxReplay(activeConversationId: string | null): void {
	const userId = useAuth((state) => state.currentUser?.id);
	useOutboxReplay({ userId, activeConversationId });
}

describe("outbox replay", () => {
	let queued: LocalOutboxMessage[];

	beforeEach(() => {
		queued = [];
		setOnline(true);
		socketHandlers.clear();
		useAuth.setState({ currentUser: makeCurrentUser({ id: "minh" }) });
		vi.mocked(api.sendMessage)
			.mockReset()
			.mockResolvedValue(makeMessage("saved", "minh", "Saved while offline"));
		localStore.readLocalOutboxForUser.mockReset().mockImplementation(async () => queued);
		localStore.removeLocalMessage.mockReset().mockImplementation(async (messageId: string) => {
			queued = queued.filter((message) => message.id !== messageId);
		});
	});

	it("replays queued text and image messages from closed conversations", async () => {
		queued = [
			makeOutboxMessage({ id: "draft:text", content: "Text after leaving" }),
			makeOutboxMessage({
				id: "draft:image",
				conversationId: "another-closed-thread",
				content: "Caption",
				createdAt: "2026-09-18T10:01:00.000Z",
				attachments: [
					{
						bytes: new Uint8Array([1, 2, 3]).buffer,
						name: "sunset.webp",
						type: "image/webp",
						lastModified: 123,
						width: 10,
						height: 20,
					},
				],
			}),
		];

		renderHook(() => useAuthenticatedOutboxReplay("open-thread"));

		await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
		expect(api.sendMessage).toHaveBeenNthCalledWith(
			1,
			"closed-thread",
			"Text after leaving",
			[],
			undefined,
			[],
			"draft:text",
		);
		const imageFiles = vi.mocked(api.sendMessage).mock.calls[1]![2] ?? [];
		expect(imageFiles).toHaveLength(1);
		expect(imageFiles[0]).toMatchObject({ name: "sunset.webp", type: "image/webp" });
		await waitFor(() => expect(queued).toEqual([]));
	});

	it("leaves the active thread to its visible draft flow, then replays it after leaving", async () => {
		queued = [makeOutboxMessage({ conversationId: "active-thread" })];
		const view = renderHook(({ activeConversationId }) => useAuthenticatedOutboxReplay(activeConversationId), {
			initialProps: { activeConversationId: "active-thread" as string | null },
		});

		await waitFor(() => expect(localStore.readLocalOutboxForUser).toHaveBeenCalled());
		expect(api.sendMessage).not.toHaveBeenCalled();
		view.rerender({ activeConversationId: null });

		await waitFor(() =>
			expect(api.sendMessage).toHaveBeenCalledWith(
				"active-thread",
				"Saved while offline",
				[],
				undefined,
				[],
				"draft:queued",
			),
		);
	});

	it("waits for the browser online signal", async () => {
		setOnline(false);
		queued = [makeOutboxMessage()];
		renderHook(() => useAuthenticatedOutboxReplay(null));

		await act(async () => {
			await Promise.resolve();
		});
		expect(localStore.readLocalOutboxForUser).not.toHaveBeenCalled();
		setOnline(true);
		act(() => window.dispatchEvent(new Event("online")));

		await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1));
	});

	it("coalesces repeated online signals while one replay is in flight", async () => {
		queued = [makeOutboxMessage()];
		let resolveSend: (value: ReturnType<typeof makeMessage>) => void = () => undefined;
		vi.mocked(api.sendMessage).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveSend = resolve;
				}),
		);
		renderHook(() => useAuthenticatedOutboxReplay(null));

		await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1));
		act(() => socketHandlers.get("connect")?.());
		expect(api.sendMessage).toHaveBeenCalledTimes(1);
		await act(async () => {
			resolveSend(makeMessage("saved", "minh", "Saved while offline"));
			await Promise.resolve();
		});

		await waitFor(() => expect(queued).toEqual([]));
		expect(api.sendMessage).toHaveBeenCalledTimes(1);
	});

	it("does not dispatch after the signed-in account changes during the outbox read", async () => {
		let resolveRead: (messages: LocalOutboxMessage[]) => void = () => undefined;
		localStore.readLocalOutboxForUser.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveRead = resolve;
				}),
		);
		renderHook(() => useAuthenticatedOutboxReplay(null));

		await waitFor(() => expect(localStore.readLocalOutboxForUser).toHaveBeenCalledTimes(1));
		act(() => useAuth.setState({ currentUser: null }));
		await act(async () => {
			resolveRead([makeOutboxMessage()]);
			await Promise.resolve();
		});

		expect(api.sendMessage).not.toHaveBeenCalled();
	});
});
