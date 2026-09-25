import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { ConversationMessageSearch } from "@/features/chat/components/conversation-message-search";
import { makeMessage, makeUser } from "./factories";

vi.mock("@/features/chat/hooks/use-socket-event", () => ({ useSocketEvent: vi.fn() }));

const results = ["new", "old"].map((id) => ({
	message: { ...makeMessage(id, "an", `deployment ${id}`), conversationId: "c1" },
	conversation: {
		id: "c1",
		isGroup: false,
		name: null,
		participants: [makeUser("minh", "Minh"), makeUser("an", "An")],
	},
}));

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	vi.spyOn(api, "searchMessages").mockResolvedValue({ results, hasMore: false });
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("ConversationMessageSearch", () => {
	it("keeps IME keys local and clears the query without closing search", async () => {
		const onClose = vi.fn();
		const onSelect = vi.fn();
		render(
			<ConversationMessageSearch
				conversationId="c1"
				onClose={onClose}
				onSelectResult={onSelect}
				onClearResult={vi.fn()}
			/>,
		);
		const field = screen.getByLabelText("Search in conversation");
		await userEvent.type(field, "deployment");
		await vi.advanceTimersByTimeAsync(500);
		onSelect.mockClear();
		for (const key of ["Enter", "Escape", "ArrowDown"]) fireEvent.keyDown(field, { key, isComposing: true });
		expect(onClose).not.toHaveBeenCalled();
		expect(onSelect).not.toHaveBeenCalled();
		await userEvent.click(screen.getByRole("button", { name: "Clear conversation search" }));
		expect(field).toHaveValue("");
		expect(field).toHaveFocus();
	});
	it("focuses the input and scopes the request to the open conversation", async () => {
		const onSelectResult = vi.fn();
		render(
			<ConversationMessageSearch
				conversationId="c1"
				onSelectResult={onSelectResult}
				onClearResult={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		const box = screen.getByLabelText("Search in conversation");
		expect(box).toHaveFocus();

		await userEvent.type(box, "deployment");
		await vi.advanceTimersByTimeAsync(500);

		await waitFor(() => expect(api.searchMessages).toHaveBeenCalledWith("deployment", 20, "c1"));
		await waitFor(() =>
			expect(onSelectResult).toHaveBeenCalledWith({ query: "deployment", results, activeIndex: 0 }),
		);
		expect(screen.getByText("1 of 2")).toBeInTheDocument();
	});

	it("closes with Escape", async () => {
		const onClose = vi.fn();
		render(
			<ConversationMessageSearch
				conversationId="c1"
				onSelectResult={vi.fn()}
				onClearResult={vi.fn()}
				onClose={onClose}
			/>,
		);

		await userEvent.type(screen.getByLabelText("Search in conversation"), "{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("moves between results with the arrow keys and applies the current result with Enter", async () => {
		const onSelectResult = vi.fn();
		render(
			<ConversationMessageSearch
				conversationId="c1"
				onSelectResult={onSelectResult}
				onClearResult={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		const box = screen.getByLabelText("Search in conversation");
		await userEvent.type(box, "deployment");
		await vi.advanceTimersByTimeAsync(500);
		await waitFor(() => expect(screen.getByText("1 of 2")).toBeInTheDocument());
		onSelectResult.mockClear();

		await userEvent.keyboard("{ArrowDown}");
		expect(screen.getByText("2 of 2")).toBeInTheDocument();
		expect(onSelectResult).toHaveBeenLastCalledWith({ query: "deployment", results, activeIndex: 1 });

		await userEvent.keyboard("{Enter}");
		expect(onSelectResult).toHaveBeenCalledTimes(2);
		expect(onSelectResult).toHaveBeenLastCalledWith({ query: "deployment", results, activeIndex: 1 });

		await userEvent.keyboard("{ArrowUp}");
		expect(screen.getByText("1 of 2")).toBeInTheDocument();
		expect(onSelectResult).toHaveBeenLastCalledWith({ query: "deployment", results, activeIndex: 0 });
	});

	it("loads the next stable cursor page from the oldest result", async () => {
		const olderResult = {
			...results[1]!,
			message: { ...results[1]!.message, id: "oldest", createdAt: "2026-08-20T10:00:00.000Z" },
		};
		const nextResult = {
			...results[1]!,
			message: { ...results[1]!.message, id: "older", createdAt: "2026-08-19T10:00:00.000Z" },
		};
		vi.mocked(api.searchMessages)
			.mockResolvedValueOnce({ results: [results[0]!, olderResult], hasMore: true })
			.mockResolvedValueOnce({ results: [nextResult], hasMore: false });
		render(
			<ConversationMessageSearch
				conversationId="c1"
				onSelectResult={vi.fn()}
				onClearResult={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		await userEvent.type(screen.getByLabelText("Search in conversation"), "deployment");
		await vi.advanceTimersByTimeAsync(500);
		await waitFor(() => expect(screen.getByText("1 of 2")).toBeInTheDocument());
		await userEvent.click(screen.getByLabelText("Older search result"));
		await userEvent.click(screen.getByRole("button", { name: "More" }));

		await waitFor(() =>
			expect(api.searchMessages).toHaveBeenLastCalledWith(
				"deployment",
				20,
				"c1",
				olderResult.message.createdAt,
				olderResult.message.id,
			),
		);
		await waitFor(() => expect(screen.getByText("2 of 3")).toBeInTheDocument());
	});
});
