import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageInput } from "@/features/chat/components/message-input";
import { makeMessage, makeParticipant } from "./factories";

/**
 * The composer no longer calls the API. A text message is put on screen before
 * the round trip finishes, and the thread is this component's sibling, so the
 * send belongs to the page that owns both — see `useConversationMessages`.
 */
const onSend = vi.fn();

// The typing notifier talks to a socket, which is not what these tests are about.
vi.mock("@/features/chat/hooks", () => ({
	useTypingNotifier: () => ({ notifyTyping: vi.fn(), stopTyping: vi.fn() }),
	useStickers: () => ({
		stickers: [],
		isLoading: false,
		error: "",
		add: vi.fn(),
		remove: vi.fn(),
	}),
}));

beforeEach(() => {
	onSend.mockReset().mockResolvedValue(undefined);
	localStorage.clear();
	// jsdom has no object URL implementation; the preview needs one.
	URL.createObjectURL = vi.fn(() => "blob:preview");
	URL.revokeObjectURL = vi.fn();
});

function renderInput(overrides: Partial<React.ComponentProps<typeof MessageInput>> = {}) {
	return render(
		<MessageInput
			conversationId="conversation-1"
			participants={[]}
			currentUserId="minh"
			replyTo={null}
			onCancelReply={vi.fn()}
			onSend={onSend}
			onSendSticker={vi.fn()}
			onSendFile={vi.fn().mockResolvedValue(undefined)}
			onSendVoice={vi.fn().mockResolvedValue(undefined)}
			onRestoreReply={vi.fn()}
			{...overrides}
		/>,
	);
}

/** The hidden file input, which has no label to query by. */
function fileInput(container: HTMLElement): HTMLInputElement {
	return container.querySelector('input[type="file"]') as HTMLInputElement;
}

/** The submit button. An arrow with no words on it, so it carries a label. */
function sendButton(): HTMLElement {
	return screen.getByRole("button", { name: "Send message" });
}

const image = new File(["pretend-bytes"], "photo.png", { type: "image/png" });
const documentFile = new File(["document-bytes"], "notes.pdf", { type: "application/pdf" });

describe("MessageInput", () => {
	it("shows voice instead of an inactive send button when the composer is empty", () => {
		renderInput();

		expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Record a voice message" })).toBeEnabled();
	});

	it("keeps the blocker's composer read-only", () => {
		renderInput({ isDisabled: true });

		expect(screen.getByRole("status")).toHaveTextContent("You blocked this person");
		expect(screen.getByLabelText("Message")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Add an attachment" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Record a voice message" })).toBeDisabled();
	});

	it("groups photos, files and stickers behind one attachment trigger", async () => {
		const typist = userEvent.setup();
		renderInput();

		expect(screen.queryByRole("menu", { name: "Choose an attachment" })).not.toBeInTheDocument();
		await typist.click(screen.getByRole("button", { name: "Add an attachment" }));

		expect(screen.getByRole("menuitem", { name: "Photos" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Sticker" })).toBeInTheDocument();

		await typist.click(screen.getByRole("menuitem", { name: "Sticker" }));
		expect(screen.queryByRole("menu", { name: "Choose an attachment" })).not.toBeInTheDocument();
		expect(screen.getByRole("dialog", { name: "Stickers" })).toBeInTheDocument();
	});

	it("navigates the attachment menu by keyboard and returns focus on Escape", async () => {
		const typist = userEvent.setup();
		renderInput();
		const trigger = screen.getByRole("button", { name: "Add an attachment" });

		await typist.click(trigger);
		await waitFor(() => expect(screen.getByRole("menuitem", { name: "Photos" })).toHaveFocus());
		await typist.keyboard("{ArrowDown}");
		expect(screen.getByRole("menuitem", { name: "File" })).toHaveFocus();

		await typist.keyboard("{Escape}");
		expect(screen.queryByRole("menu", { name: "Choose an attachment" })).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});

	it("enables sending as soon as a picture is attached, with no text", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);

		expect(sendButton()).toBeEnabled();
	});

	it("sends text with no attachment", async () => {
		const typist = userEvent.setup();
		renderInput();

		await typist.type(screen.getByLabelText("Message"), "hello{Enter}");

		expect(onSend).toHaveBeenCalledWith("hello", [], null, []);
	});

	it("restores a device-local draft for the conversation", () => {
		localStorage.setItem(
			"chatty:draft:conversation-1",
			JSON.stringify({ content: "unfinished thought", replyToId: null }),
		);

		renderInput();

		expect(screen.getByLabelText("Message")).toHaveValue("unfinished thought");
	});

	it("persists the latest text immediately when leaving the composer", () => {
		const view = renderInput();
		fireEvent.change(screen.getByLabelText("Message"), { target: { value: "keep this" } });

		view.unmount();

		expect(JSON.parse(localStorage.getItem("chatty:draft:conversation-1") ?? "null")).toEqual({
			content: "keep this",
			replyToId: null,
		});
	});

	it("accepts an image pasted directly into the composer", () => {
		renderInput();

		fireEvent.paste(screen.getByLabelText("Message"), { clipboardData: { files: [image] } });

		expect(screen.getByAltText("Attached image preview 1")).toBeInTheDocument();
	});

	it("accepts an image dropped over the chat surface", () => {
		renderInput();

		fireEvent.drop(window, { dataTransfer: { types: ["Files"], files: [image] } });

		expect(screen.getByAltText("Attached image preview 1")).toBeInTheDocument();
	});

	it("sends a picked file immediately without consuming the text or reply draft", async () => {
		const typist = userEvent.setup();
		const onSendFile = vi.fn().mockResolvedValue(undefined);
		const onCancelReply = vi.fn();
		const replyTo = makeMessage("reply-target", "an", "A question");
		const { container } = renderInput({ onSendFile, onCancelReply, replyTo });
		await typist.type(screen.getByLabelText("Message"), "Keep this reply");

		await typist.upload(container.querySelector('input[type="file"]:not([multiple])')!, documentFile);

		expect(onSendFile).toHaveBeenCalledExactlyOnceWith(documentFile, "", null, expect.any(Function));
		expect(onSend).not.toHaveBeenCalled();
		expect(onCancelReply).not.toHaveBeenCalled();
		expect(screen.getByLabelText("Message")).toHaveValue("Keep this reply");
		expect(screen.queryByRole("button", { name: "Retry file upload" })).not.toBeInTheDocument();

		await typist.type(screen.getByLabelText("Message"), "{Enter}");
		expect(onSend).toHaveBeenCalledWith("Keep this reply", [], replyTo, []);
	});

	it.each(["paste", "drop"])("sends a file immediately from %s", async (source) => {
		const onSendFile = vi.fn().mockResolvedValue(undefined);
		renderInput({ onSendFile });

		if (source === "paste") {
			fireEvent.paste(screen.getByLabelText("Message"), { clipboardData: { files: [documentFile] } });
		} else {
			fireEvent.drop(window, { dataTransfer: { types: ["Files"], files: [documentFile] } });
		}

		await waitFor(() =>
			expect(onSendFile).toHaveBeenCalledExactlyOnceWith(documentFile, "", null, expect.any(Function)),
		);
		expect(onSend).not.toHaveBeenCalled();
	});

	it("keeps a failed file for retry without attaching the current text", async () => {
		const typist = userEvent.setup();
		const onSendFile = vi
			.fn()
			.mockRejectedValueOnce(new Error("Connection interrupted"))
			.mockResolvedValue(undefined);
		const { container } = renderInput({ onSendFile });
		await typist.type(screen.getByLabelText("Message"), "Still drafting");
		await typist.upload(container.querySelector('input[type="file"]:not([multiple])')!, documentFile);

		expect(await screen.findByRole("alert")).toHaveTextContent("Connection interrupted");
		expect(screen.getByText("notes.pdf")).toBeInTheDocument();
		expect(screen.getByLabelText("Message")).toHaveValue("Still drafting");
		await typist.click(screen.getByRole("button", { name: "Retry file upload" }));

		expect(onSendFile).toHaveBeenCalledTimes(2);
		expect(onSendFile).toHaveBeenLastCalledWith(documentFile, "", null, expect.any(Function));
		expect(screen.queryByText("notes.pdf")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Message")).toHaveValue("Still drafting");
	});

	it("keeps one upload in flight and preserves text typed while it sends", async () => {
		let releaseUpload: (() => void) | undefined;
		const onSendFile = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					releaseUpload = resolve;
				}),
		);
		const typist = userEvent.setup();
		const { container } = renderInput({ onSendFile });
		await typist.upload(container.querySelector('input[type="file"]:not([multiple])')!, documentFile);

		expect(screen.getByRole("status", { name: "Uploading attachment 0%" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Remove attached file" })).toBeDisabled();
		fireEvent.drop(window, { dataTransfer: { types: ["Files"], files: [documentFile] } });
		await typist.type(screen.getByLabelText("Message"), "A separate message{Enter}");
		expect(onSendFile).toHaveBeenCalledTimes(1);
		expect(onSend).not.toHaveBeenCalled();

		releaseUpload?.();
		await waitFor(() => expect(screen.queryByText("notes.pdf")).not.toBeInTheDocument());
		expect(screen.getByLabelText("Message")).toHaveValue("A separate message");
	});

	it("allows a failed file to be removed while keeping the text draft", async () => {
		const typist = userEvent.setup();
		const onSendFile = vi.fn().mockRejectedValue(new Error("Connection interrupted"));
		const { container } = renderInput({ onSendFile });
		await typist.type(screen.getByLabelText("Message"), "Keep this text");
		await typist.upload(container.querySelector('input[type="file"]:not([multiple])')!, documentFile);
		await typist.click(await screen.findByRole("button", { name: "Remove attached file" }));

		expect(screen.queryByText("notes.pdf")).not.toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Message")).toHaveValue("Keep this text");
		expect(onSendFile).toHaveBeenCalledTimes(1);
	});

	it("refuses invalid files before starting their upload", () => {
		const onSendFile = vi.fn();
		renderInput({ onSendFile });
		const executable = new File(["bytes"], "installer.exe", { type: "application/octet-stream" });

		fireEvent.drop(window, { dataTransfer: { types: ["Files"], files: [executable] } });

		expect(screen.getByRole("alert")).toHaveTextContent("Executable files cannot be sent");
		expect(onSendFile).not.toHaveBeenCalled();
	});

	it("does not upload dropped or pasted files while the composer is disabled", () => {
		const onSendFile = vi.fn();
		renderInput({ onSendFile, isDisabled: true });

		fireEvent.drop(window, { dataTransfer: { types: ["Files"], files: [documentFile] } });
		fireEvent.paste(screen.getByLabelText("Message"), { clipboardData: { files: [documentFile] } });

		expect(onSendFile).not.toHaveBeenCalled();
	});

	it("autocompletes a group mention and sends the participant id", async () => {
		const user = userEvent.setup();
		const an = makeParticipant("an", "An");
		renderInput({ participants: [makeParticipant("minh", "Minh"), an] });

		await user.type(screen.getByLabelText("Message"), "Hello @a");
		await user.click(screen.getByRole("button", { name: "An@an" }));
		await user.type(screen.getByLabelText("Message"), "there{Enter}");

		expect(onSend).toHaveBeenCalledWith("Hello @an there", [], null, ["an"]);
	});

	it("empties the field before the send resolves, so the next message need not wait", async () => {
		// The message is already in the thread as a pending bubble by this point.
		let releaseSend: (() => void) | undefined;
		onSend.mockReturnValue(
			new Promise<void>((resolve) => {
				releaseSend = resolve;
			}),
		);
		const typist = userEvent.setup();
		renderInput();

		await typist.type(screen.getByLabelText("Message"), "hello{Enter}");

		expect(screen.getByLabelText("Message")).toHaveValue("");

		releaseSend?.();
	});

	it("can send the next text message while the previous request is still pending", async () => {
		const pendingSends: Array<() => void> = [];
		onSend.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					pendingSends.push(resolve);
				}),
		);
		const typist = userEvent.setup();
		renderInput();

		await typist.type(screen.getByLabelText("Message"), "first{Enter}");
		await typist.type(screen.getByLabelText("Message"), "second{Enter}");

		expect(onSend).toHaveBeenCalledTimes(2);
		expect(onSend).toHaveBeenLastCalledWith("second", [], null, []);
		pendingSends.forEach((resolve) => resolve());
	});

	it("lets an image be sent with no text at all", async () => {
		// The whole reason the send button's guard changed: a picture is a message.
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.click(sendButton());

		expect(onSend).toHaveBeenCalledWith("", [image], null, []);
	});

	it("sends an image together with its caption", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.type(screen.getByLabelText("Message"), "look at this{Enter}");

		expect(onSend).toHaveBeenCalledWith("look at this", [image], null, []);
	});

	it("shows a preview that can be removed again", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		expect(screen.getByAltText("Attached image preview 1")).toBeInTheDocument();

		await typist.click(screen.getByRole("button", { name: "Remove attached image 1" }));

		expect(screen.queryByAltText("Attached image preview 1")).not.toBeInTheDocument();
	});

	it("releases the object URL when the picture is removed", async () => {
		// Otherwise the file stays in memory for the life of the tab.
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.click(screen.getByRole("button", { name: "Remove attached image 1" }));

		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
	});

	it("clears the attachment after a successful send", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.click(sendButton());

		expect(await screen.findByLabelText("Message")).toHaveValue("");
		expect(screen.queryByAltText("Attached image preview 1")).not.toBeInTheDocument();
	});

	it("sends every picture that was picked, in the order they were picked", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();
		const second = new File(["more-bytes"], "second.png", { type: "image/png" });

		await typist.upload(fileInput(container), [image, second]);
		await typist.click(sendButton());

		expect(onSend).toHaveBeenCalledWith("", [image, second], null, []);
	});

	it("adds to the set on a second trip to the file dialog rather than replacing it", async () => {
		// Picking three photos, remembering a fourth and picking it should leave
		// four attached. Replacing is the behaviour that loses work silently.
		const typist = userEvent.setup();
		const { container } = renderInput();
		const second = new File(["more-bytes"], "second.png", { type: "image/png" });

		await typist.upload(fileInput(container), image);
		await typist.upload(fileInput(container), second);

		expect(screen.getByAltText("Attached image preview 1")).toBeInTheDocument();
		expect(screen.getByAltText("Attached image preview 2")).toBeInTheDocument();
	});

	it("removes the one that was clicked, not the first", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();
		const second = new File(["more-bytes"], "second.png", { type: "image/png" });

		await typist.upload(fileInput(container), [image, second]);
		await typist.click(screen.getByRole("button", { name: "Remove attached image 1" }));
		await typist.click(sendButton());

		expect(onSend).toHaveBeenCalledWith("", [second], null, []);
	});

	it("refuses more than the cap, and says so", async () => {
		// Refusing before the upload is the difference between a sentence and a
		// hundred megabytes crossing the wire to be rejected at the other end.
		const typist = userEvent.setup();
		const { container } = renderInput();
		const eleven = Array.from(
			{ length: 11 },
			(_, index) => new File(["bytes"], `photo-${index}.png`, { type: "image/png" }),
		);

		await typist.upload(fileInput(container), eleven);
		await typist.click(screen.getByRole("button", { name: "Add an attachment" }));

		expect(screen.getByRole("alert")).toHaveTextContent("at most 10 images");
		expect(screen.getAllByAltText(/Attached image preview/)).toHaveLength(10);
		expect(screen.getByRole("menuitem", { name: "At most 10 images" })).toBeDisabled();
	});

	it("empties the composer on a picture send without waiting for the upload", async () => {
		// The composer used to hold the previews and a progress bar until the
		// upload landed, so the picture was never in the thread and in the
		// composer at the same time. It goes up as an optimistic bubble now, and
		// leaving the previews behind would show the same photo twice.
		let resolveSend = () => {};
		onSend.mockReturnValue(
			new Promise<void>((resolve) => {
				resolveSend = resolve;
			}),
		);
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.click(sendButton());

		expect(screen.queryByAltText("Attached image preview 1")).not.toBeInTheDocument();
		// And the send button is gone with them: an empty composer offers the
		// voice recorder instead, which is the state a fresh one is in.
		expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
		resolveSend();
	});

	it("says nothing about a failed picture, because its bubble already does", async () => {
		// The retry lives on the draft in the thread. A second copy of the same
		// news, in a composer the sender has already moved on from, is noise —
		// and worse, it invites a re-send of a photo that is one click from
		// being retried where it actually is.
		onSend.mockRejectedValue(new Error("Network is down"));
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.click(sendButton());

		await waitFor(() => expect(onSend).toHaveBeenCalled());
		expect(screen.queryByText("Network is down")).not.toBeInTheDocument();
		expect(screen.queryByAltText("Attached image preview 1")).not.toBeInTheDocument();
	});
});
