import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ChatFolderTabs } from "@/features/chat/sidebar/components/chat-folder-tabs";

it("marks unread with a dot outside the label — no number widening the tab — and says the count to screen readers", () => {
	const { rerender } = render(<ChatFolderTabs folder="all" unreadCount={12} onChange={vi.fn()} />);
	const tab = screen.getByRole("tab", { name: "Unread, 12 chats" });

	expect(tab).not.toHaveTextContent(/^Unread12/u);
	expect(tab.querySelector('[aria-hidden="true"].rounded-full')).not.toBeNull();
	expect(tab.querySelector(".sr-only")).toHaveTextContent("12 chats");

	rerender(<ChatFolderTabs folder="all" unreadCount={0} onChange={vi.fn()} />);
	expect(screen.getByRole("tab", { name: "Unread" })).toBeInTheDocument();
	expect(screen.getByRole("tab", { name: "Unread" }).querySelector(".rounded-full")).toBeNull();
});
