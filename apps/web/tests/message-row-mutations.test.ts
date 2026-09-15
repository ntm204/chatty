import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useMessageRowMutations } from "@/features/chat/hooks/use-message-row-mutations";
import type { MessageRowActions } from "@/features/chat/types/message-row-actions";
import { makeMessage } from "./factories";

function makeActions(): MessageRowActions {
	return {
		onStartEdit: vi.fn(),
		onSaveEdit: vi.fn(),
		onCancelEdit: vi.fn(),
		onDeleteMessage: vi.fn(),
		onHideMessage: vi.fn(),
		onShowHistory: vi.fn(),
		onRetrySend: vi.fn(),
		onDiscardDraft: vi.fn(),
		onToggleReaction: vi.fn(),
		onShowReactions: vi.fn(),
		onReplyToMessage: vi.fn(),
		onForwardMessage: vi.fn(),
		onTogglePinMessage: vi.fn(),
		onJumpToMessage: vi.fn(),
	};
}

it("locks concurrent row writes, catches failure, and only retries on an explicit action", async () => {
	const actions = makeActions();
	let reject!: (error: Error) => void;
	vi.mocked(actions.onToggleReaction).mockImplementationOnce(
		() =>
			new Promise<void>((_resolve, rejectRequest) => {
				reject = rejectRequest;
			}),
	);
	const { result } = renderHook(() => useMessageRowMutations(makeMessage("m1", "me", "hello"), false, actions));
	let pending!: Promise<void>;
	act(() => {
		pending = result.current.onToggleReaction("❤️");
		void result.current.onToggleReaction("❤️");
		void result.current.onDeleteForEveryone();
	});
	expect(result.current.isPending).toBe(true);
	expect(actions.onToggleReaction).toHaveBeenCalledTimes(1);
	expect(actions.onDeleteMessage).not.toHaveBeenCalled();
	await act(async () => {
		reject(new Error("offline"));
		await pending;
	});
	expect(result.current.isPending).toBe(false);
	expect(result.current.error).toContain("Could not confirm your reaction");
	expect(actions.onToggleReaction).toHaveBeenCalledTimes(1);
	await act(async () => {
		await result.current.onToggleReaction("❤️");
	});
	expect(actions.onToggleReaction).toHaveBeenCalledTimes(2);
	expect(result.current.error).toBeNull();
});

it.each(["onDeleteForEveryone", "onDeleteForMe", "onTogglePin"] as const)(
	"contains a synchronous failure from %s",
	async (action) => {
		const actions = makeActions();
		for (const callback of [actions.onDeleteMessage, actions.onHideMessage, actions.onTogglePinMessage]) {
			vi.mocked(callback).mockImplementation(() => {
				throw new Error("failed");
			});
		}
		const { result } = renderHook(() => useMessageRowMutations(makeMessage("m1", "me", "hello"), false, actions));
		await act(async () => {
			await result.current[action]();
		});
		expect(result.current.isPending).toBe(false);
		expect(result.current.error).toContain("Could not confirm");
	},
);
