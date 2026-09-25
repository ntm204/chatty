import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useConversationVault } from "@/features/chat/hooks/use-conversation-vault";
import { makeAttachment } from "./factories";

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (event: unknown) => void>() }));
vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (event: string, handler: (event: unknown) => void) => handlers.set(event, handler),
}));
vi.mock("@/api/client", () => ({
	api: {
		getConversationVaultSummary: vi.fn(),
		listConversationMedia: vi.fn(),
		listConversationLinks: vi.fn(),
	},
}));
function photo(id: string) {
	return { ...makeAttachment({ id }), messageId: id, messageCreatedAt: "2026-09-25T00:00:00Z", authorName: "An" };
}
beforeEach(() => {
	vi.resetAllMocks();
	handlers.clear();
	vi.mocked(api.getConversationVaultSummary).mockResolvedValue({ media: 3, files: 0, voice: 0, links: 0, saved: 0 });
});

it("retains the loaded window, removes retracted media immediately and retries a failed refresh from the first page", async () => {
	vi.mocked(api.listConversationMedia)
		.mockResolvedValueOnce({ items: [photo("one"), photo("two")], hasMore: true })
		.mockResolvedValueOnce({ items: [photo("three")], hasMore: false })
		.mockResolvedValueOnce({ items: [photo("two")], hasMore: true })
		.mockRejectedValueOnce(new Error("Refresh interrupted"))
		.mockResolvedValueOnce({ items: [photo("two")], hasMore: true })
		.mockResolvedValueOnce({ items: [photo("three")], hasMore: false });
	const { result } = renderHook(() => useConversationVault("thread", "media"));
	await waitFor(() => expect(result.current.attachments).toHaveLength(2));
	await act(() => result.current.loadPage("two"));
	expect(result.current.attachments).toHaveLength(3);
	act(() => handlers.get("message:updated")?.({ conversationId: "thread", id: "one", deletedAt: "now" }));
	expect(result.current.attachments.map((item) => item.id)).toEqual(["two", "three"]);
	await waitFor(() => expect(result.current.error).toBe("Refresh interrupted"));
	expect(result.current.attachments.map((item) => item.id)).toEqual(["two", "three"]);
	await act(() => result.current.loadPage(result.current.nextCursor));
	expect(api.listConversationMedia).toHaveBeenNthCalledWith(5, "thread", "image", 40, undefined);
	expect(result.current.attachments.map((item) => item.id)).toEqual(["two", "three"]);
	expect(result.current.error).toBe("");
});

it("does not restore a stale page after switching categories and keeps cached pages on return", async () => {
	let finish!: (page: { items: ReturnType<typeof photo>[]; hasMore: boolean }) => void;
	vi.mocked(api.listConversationMedia)
		.mockResolvedValueOnce({ items: [photo("one")], hasMore: true })
		.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		)
		.mockResolvedValueOnce({ items: [photo("file")], hasMore: false });
	const { result, rerender } = renderHook(
		({ tab }: { tab: "media" | "files" }) => useConversationVault("thread", tab),
		{ initialProps: { tab: "media" } },
	);
	await waitFor(() => expect(result.current.attachments[0]?.id).toBe("one"));
	let pending!: Promise<void>;
	act(() => {
		pending = result.current.loadPage("one");
	});
	rerender({ tab: "files" });
	await waitFor(() => expect(result.current.attachments[0]?.id).toBe("file"));
	await act(async () => {
		finish({ items: [photo("stale")], hasMore: false });
		await pending;
	});
	expect(result.current.attachments[0]?.id).toBe("file");
	rerender({ tab: "media" });
	await waitFor(() => expect(result.current.attachments[0]?.id).toBe("one"));
	expect(api.listConversationMedia).toHaveBeenCalledTimes(3);
});

it("coalesces synchronous load-more requests and clears visible rows after membership loss even if reload fails", async () => {
	vi.mocked(api.listConversationMedia)
		.mockResolvedValueOnce({ items: [photo("one")], hasMore: true })
		.mockResolvedValueOnce({ items: [photo("one"), photo("two")], hasMore: false })
		.mockRejectedValueOnce(new Error("No access"));
	const { result } = renderHook(() => useConversationVault("thread", "media"));
	await waitFor(() => expect(result.current.attachments).toHaveLength(1));
	await act(async () => {
		await Promise.all([result.current.loadPage("one"), result.current.loadPage("one")]);
	});
	expect(api.listConversationMedia).toHaveBeenCalledTimes(2);
	expect(result.current.attachments.map((item) => item.id)).toEqual(["one", "two"]);
	act(() => handlers.get("conversation:left")?.({ conversationId: "thread" }));
	expect(result.current.attachments).toEqual([]);
	await waitFor(() => expect(result.current.error).toBe("No access"));
	expect(result.current.attachments).toEqual([]);
});
