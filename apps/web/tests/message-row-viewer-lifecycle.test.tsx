import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MessageRows } from "@/features/chat/components/message-rows";
import type { ThreadMessage } from "@/features/chat/types/thread-message";
import { makeAttachment, makeMessage, makeParticipant } from "./factories";

vi.mock("@/hooks/use-back-dismiss", () => ({ useBackDismiss: vi.fn() }));

it("keeps the selected gallery open through upload acknowledgement and later history updates", () => {
	const draft: ThreadMessage = {
		...makeMessage("draft:upload", "minh", "Album", [
			makeAttachment({ id: "local-one", url: "blob:one" }),
			makeAttachment({ id: "local-two", url: "blob:two" }),
		]),
		deliveryState: "pending",
	};
	const props: ComponentProps<typeof MessageRows> = {
		messages: [draft],
		currentUserId: "minh",
		participants: [makeParticipant("minh", "Minh")],
		isGroup: false,
		themeColor: null,
		readReceipt: null,
		unreadDividerMessageId: null,
		unreadCount: 0,
		editingMessageId: null,
		pinnedMessageIds: [],
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
	const { rerender } = render(<MessageRows {...props} />);
	fireEvent.click(screen.getByRole("button", { name: "Open album of 2 images and its caption" }));
	fireEvent.click(screen.getByRole("button", { name: "Next image" }));
	const viewer = screen.getByRole("dialog", { name: "Image 2 of 2" });
	const confirmed = {
		...makeMessage("confirmed-upload", "minh", "Album", [
			makeAttachment({ id: "server-one", url: "http://api.test/one" }),
			makeAttachment({ id: "server-two", url: "http://api.test/two" }),
		]),
		clientId: draft.id,
	};
	rerender(<MessageRows {...props} messages={[confirmed]} />);
	expect(screen.getByRole("dialog", { name: "Image 2 of 2" })).toBe(viewer);
	expect(within(viewer).getByAltText("Album")).toHaveAttribute("src", "http://api.test/two");
	const historyMessage = makeMessage(confirmed.id, "minh", "Album", confirmed.attachments);
	rerender(<MessageRows {...props} messages={[historyMessage]} />);
	expect(screen.getByRole("dialog", { name: "Image 2 of 2" })).toBe(viewer);
	fireEvent.click(within(viewer).getByRole("button", { name: "Close image preview" }));
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
