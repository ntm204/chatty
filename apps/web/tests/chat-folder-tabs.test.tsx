import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ChatFolderTabs } from "@/features/chat/sidebar/components/chat-folder-tabs";
import type { ChatFolder, FolderSummary } from "@/features/chat/sidebar/types/conversation-list";
import { summarizeFolders } from "@/features/chat/sidebar/utils/summarize-folders";
import { makeConversation } from "./factories";

function summary(partial: Partial<Record<ChatFolder, FolderSummary>>): Record<ChatFolder, FolderSummary> {
	const empty = { total: 0, unread: 0 };

	return { all: empty, unread: empty, groups: empty, direct: empty, ...partial };
}

it("always shows the four folders, and dots each folder with something unread", () => {
	const { rerender } = render(
		<ChatFolderTabs folder="all" summary={summary({ all: { total: 2, unread: 0 } })} onChange={vi.fn()} />,
	);
	expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["All", "Unread", "Groups", "Direct"]);

	rerender(
		<ChatFolderTabs
			folder="all"
			summary={summary({
				all: { total: 3, unread: 2 },
				unread: { total: 2, unread: 2 },
				groups: { total: 1, unread: 1 },
				direct: { total: 2, unread: 1 },
			})}
			onChange={vi.fn()}
		/>,
	);
	expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
	expect(screen.getByRole("tab", { name: "Unread, 2 chats" })).toBeInTheDocument();
	expect(screen.getByRole("tab", { name: "Groups, 1 chat" })).toBeInTheDocument();
	// A dot, never a number widening the chip: the count is for screen readers only.
	const direct = screen.getByRole("tab", { name: "Direct, 1 chat" });
	expect(direct.querySelector('[aria-hidden="true"].rounded-full')).not.toBeNull();
	expect(direct.querySelector(".sr-only")).toHaveTextContent("1 chat");
});

it("moves between folders with the arrow keys, wrapping at the ends", async () => {
	const onChange = vi.fn();
	render(<ChatFolderTabs folder="direct" summary={summary({ all: { total: 1, unread: 0 } })} onChange={onChange} />);

	screen.getByRole("tab", { name: "Direct" }).focus();
	await userEvent.keyboard("{ArrowRight}");
	expect(onChange).toHaveBeenLastCalledWith("all");
	await userEvent.keyboard("{ArrowLeft}");
	expect(onChange).toHaveBeenLastCalledWith("groups");
});

it("counts a muted chat in its folder but not as unread", () => {
	const muted = makeConversation({ id: "m", unreadCount: 3, mutedUntil: "2099-01-01T00:00:00.000Z" });
	const loud = makeConversation({ id: "l", unreadCount: 1, isGroup: true });
	const result = summarizeFolders([muted, loud]);

	expect(result.all).toEqual({ total: 2, unread: 1 });
	expect(result.groups).toEqual({ total: 1, unread: 1 });
	expect(result.direct).toEqual({ total: 1, unread: 0 });
});
