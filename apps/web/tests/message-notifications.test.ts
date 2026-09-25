import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessageNotifications } from "@/features/chat/hooks/use-message-notifications";
import { api } from "@/api/client";
import { useAuth } from "@/hooks/use-auth";
import { useRestrictedUsers } from "@/hooks/use-restricted-users";
import { useNotificationSetting } from "@/hooks/use-notification-setting";
import { makeCurrentUser, makeConversation, makeMessage } from "./factories";

type SocketHandler = (payload: unknown) => void;
const { handlers, notificationSpy, notificationCloseSpy } = vi.hoisted(() => ({
	handlers: new Map<string, SocketHandler>(),
	notificationSpy: vi.fn(),
	notificationCloseSpy: vi.fn(),
}));

vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (eventName: string, handler: SocketHandler) => handlers.set(eventName, handler),
}));
vi.mock("@/api/client", () => ({ api: { getConversation: vi.fn(), getRestrictionStatus: vi.fn() } }));

class NotificationMock {
	static permission = "granted";
	static instances: NotificationMock[] = [];
	onclick: ((event: Event) => void) | null = null;
	onclose: ((event: Event) => void) | null = null;

	constructor(title: string, options?: NotificationOptions) {
		notificationSpy(title, options);
		NotificationMock.instances.push(this);
	}

	close() {
		notificationCloseSpy();
		this.onclose?.(new Event("close"));
	}
}

beforeEach(() => {
	useAuth.setState({ currentUser: makeCurrentUser() });
	useNotificationSetting.setState({ isEnabled: true, isMessagePreviewEnabled: true });
	useRestrictedUsers.setState({ restrictedIds: new Set(), checkedIds: new Set(["an"]) });
	vi.mocked(api.getConversation).mockReset();
	vi.mocked(api.getRestrictionStatus).mockReset().mockResolvedValue({ isRestricted: false });
	handlers.clear();
	notificationSpy.mockReset();
	notificationCloseSpy.mockReset();
	NotificationMock.instances = [];
	localStorage.clear();
	vi.stubGlobal("Notification", NotificationMock);
	vi.stubGlobal("BroadcastChannel", undefined);
	Object.defineProperty(navigator, "locks", {
		configurable: true,
		value: {
			request: <Value>(
				_name: string,
				_options: LockOptions,
				callback: LockGrantedCallback<Value>,
			): Promise<Value> => Promise.resolve(callback({ name: "test", mode: "exclusive" } as Lock)),
		},
	});
	Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
});

afterEach(() => {
	vi.unstubAllGlobals();
	delete (navigator as { locks?: unknown }).locks;
	Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("useMessageNotifications", () => {
	it("suppresses ordinary messages from a muted conversation", async () => {
		renderHook(() =>
			useMessageNotifications("minh", [makeConversation({ mutedUntil: "9999-12-31T23:59:59.999Z" })]),
		);

		await act(async () => {
			handlers.get("message:new")?.(makeMessage("message-1", "an", "quiet"));
		});

		expect(notificationSpy).not.toHaveBeenCalled();
	});

	it("lets an explicit mention override mute", async () => {
		renderHook(() =>
			useMessageNotifications("minh", [makeConversation({ mutedUntil: "9999-12-31T23:59:59.999Z" })]),
		);
		const message = { ...makeMessage("message-1", "an", "@minh look"), mentionedUserIds: ["minh"] };

		handlers.get("message:new")?.(message);

		await waitFor(() =>
			expect(notificationSpy).toHaveBeenCalledWith("an", expect.objectContaining({ body: "@minh look" })),
		);
	});
	it("looks up missing sidebar metadata and suppresses an archived muted thread", async () => {
		vi.mocked(api.getConversation).mockResolvedValue(
			makeConversation({ isArchived: true, mutedUntil: "9999-12-31T23:59:59.999Z" }),
		);
		renderHook(() => useMessageNotifications("minh", []));
		await act(async () => {
			handlers.get("message:new")?.(makeMessage("message-1", "an", "quiet"));
		});
		await waitFor(() => expect(api.getConversation).toHaveBeenCalledTimes(1));
		await Promise.resolve();
		expect(notificationSpy).not.toHaveBeenCalled();
	});

	it("restrict suppresses even mentions in a DM but does not silence a shared group", async () => {
		useRestrictedUsers.setState({ restrictedIds: new Set(["an"]), checkedIds: new Set(["an"]) });
		renderHook(() =>
			useMessageNotifications("minh", [makeConversation(), makeConversation({ id: "group", isGroup: true })]),
		);
		const message = { ...makeMessage("restricted", "an", "@minh"), mentionedUserIds: ["minh"] };
		await act(async () => {
			handlers.get("message:new")?.(message);
		});
		expect(notificationSpy).not.toHaveBeenCalled();
		await act(async () => {
			handlers.get("message:new")?.({ ...message, conversationId: "group" });
		});
		await waitFor(() => expect(notificationSpy).toHaveBeenCalledTimes(1));
	});

	it("focuses the tab and opens the received conversation when a popup is clicked", async () => {
		const openConversation = vi.fn();
		const focusWindow = vi.spyOn(window, "focus").mockImplementation(() => undefined);
		renderHook(() => useMessageNotifications("minh", [makeConversation()], openConversation));
		handlers.get("message:new")?.(makeMessage("click-message", "an", "open this"));

		await waitFor(() => expect(NotificationMock.instances).toHaveLength(1));
		await act(async () => {
			NotificationMock.instances[0]?.onclick?.(new Event("click"));
		});

		expect(focusWindow).toHaveBeenCalledTimes(1);
		expect(openConversation).toHaveBeenCalledWith("conversation-1");
		expect(notificationCloseSpy).toHaveBeenCalledTimes(1);
	});

	it("hides sender and message text when the preview setting is off", async () => {
		useNotificationSetting.setState({ isMessagePreviewEnabled: false });
		renderHook(() => useMessageNotifications("minh", [makeConversation()]));
		handlers.get("message:new")?.(makeMessage("private-preview", "an", "do not reveal this"));

		await waitFor(() =>
			expect(notificationSpy).toHaveBeenCalledWith("Chatty", expect.objectContaining({ body: "New message" })),
		);
	});

	it("closes hook-owned popups when the signed-in account changes", async () => {
		const { rerender } = renderHook(
			({ userId }: { userId: string }) => useMessageNotifications(userId, [makeConversation()]),
			{ initialProps: { userId: "minh" } },
		);
		handlers.get("message:new")?.(makeMessage("logout-popup", "an", "bye"));
		await waitFor(() => expect(NotificationMock.instances).toHaveLength(1));

		rerender({ userId: "" });

		expect(notificationCloseSpy).toHaveBeenCalledTimes(1);
	});

	it("drops a delayed notification after the reader logs out", async () => {
		let resolveContext!: (value: ReturnType<typeof makeConversation>) => void;
		vi.mocked(api.getConversation).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveContext = resolve;
				}),
		);
		renderHook(() => useMessageNotifications("minh", []));
		handlers.get("message:new")?.(makeMessage("delayed", "an", "private"));
		useAuth.setState({ currentUser: null });
		await act(async () => {
			resolveContext(makeConversation());
		});
		expect(notificationSpy).not.toHaveBeenCalled();
	});
	it("suppresses an in-flight lookup if mute or membership changes before it returns", async () => {
		let resolveContext!: (value: ReturnType<typeof makeConversation>) => void;
		vi.mocked(api.getConversation).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveContext = resolve;
				}),
		);
		renderHook(() => useMessageNotifications("minh", []));
		handlers.get("message:new")?.(makeMessage("delayed", "an", "quiet after mute"));
		await act(async () => {
			handlers.get("conversation:self-updated")?.({
				conversationId: "conversation-1",
				mutedUntil: "9999-12-31T23:59:59Z",
			});
			resolveContext(makeConversation());
		});
		expect(notificationSpy).not.toHaveBeenCalled();
	});
});
