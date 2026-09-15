import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useForwardDestinations } from "@/features/chat/hooks/use-forward-destinations";
import { ForwardMessagePanel } from "@/features/chat/components/forward-message-panel";
import { makeConversation, makeMessage } from "./factories";

vi.mock("@/api/client", () => ({ api: { searchConversations: vi.fn(), forwardMessage: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

it("ignores an old query response before the new debounce finishes", async () => {
	let resolveOld!: (value: Awaited<ReturnType<typeof api.searchConversations>>) => void;
	vi.mocked(api.searchConversations)
		.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveOld = resolve;
				}),
		)
		.mockResolvedValue({ items: [makeConversation({ id: "new" })], hasMore: false });
	const { result } = renderHook(useForwardDestinations);
	await waitFor(() => expect(api.searchConversations).toHaveBeenCalledTimes(1));
	act(() => result.current.setQuery("new"));
	await act(async () => {
		resolveOld({ items: [makeConversation({ id: "old" })], hasMore: true });
	});
	expect(result.current.items).toEqual([]);
	await waitFor(() => expect(result.current.items[0]?.id).toBe("new"));
	expect(result.current.hasMore).toBe(false);
});

it("keeps a failed page's existing rows and retries the same cursor", async () => {
	vi.mocked(api.searchConversations)
		.mockResolvedValueOnce({ items: [makeConversation({ id: "first" })], hasMore: true })
		.mockRejectedValueOnce(new Error("Search interrupted"))
		.mockResolvedValueOnce({ items: [makeConversation({ id: "second" })], hasMore: false });
	const { result } = renderHook(useForwardDestinations);
	await waitFor(() => expect(result.current.items).toHaveLength(1));
	act(() => {
		result.current.loadMore();
		result.current.loadMore();
	});
	await waitFor(() => expect(result.current.error).toBe("Search interrupted"));
	expect(api.searchConversations).toHaveBeenCalledTimes(2);
	expect(result.current.items[0]?.id).toBe("first");
	act(() => result.current.retry());
	await waitFor(() => expect(result.current.items).toHaveLength(2));
	expect(api.searchConversations).toHaveBeenLastCalledWith("", "first");
});

it("retains a forwarding identity on failure and contains focus while open", async () => {
	vi.mocked(api.searchConversations).mockResolvedValue({
		items: [makeConversation({ id: "target", isGroup: true, name: "Archived group", isArchived: true })],
		hasMore: false,
	});
	vi.mocked(api.forwardMessage)
		.mockRejectedValueOnce(new Error("Forward interrupted"))
		.mockResolvedValue(makeMessage("forward", "me", "hello"));
	const onClose = vi.fn();
	render(<ForwardMessagePanel message={makeMessage("source", "me", "hello")} currentUserId="me" onClose={onClose} />);
	const destination = await screen.findByRole("button", { name: /Archived group/ });
	fireEvent.click(destination);
	await screen.findByRole("alert");
	expect(onClose).not.toHaveBeenCalled();
	fireEvent.click(destination);
	await screen.findByText("Forwarded to Archived group.");
	expect(onClose).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Done" }));
	expect(onClose).toHaveBeenCalledTimes(1);
	const calls = vi.mocked(api.forwardMessage).mock.calls;
	expect(calls[0]?.[2]).toBeTruthy();
	expect(calls[1]?.[2]).toBe(calls[0]?.[2]);
});
