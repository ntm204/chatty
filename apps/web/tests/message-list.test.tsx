import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { MAX_RETAINED_MESSAGES } from "@/features/chat/constants/pagination";
import { MessageList } from "@/features/chat/components/message-list";
import { formatMessageTime } from "@/features/chat/utils";
import { makeAttachment, makeMessage, makeOrphanedMessage, makeParticipant, makeSystemMessage } from "./factories";

// jsdom has no scroll API; geometry tests below model the viewport separately.
Element.prototype.scrollTo ??= function scrollTo() {};

const messages = [makeMessage("m1", "minh", "first"), makeMessage("m2", "an", "second")];

/**
 * Any moment in the past. Nothing here renders these — the list branches on
 * whether they are set, not on what they say — so a fixed value keeps the tests
 * about the branch rather than about formatting.
 */
const FIXED_EDITED_AT = "2026-08-23T10:05:00.000Z";
const FIXED_DELETED_AT = "2026-08-23T10:06:00.000Z";

afterEach(() => vi.restoreAllMocks());

function renderList(overrides: Partial<React.ComponentProps<typeof MessageList>> = {}) {
	const props = {
		conversationId: "conversation-1",
		messages,
		unreadCount: 0,
		currentUserId: "minh",
		participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
		isGroup: false,
		themeColor: null,
		areReceiptsShared: true,
		isLoadingThread: false,
		hasMoreOlder: false,
		isLoadingOlder: false,
		onLoadOlder: vi.fn(),
		hasMoreNewer: false,
		isLoadingNewer: false,
		onLoadNewer: vi.fn(),
		onEditMessage: vi.fn(),
		onDeleteMessage: vi.fn(),
		onHideMessage: vi.fn(),
		onRetrySend: vi.fn(),
		onDiscardDraft: vi.fn(),
		onToggleReaction: vi.fn(),
		onReplyToMessage: vi.fn(),
		onForwardMessage: vi.fn(),
		onTogglePinMessage: vi.fn(),
		pinnedMessageIds: [],
		onJumpToMessage: vi.fn(),
		onTrimHistory: vi.fn(),
		requestEditLast: 0,
		requestCancelEdit: 0,
		onEditingStateChange: vi.fn(),
		...overrides,
	};

	const view = render(<MessageList {...props} />);

	return {
		...props,
		rerenderList: (updates: Partial<React.ComponentProps<typeof MessageList>>) =>
			view.rerender(<MessageList {...props} {...updates} />),
	};
}

/**
 * The scroll container, found by class rather than by role.
 *
 * Queries here normally go through roles and labels, but a scroll viewport is
 * layout with no accessible name to ask for — there is nothing better to match on.
 */
function getScrollContainer(): HTMLElement {
	const container = document.querySelector<HTMLElement>(".overflow-y-auto");
	if (!container) throw new Error("scroll container not found");

	return container;
}

describe("MessageList", () => {
	it("renders every message", () => {
		renderList();

		expect(screen.getByText("first")).toBeInTheDocument();
		expect(screen.getByText("second")).toBeInTheDocument();
	});

	it("hides every message's time behind hover, with no persistent caption when the newest message isn't mine", () => {
		renderList();

		const timeLabel = formatMessageTime(messages[0]!.createdAt);
		for (const time of screen.getAllByText(timeLabel)) expect(time).toHaveClass("opacity-0");
		expect(screen.queryByText(/^Sent /)).not.toBeInTheDocument();
	});

	it("gives only my own newest message a persistent below-bubble caption", () => {
		const firstCreatedAt = "2026-08-23T09:55:00.000Z";
		// Within the caption's one-hour window regardless of when this test runs.
		const secondCreatedAt = new Date(Date.now() - 60_000).toISOString();
		renderList({
			messages: [
				makeMessage("m1", "an", "first", [], { createdAt: firstCreatedAt }),
				makeMessage("m2", "minh", "second", [], { createdAt: secondCreatedAt }),
			],
		});

		expect(screen.getByText(formatMessageTime(firstCreatedAt))).toHaveClass("opacity-0");
		expect(screen.getByText(/^Sent /)).toBeInTheDocument();
	});

	it("keeps a reaction inside the author's message run", () => {
		renderList({
			messages: [
				makeMessage("m1", "an", "first", [], {
					reactions: [{ emoji: "❤️", userIds: ["minh"] }],
				}),
				makeMessage("m2", "an", "second"),
			],
			isGroup: true,
		});

		expect(screen.getAllByText("an")).toHaveLength(1);
		const reactionGroup = screen.getByRole("group", { name: "Reactions to received message" });
		expect(reactionGroup).toContainElement(screen.getByRole("button", { name: "❤️, 1" }));
	});

	it("collapses past three distinct emoji into one chip that opens the list", async () => {
		// An open emoji set has no ceiling on how many chips a group can produce
		// and the bubble does, so the overflow has to lead somewhere rather than
		// simply hiding what did not fit.
		renderList({
			messages: [
				makeMessage("m1", "an", "first", [], {
					reactions: [
						{ emoji: "❤️", userIds: ["minh"] },
						{ emoji: "😂", userIds: ["an"] },
						{ emoji: "👍", userIds: ["minh"] },
						{ emoji: "😮", userIds: ["an"] },
						{ emoji: "😢", userIds: ["minh"] },
					],
				}),
			],
			isGroup: true,
		});

		const reactionGroup = screen.getByRole("group", { name: "Reactions to received message" });
		expect(reactionGroup.querySelectorAll("button")).toHaveLength(4);
		expect(screen.queryByRole("button", { name: "😢, 1" })).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: /2 more reactions/ }));

		expect(screen.getByRole("dialog", { name: "Reactions" })).toBeInTheDocument();
	});

	it("drops the oldest page only once the thread outgrows the cap", () => {
		// The cheap half of "virtualise the message list": the array stops growing
		// without touching scroll anchoring, jump-to-message or the divider.
		const short = Array.from({ length: MAX_RETAINED_MESSAGES }, (_, index) =>
			makeMessage(`m${index}`, "an", `line ${index}`),
		);
		const { onTrimHistory } = renderList({ messages: short });

		expect(onTrimHistory).not.toHaveBeenCalled();

		cleanup();
		const long = [...short, makeMessage("one-too-many", "an", "over")];
		const overflowing = renderList({ messages: long });

		expect(overflowing.onTrimHistory).toHaveBeenCalled();
	});

	it("leaves history alone while the reader is looking at a jumped-to message", () => {
		// A search result opens the thread around an old message with newer ones
		// still unloaded, so "scrolled to the bottom" does not mean "at the
		// latest" — trimming there would drop what they came to read.
		const long = Array.from({ length: MAX_RETAINED_MESSAGES + 1 }, (_, index) =>
			makeMessage(`m${index}`, "an", `line ${index}`),
		);
		const { onTrimHistory } = renderList({ messages: long, targetMessageId: "m3" });

		expect(onTrimHistory).not.toHaveBeenCalled();
	});

	it("marks the time when a conversation resumes after a long pause", () => {
		renderList({
			messages: [
				makeMessage("m1", "an", "morning", [], { createdAt: "2026-08-23T08:00:00.000Z" }),
				makeMessage("m2", "an", "back now", [], { createdAt: "2026-08-23T10:00:00.000Z" }),
			],
		});

		expect(screen.getByRole("separator", { name: /Conversation resumed at/i })).toBeInTheDocument();
	});

	it("keeps the name of an author who is no longer in the conversation", () => {
		// The bug this replaced: the author was resolved against `participants`,
		// so every message written by someone who had left the group lost its
		// name and its avatar. The history stayed and the person vanished from it.
		renderList({
			messages: [makeMessage("m1", "chi", "see you all")],
			participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
			isGroup: true,
		});

		expect(screen.getByText("see you all")).toBeInTheDocument();
		expect(screen.getByText("chi")).toBeInTheDocument();
	});

	it("names authors in a group that has shrunk to two people", () => {
		// `isGroup` used to be `participants.length > 2`, which turned a group into
		// a 1-1 the moment someone left — dropping the names from exactly the
		// messages that needed them most.
		renderList({
			messages: [makeMessage("m1", "an", "still here")],
			participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
			isGroup: true,
		});

		expect(screen.getByText("an")).toBeInTheDocument();
	});

	it("names a message whose author deleted their account rather than dropping the label", () => {
		// The message survives the account — deleting it would empty half of other
		// people's conversations — but the name does not. Without this it would
		// render as an anonymous bubble with no indication whose it was.
		renderList({
			messages: [makeOrphanedMessage("m1", "written before they left")],
			participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
			isGroup: true,
		});

		expect(screen.getByText("written before they left")).toBeInTheDocument();
		expect(screen.getByText("Deleted account")).toBeInTheDocument();
		// Still a message, unlike a system line: somebody said this, so it carries
		// the actions menu a system line has nothing to put in.
		//
		// This used to assert on a `.rounded-2xl` class, which is the one thing the
		// conventions here say not to query by. It broke the first time the bubble's
		// radius changed and had never said anything about behaviour.
		expect(screen.getByRole("button", { name: "Message actions" })).toBeInTheDocument();
	});

	it("renders a group event as a line of its own", () => {
		renderList({ messages: [makeSystemMessage("s1", "An added Binh")], isGroup: true });

		const systemMessage = screen.getByText("An added Binh");
		expect(systemMessage).toBeInTheDocument();
		expect(systemMessage).toHaveAttribute("title", formatMessageTime("2026-08-23T10:00:00.000Z"));
		// Nobody wrote it, so there is nothing to edit, unsend or hide — and so no
		// actions menu, which is what tells it apart from a message in the DOM.
		expect(screen.queryByRole("button", { name: "Message actions" })).not.toBeInTheDocument();
	});

	it("reveals a single message action trigger when its row is tapped", () => {
		renderList();

		const firstRow = screen.getByText("first").closest("[data-message-interaction-row]");
		expect(firstRow).not.toBeNull();
		fireEvent.pointerUp(firstRow!, { pointerType: "touch" });

		expect(firstRow).toHaveFocus();
		const actionRoot = screen.getAllByRole("button", { name: "Message actions" })[0]!.parentElement;
		expect(actionRoot).toHaveClass("max-sm:pointer-events-none");
		expect(actionRoot).toHaveClass("max-sm:group-focus-within:pointer-events-auto");
		expect(actionRoot).toHaveClass("max-sm:group-focus-within:opacity-70");
	});

	it("shows an empty state when there are no messages", () => {
		renderList({ messages: [] });

		expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
	});

	it("marks the start of history only when nothing older remains", () => {
		renderList({ hasMoreOlder: false });

		expect(screen.getByText(/beginning of the conversation/i)).toBeInTheDocument();
	});

	it("does not claim the start of history while older messages exist", () => {
		renderList({ hasMoreOlder: true });

		expect(screen.queryByText(/beginning of the conversation/i)).not.toBeInTheDocument();
	});

	it("shows a loading note while older messages are being fetched", () => {
		renderList({ hasMoreOlder: true, isLoadingOlder: true });

		expect(screen.getByText(/loading earlier messages/i)).toBeInTheDocument();
	});

	it("asks for older messages when the reader scrolls near the top", () => {
		const { onLoadOlder } = renderList({ hasMoreOlder: true });

		fireEvent.scroll(getScrollContainer(), { target: { scrollTop: 0 } });

		expect(onLoadOlder).toHaveBeenCalledOnce();
	});

	it("does not ask again while a page is already loading", () => {
		// Otherwise a few scroll events fire several overlapping requests and the
		// same page gets prepended more than once.
		const { onLoadOlder } = renderList({ hasMoreOlder: true, isLoadingOlder: true });

		fireEvent.scroll(getScrollContainer(), { target: { scrollTop: 0 } });

		expect(onLoadOlder).not.toHaveBeenCalled();
	});

	it("does not ask when there is nothing older to fetch", () => {
		const { onLoadOlder } = renderList({ hasMoreOlder: false });

		fireEvent.scroll(getScrollContainer(), { target: { scrollTop: 0 } });

		expect(onLoadOlder).not.toHaveBeenCalled();
	});

	it("does not ask when the reader is far from the top", () => {
		const { onLoadOlder } = renderList({ hasMoreOlder: true });

		fireEvent.scroll(getScrollContainer(), { target: { scrollTop: 5000 } });

		expect(onLoadOlder).not.toHaveBeenCalled();
	});

	it("renders one newer-page control for the list, not one per message", () => {
		renderList({ hasMoreNewer: true });

		expect(screen.getAllByRole("button", { name: "Load newer messages" })).toHaveLength(1);
	});

	it("places one divider before the first unread message", () => {
		renderList({ unreadCount: 1 });

		expect(screen.getAllByText("1 new message")).toHaveLength(1);
	});

	it("loads a quoted message that is outside the current page", () => {
		const onJumpToMessage = vi.fn();
		renderList({
			messages: [
				makeMessage("reply", "an", "answer", [], {
					replyTo: {
						id: "older-message",
						authorName: "Minh",
						content: "question",
						hasAttachment: false,
						attachmentUrl: null,
						isDeleted: false,
					},
				}),
			],
			onJumpToMessage,
		});

		fireEvent.click(screen.getByText("question"));

		expect(onJumpToMessage).toHaveBeenCalledWith("older-message");
	});
});

describe("MessageList editing and deleting", () => {
	const mine = makeMessage("m1", "minh", "mine");
	const theirs = makeMessage("m2", "an", "theirs");

	function openMessageActions() {
		fireEvent.click(screen.getByLabelText("Message actions"));
	}

	it("offers edit and delete on your own message", () => {
		renderList({ messages: [mine] });
		openMessageActions();

		expect(screen.getByRole("menuitem", { name: "Edit message" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Delete message" })).toBeInTheDocument();
	});

	it("offers the reusable forward and pin actions", () => {
		renderList({ messages: [mine] });
		openMessageActions();

		expect(screen.getByRole("menuitem", { name: "Forward" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Pin message" })).toBeInTheDocument();
	});

	it("offers delete-for-me but not editing on someone else's", () => {
		renderList({ messages: [theirs] });
		openMessageActions();

		expect(screen.queryByLabelText("Edit message")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
		expect(screen.getByRole("menuitem", { name: "Delete for me" })).toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: "Delete for everyone" })).not.toBeInTheDocument();
	});

	it("allows a tombstone to be removed for the current user", () => {
		const { onHideMessage } = renderList({
			messages: [makeMessage("m1", "minh", "", [], { deletedAt: FIXED_DELETED_AT })],
		});
		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));

		expect(screen.queryByLabelText("Edit message")).not.toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Delete for me" })).toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: "Delete for everyone" })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete for me" }));
		expect(onHideMessage).toHaveBeenCalledWith("m1");
	});

	it("hides author-only actions after their 8-hour deadline", () => {
		renderList({
			messages: [makeMessage("m1", "minh", "old", [], { authorActionExpiresAt: "2000-01-01T00:00:00.000Z" })],
		});
		openMessageActions();

		expect(screen.queryByLabelText("Edit message")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
		expect(screen.getByRole("menuitem", { name: "Delete for me" })).toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: "Delete for everyone" })).not.toBeInTheDocument();
	});

	it("reports the new text once the author saves", () => {
		const { onEditMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit message" }));
		fireEvent.change(screen.getByLabelText("Edit message"), { target: { value: "mine, fixed" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		expect(onEditMessage).toHaveBeenCalledWith("m1", "mine, fixed");
	});

	it("does not report an edit that changes nothing", () => {
		// Otherwise opening the editor and pressing Save writes an "edited" marker
		// onto a message nobody actually changed.
		const { onEditMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit message" }));

		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		expect(onEditMessage).not.toHaveBeenCalled();
	});

	it("does not let a text-only message be emptied", () => {
		const { onEditMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit message" }));
		fireEvent.change(screen.getByLabelText("Edit message"), { target: { value: "   " } });

		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		expect(onEditMessage).not.toHaveBeenCalled();
	});

	it("lets the caption of a message with an image be cleared", () => {
		const { onEditMessage } = renderList({
			messages: [makeMessage("m1", "minh", "look", [makeAttachment()])],
		});

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit message" }));
		fireEvent.change(screen.getByLabelText("Edit message"), { target: { value: "" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		expect(onEditMessage).toHaveBeenCalledWith("m1", "");
	});

	it("abandons the edit on cancel", () => {
		const { onEditMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit message" }));
		fireEvent.change(screen.getByLabelText("Edit message"), { target: { value: "never mind" } });
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		expect(onEditMessage).not.toHaveBeenCalled();
		expect(screen.getByText("mine")).toBeInTheDocument();
	});

	it("asks before deleting", () => {
		// The only destructive action in the app that confirms, because it is the
		// only one nobody can undo — the server empties the row and removes the file.
		const { onDeleteMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));

		expect(onDeleteMessage).not.toHaveBeenCalled();
		expect(screen.getByRole("menuitem", { name: "Delete for everyone" })).toBeInTheDocument();
	});

	it("deletes once the author confirms", () => {
		const { onDeleteMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete for everyone" }));

		expect(onDeleteMessage).toHaveBeenCalledWith("m1");
	});

	it("keeps the message when the author backs out", () => {
		const { onDeleteMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "Cancel" }));

		expect(onDeleteMessage).not.toHaveBeenCalled();
		expect(screen.getByRole("menuitem", { name: "Delete message" })).toBeInTheDocument();
	});

	it("stands a placeholder in for a deleted message", () => {
		renderList({ messages: [makeMessage("m1", "minh", "", [], { deletedAt: FIXED_DELETED_AT })] });

		expect(screen.getByText("This message was deleted")).toBeInTheDocument();
	});

	it("renders nothing of a deleted message's image", () => {
		// The server drops the attachment on delete, so this is belt and braces —
		// and the one thing a client must never render from a stale copy.
		renderList({
			messages: [makeMessage("m1", "minh", "", [makeAttachment()], { deletedAt: FIXED_DELETED_AT })],
		});

		expect(screen.queryByRole("img")).not.toBeInTheDocument();
	});

	it("marks a message its author rewrote", () => {
		renderList({ messages: [makeMessage("m1", "minh", "fixed", [], { editedAt: FIXED_EDITED_AT })] });

		expect(screen.getByText(/edited/)).toBeInTheDocument();
	});

	it("opens exactly one accessible edit-history dialog and closes it with Escape", async () => {
		vi.spyOn(api, "listMessageEdits").mockResolvedValue([
			{ id: "e1", content: "before", editedAt: FIXED_EDITED_AT },
		]);
		renderList({
			messages: [
				makeMessage("m1", "minh", "first fixed", [], { editedAt: FIXED_EDITED_AT }),
				makeMessage("m2", "an", "second fixed", [], { editedAt: FIXED_EDITED_AT }),
			],
		});

		fireEvent.click(screen.getAllByText(/edited/)[0]!);
		await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
		expect(await screen.findByText("before")).toBeInTheDocument();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("does not mark a message nobody touched", () => {
		renderList({ messages: [mine] });

		expect(screen.queryByText(/edited/)).not.toBeInTheDocument();
	});

	it("does not call a deleted message edited, even if it was", () => {
		// Both timestamps can be set: edit it, then delete it. "Edited" beside
		// "This message was deleted" describes text nobody can read either way.
		renderList({
			messages: [makeMessage("m1", "minh", "", [], { editedAt: FIXED_EDITED_AT, deletedAt: FIXED_DELETED_AT })],
		});

		expect(screen.queryByText(/edited/)).not.toBeInTheDocument();
	});
});

describe("returning to the live edge", () => {
	let contentHeight: number;
	let viewportHeight: number;
	let scrollPosition: number;
	const resizeCallbacks = new Set<() => void>();

	beforeEach(() => {
		contentHeight = 1_200;
		viewportHeight = 700;
		scrollPosition = 0;
		resizeCallbacks.clear();
		// jsdom has no layout. Model its dimensions and clamping while exercising
		// the actual list, scroll handler and resize observer together.
		vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(() => contentHeight);
		vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(() => viewportHeight);
		vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(() =>
			Math.min(scrollPosition, Math.max(0, contentHeight - viewportHeight)),
		);
		vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation((position: number) => {
			scrollPosition = Math.max(0, Math.min(position, contentHeight - viewportHeight));
		});
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(private callback: () => void) {
					resizeCallbacks.add(callback);
				}
				observe() {}
				unobserve() {}
				disconnect() {
					resizeCallbacks.delete(this.callback);
				}
			},
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	function resize() {
		act(() => resizeCallbacks.forEach((callback) => callback()));
	}

	it("offers the activity control after a modest scroll, even when history is less than two viewports", () => {
		renderList();
		const viewport = screen.getByRole("region", { name: "Message history" });
		expect(screen.queryByRole("button", { name: "Jump to latest messages" })).not.toBeInTheDocument();

		fireEvent.scroll(viewport, { target: { scrollTop: 300 } });

		expect(screen.getByRole("button", { name: "Jump to latest messages" })).toBeVisible();
		fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
		expect(screen.getByRole("button", { name: "Jump to latest messages" })).toBeVisible();
		fireEvent.scroll(viewport, { target: { scrollTop: 380 } });
		expect(screen.getByRole("button", { name: "Jump to latest messages" })).toBeVisible();
		fireEvent.scroll(viewport, { target: { scrollTop: 420 } });
		expect(screen.queryByRole("button", { name: "Jump to latest messages" })).not.toBeInTheDocument();
	});

	it("scrolls back to the latest message without retaining the activity control", async () => {
		renderList();
		const viewport = screen.getByRole("region", { name: "Message history" });
		fireEvent.scroll(viewport, { target: { scrollTop: 200 } });
		const scrollTo = vi.fn((options: ScrollToOptions) => {
			viewport.scrollTop = options.top ?? 0;
			fireEvent.scroll(viewport);
		});
		Object.defineProperty(viewport, "scrollTo", { value: scrollTo });

		await userEvent.click(screen.getByRole("button", { name: "Jump to latest messages" }));

		expect(scrollTo).toHaveBeenCalledWith({ top: 1_200, behavior: "smooth" });
		expect(viewport.scrollTop).toBe(500);
		expect(viewport).toHaveFocus();
		expect(screen.queryByRole("button", { name: "Jump to latest messages" })).not.toBeInTheDocument();
	});

	it("keeps a reader in history when a message arrives", () => {
		const { rerenderList } = renderList();
		const viewport = screen.getByRole("region", { name: "Message history" });
		fireEvent.scroll(viewport, { target: { scrollTop: 200 } });
		contentHeight = 1_350;

		rerenderList({ messages: [...messages, makeMessage("incoming", "an", "just arrived")] });
		resize();

		expect(viewport.scrollTop).toBe(200);
		expect(screen.getByRole("button", { name: "Jump to latest messages" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Jump to latest messages" })).toHaveTextContent("1 new message");
	});

	it("shows actual typing in the activity control without moving the reader", () => {
		const { rerenderList } = renderList({ unreadCount: 9 });
		const viewport = screen.getByRole("region", { name: "Message history" });
		fireEvent.scroll(viewport, { target: { scrollTop: 200 } });
		const activity = screen.getByRole("button", { name: "Jump to latest messages" });
		expect(activity).toHaveTextContent(/^$/);
		expect(activity).toHaveAccessibleDescription("You are viewing earlier messages");

		rerenderList({ typingMessage: "An is typing…" });

		expect(activity).toHaveTextContent("An is typing");
		expect(activity).toHaveAccessibleDescription("An is typing…");
		expect(viewport.scrollTop).toBe(200);
		rerenderList({ typingMessage: null });
		expect(activity).toHaveTextContent(/^$/);
		expect(viewport.scrollTop).toBe(200);
	});

	it("follows late media and composer resizing only while already at the latest messages", () => {
		renderList();
		const viewport = screen.getByRole("region", { name: "Message history" });
		contentHeight = 1_400;
		viewportHeight = 500;

		resize();

		expect(viewport.scrollTop).toBe(900);
		expect(screen.queryByRole("button", { name: "Jump to latest messages" })).not.toBeInTheDocument();
		fireEvent.scroll(viewport, { target: { scrollTop: 600 } });
		contentHeight = 1_500;
		resize();
		expect(viewport.scrollTop).toBe(600);
		expect(screen.getByRole("button", { name: "Jump to latest messages" })).toBeVisible();
	});

	it("removes the activity control when resizing brings the newest message into view", () => {
		renderList();
		const viewport = screen.getByRole("region", { name: "Message history" });
		fireEvent.scroll(viewport, { target: { scrollTop: 200 } });
		expect(screen.getByRole("button", { name: "Jump to latest messages" })).toBeVisible();
		viewportHeight = 1_100;

		resize();

		expect(screen.queryByRole("button", { name: "Jump to latest messages" })).not.toBeInTheDocument();
	});

	it("resets the live edge when switching conversations", () => {
		const { rerenderList } = renderList();
		const viewport = screen.getByRole("region", { name: "Message history" });
		fireEvent.scroll(viewport, { target: { scrollTop: 200 } });
		contentHeight = 1_600;

		rerenderList({ conversationId: "conversation-2", messages: [makeMessage("other", "an", "another thread")] });

		expect(viewport.scrollTop).toBe(900);
		expect(screen.queryByRole("button", { name: "Jump to latest messages" })).not.toBeInTheDocument();
	});

	it("keeps a search window in place and offers one activity control to request the live history", async () => {
		const onReturnToLatest = vi.fn();
		const { rerenderList } = renderList({ targetMessageId: "m1", hasMoreNewer: true, onReturnToLatest });
		const viewport = screen.getByRole("region", { name: "Message history" });
		resize();
		expect(viewport.scrollTop).toBe(0);
		expect(screen.getAllByRole("button", { name: "Jump to latest messages" })).toHaveLength(1);
		expect(screen.queryByRole("button", { name: "Return to latest messages" })).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "Jump to latest messages" }));

		expect(onReturnToLatest).toHaveBeenCalledOnce();
		rerenderList({ targetMessageId: null, hasMoreNewer: false });
		expect(viewport.scrollTop).toBe(500);
		expect(screen.queryByRole("button", { name: "Jump to latest messages" })).not.toBeInTheDocument();
	});

	it("preserves the visible history while older messages are prepended", () => {
		const { rerenderList } = renderList({ hasMoreOlder: true });
		const viewport = screen.getByRole("region", { name: "Message history" });
		fireEvent.scroll(viewport, { target: { scrollTop: 100 } });
		contentHeight = 1_700;

		rerenderList({ messages: [makeMessage("older", "an", "earlier"), ...messages] });
		resize();

		expect(viewport.scrollTop).toBe(600);
		expect(screen.getByRole("button", { name: "Jump to latest messages" })).toBeVisible();
	});

	it("waits for the latest page with one disabled action and keeps keyboard focus in the thread", async () => {
		const onReturnToLatest = vi.fn();
		const { rerenderList } = renderList({ targetMessageId: "m1", hasMoreNewer: true, onReturnToLatest });
		const jump = screen.getByRole("button", { name: "Jump to latest messages" });
		jump.focus();
		await userEvent.keyboard("{Enter}");
		expect(onReturnToLatest).toHaveBeenCalledOnce();
		expect(screen.getByRole("region", { name: "Message history" })).toHaveFocus();
		expect(jump).toBeDisabled();
		expect(jump).toHaveAccessibleDescription("Loading latest messages");

		rerenderList({ messages: [], targetMessageId: null, hasMoreNewer: false, isLoadingThread: true });
		expect(jump).toBeVisible();
		expect(jump).toHaveTextContent("Loading latest…");
		await userEvent.click(jump);
		expect(onReturnToLatest).toHaveBeenCalledOnce();

		rerenderList({ targetMessageId: null, hasMoreNewer: false, isLoadingThread: false });
		expect(screen.queryByRole("button", { name: "Jump to latest messages" })).not.toBeInTheDocument();
	});

	it("releases the pending return when another historical target supersedes it", async () => {
		const { rerenderList } = renderList({ targetMessageId: "m1", hasMoreNewer: true, onReturnToLatest: vi.fn() });
		await userEvent.click(screen.getByRole("button", { name: "Jump to latest messages" }));
		rerenderList({ targetMessageId: null, hasMoreNewer: false, isLoadingThread: true });
		rerenderList({ targetMessageId: "m2", hasMoreNewer: true, isLoadingThread: false });

		expect(screen.getByRole("button", { name: "Jump to latest messages" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Jump to latest messages" })).not.toHaveTextContent("Loading");
	});

	it("announces actual new arrivals with an exact count while capping the visual label", () => {
		const { rerenderList } = renderList({ unreadCount: 25 });
		const viewport = screen.getByRole("region", { name: "Message history" });
		fireEvent.scroll(viewport, { target: { scrollTop: 200 } });
		const incoming = Array.from({ length: 101 }, (_, index) => makeMessage(`new-${index}`, "an", "New reply"));
		rerenderList({ messages: [...messages, ...incoming], typingMessage: "An is typing…" });
		const jump = screen.getByRole("button", { name: "Jump to latest messages" });
		expect(jump).toHaveTextContent("99+ new");
		expect(jump).toHaveAccessibleDescription("An is typing…. 101 new messages");
		expect(screen.getByRole("status", { name: "" })).toHaveTextContent("101 new messages");
		expect(viewport.scrollTop).toBe(200);
	});

	it("centers a search result once, without dragging the reader back on edits or page arrivals", () => {
		const scrollTo = vi.spyOn(Element.prototype, "scrollTo");
		const { rerenderList } = renderList({ targetMessageId: "m1", hasMoreNewer: true });
		expect(scrollTo).toHaveBeenCalledOnce();
		const viewport = screen.getByRole("region", { name: "Message history" });
		fireEvent.scroll(viewport, { target: { scrollTop: 200 } });
		rerenderList({ messages: [...messages, makeMessage("new", "an", "Just arrived")] });
		rerenderList({ messages: [{ ...messages[0]!, content: "Edited" }, messages[1]!] });
		expect(scrollTo).toHaveBeenCalledOnce();
		expect(viewport.scrollTop).toBe(200);

		rerenderList({ targetMessageId: "m2" });
		expect(scrollTo).toHaveBeenCalledTimes(2);
	});

	it("waits for a search target that has not rendered yet", () => {
		const scrollTo = vi.spyOn(Element.prototype, "scrollTo");
		const { rerenderList } = renderList({ targetMessageId: "later", hasMoreNewer: true });
		expect(scrollTo).not.toHaveBeenCalled();
		rerenderList({ messages: [...messages, makeMessage("later", "an", "Search result")] });
		expect(scrollTo).toHaveBeenCalledOnce();
	});
});
