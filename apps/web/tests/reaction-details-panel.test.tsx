import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReactionDetailsPanel } from "@/features/chat/components/reaction-details-panel";
import { makeUser } from "./factories";

it("supports arrow navigation and falls back to All when the selected reaction disappears", () => {
	const user = makeUser("an", "An Nguyễn ".repeat(10));
	const props = { users: [user], currentUserId: "me", onClose: vi.fn() };
	const view = render(
		<ReactionDetailsPanel
			{...props}
			reactions={[
				{ emoji: "❤️", userIds: [user.id] },
				{ emoji: "👍", userIds: ["me"] },
			]}
		/>,
	);
	const all = screen.getByRole("tab", { name: "All 2" });
	all.focus();
	fireEvent.keyDown(all, { key: "ArrowRight" });
	expect(screen.getByRole("tab", { name: "❤️, 1" })).toHaveFocus();
	expect(screen.getByRole("tab", { name: "❤️, 1" })).toHaveAttribute("aria-selected", "true");
	view.rerender(<ReactionDetailsPanel {...props} reactions={[{ emoji: "👍", userIds: [user.id] }]} />);
	expect(screen.getByText(user.displayName.trim())).toBeVisible();
});
