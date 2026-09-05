import type { ComponentProps } from "react";
import { fireEvent, render, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRows } from "@/features/chat/components/message-rows";
import type { MessageBubble } from "@/features/chat/components/message-bubble";
import type { MessageActions } from "@/features/chat/components/message-actions";
import { makeMessage, makeParticipant } from "./factories";

const { renderedIds } = vi.hoisted(() => ({ renderedIds: [] as string[] }));
vi.mock("@/features/chat/components/message-bubble", () => ({
	MessageBubble: ({ message, onForward }: ComponentProps<typeof MessageBubble>) => {
		renderedIds.push(message.id);

		return <button onClick={onForward}>{message.content}</button>;
	},
}));
vi.mock("@/features/chat/components/message-actions", () => ({
	MessageActions: ({ onTogglePin }: ComponentProps<typeof MessageActions>) => (
		<button onClick={onTogglePin}>Toggle pin</button>
	),
}));

function makeProps(): ComponentProps<typeof MessageRows> {
	return {
		messages: Array.from({ length: 200 }, (_, index) => makeMessage(`m${index}`, "an", `message ${index}`)),
		currentUserId: "minh",
		participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
		isGroup: false,
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
		onSaveMessage: vi.fn(),
		onTogglePinMessage: vi.fn(),
		onJumpToMessage: vi.fn(),
	};
}

beforeEach(() => {
	renderedIds.length = 0;
});

describe("MessageRow memo boundary", () => {
	it("skips all 200 unchanged rows even when the list array is replaced", () => {
		const props = makeProps();
		const view = render(<MessageRows {...props} />);
		expect(renderedIds).toHaveLength(200);
		renderedIds.length = 0;

		view.rerender(<MessageRows {...props} messages={[...props.messages]} />);
		expect(renderedIds).toEqual([]);
	});

	it("renders only an edited row and forwards its current message", () => {
		const props = makeProps();
		const view = render(<MessageRows {...props} />);
		renderedIds.length = 0;
		const edited = { ...props.messages[100]!, content: "edited content", editedAt: "2026-09-05T01:00:00Z" };

		view.rerender(
			<MessageRows
				{...props}
				messages={props.messages.map((message) => (message.id === edited.id ? edited : message))}
			/>,
		);
		expect(renderedIds).toEqual(["m100"]);
		fireEvent.click(
			within(document.getElementById("message-m100")!).getByRole("button", { name: "edited content" }),
		);
		expect(props.onForwardMessage).toHaveBeenCalledExactlyOnceWith(edited);
	});

	it("renders only the message whose reactions changed", () => {
		const props = makeProps();
		const view = render(<MessageRows {...props} />);
		renderedIds.length = 0;
		const reacted = { ...props.messages[100]!, reactions: [{ emoji: "❤️", userIds: ["minh"] }] };

		view.rerender(
			<MessageRows
				{...props}
				messages={props.messages.map((message) => (message.id === reacted.id ? reacted : message))}
			/>,
		);
		expect(renderedIds).toEqual(["m100"]);
		expect(
			within(document.getElementById("message-m100")!).getByRole("button", { name: "❤️, 1" }),
		).toBeInTheDocument();
	});

	it("updates the previous tail's grouping when appending and the new head when trimming", () => {
		const props = makeProps();
		const view = render(<MessageRows {...props} />);
		renderedIds.length = 0;
		const appended = [...props.messages, makeMessage("m200", "an", "new tail")];

		view.rerender(<MessageRows {...props} messages={appended} />);
		expect(renderedIds).toEqual(["m199", "m200"]);
		renderedIds.length = 0;
		view.rerender(<MessageRows {...props} messages={appended.slice(1)} />);
		expect(renderedIds).toEqual(["m1"]);
	});

	it("updates pin state and callback replacements instead of capturing old values", () => {
		const props = makeProps();
		const view = render(<MessageRows {...props} />);
		renderedIds.length = 0;
		const pinnedMessageIds = ["m100"];
		view.rerender(<MessageRows {...props} pinnedMessageIds={pinnedMessageIds} />);
		expect(renderedIds).toEqual(["m100"]);
		const row = document.getElementById("message-m100")!;
		fireEvent.click(within(row).getByRole("button", { name: "Toggle pin" }));
		expect(props.onTogglePinMessage).toHaveBeenCalledExactlyOnceWith("m100", true);

		const forward = vi.fn();
		view.rerender(<MessageRows {...props} pinnedMessageIds={pinnedMessageIds} onForwardMessage={forward} />);
		fireEvent.click(within(document.getElementById("message-m100")!).getByRole("button", { name: "message 100" }));
		expect(forward).toHaveBeenCalledExactlyOnceWith(props.messages[100]);
		expect(props.onForwardMessage).not.toHaveBeenCalled();
	});

	it("updates both rows when the read receipt moves", () => {
		const props = makeProps();
		const receipt = { messageId: "m10", readerCount: 1, readerIds: ["an"] };
		const view = render(<MessageRows {...props} readReceipt={receipt} />);
		renderedIds.length = 0;

		view.rerender(<MessageRows {...props} readReceipt={{ ...receipt, messageId: "m11" }} />);
		expect(renderedIds).toEqual(["m10", "m11"]);
	});
});
