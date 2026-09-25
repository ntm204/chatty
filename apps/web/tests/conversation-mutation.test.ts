import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useConversationMutation } from "@/features/chat/hooks/use-conversation-mutation";

describe("conversation mutation recovery", () => {
	it("locks synchronously and preserves an actionable failure until dismissed or retried", async () => {
		let rejectRequest!: (error: Error) => void;
		const action = vi.fn(
			() =>
				new Promise<void>((_, reject) => {
					rejectRequest = reject;
				}),
		);
		const { result } = renderHook(() => useConversationMutation("one"));
		let firstPromise!: Promise<boolean>;
		let duplicatePromise!: Promise<boolean>;
		act(() => {
			firstPromise = result.current.run(action);
			duplicatePromise = result.current.run(action);
		});
		expect(action).toHaveBeenCalledTimes(1);
		expect(result.current.isSaving).toBe(true);
		expect(await duplicatePromise).toBe(false);
		await act(async () => {
			rejectRequest(new Error("Please try again"));
			expect(await firstPromise).toBe(false);
		});
		expect(result.current.error).toBe("Please try again");
		expect(result.current.isSaving).toBe(false);
		await act(async () => expect(await result.current.run(async () => undefined)).toBe(true));
		expect(result.current.error).toBe("");
	});

	it("shares one pending request and its recovery feedback across visible controls", async () => {
		let rejectRequest!: (error: Error) => void;
		const action = vi.fn(
			() =>
				new Promise<void>((_, reject) => {
					rejectRequest = reject;
				}),
		);
		const sidebar = renderHook(() => useConversationMutation("shared"));
		const details = renderHook(() => useConversationMutation("shared"));
		let firstAttempt!: Promise<boolean>;
		let duplicateAttempt!: Promise<boolean>;
		act(() => {
			firstAttempt = sidebar.result.current.run(action);
			duplicateAttempt = details.result.current.run(action);
		});

		expect(action).toHaveBeenCalledTimes(1);
		expect(sidebar.result.current.isSaving).toBe(true);
		expect(details.result.current.isSaving).toBe(true);
		expect(await duplicateAttempt).toBe(false);

		await act(async () => {
			rejectRequest(new Error("Could not save conversation"));
			expect(await firstAttempt).toBe(false);
		});
		expect(sidebar.result.current.error).toBe("Could not save conversation");
		expect(details.result.current.error).toBe("Could not save conversation");

		act(() => details.result.current.clearError());
		expect(sidebar.result.current.error).toBe("");
		expect(details.result.current.error).toBe("");
	});

	it("ignores old completions after switching away and back to the same conversation", async () => {
		let rejectRequest!: (error: Error) => void;
		const { result, rerender } = renderHook(({ id }) => useConversationMutation(id), {
			initialProps: { id: "one" },
		});
		let oldPromise!: Promise<boolean>;
		act(() => {
			oldPromise = result.current.run(
				() =>
					new Promise<void>((_, reject) => {
						rejectRequest = reject;
					}),
			);
		});
		rerender({ id: "two" });
		rerender({ id: "one" });
		expect(result.current.isSaving).toBe(false);
		await act(async () => {
			rejectRequest(new Error("Old conversation request"));
			expect(await oldPromise).toBe(false);
		});
		expect(result.current.error).toBe("");
		await act(async () => expect(await result.current.run(async () => undefined)).toBe(true));
	});

	it("does not report success to an unmounted caller", async () => {
		let resolveRequest!: () => void;
		const { result, unmount } = renderHook(() => useConversationMutation("one"));
		let requestPromise!: Promise<boolean>;
		act(() => {
			requestPromise = result.current.run(
				() =>
					new Promise<void>((resolve) => {
						resolveRequest = resolve;
					}),
			);
		});
		unmount();
		resolveRequest();
		expect(await requestPromise).toBe(false);
	});
});
