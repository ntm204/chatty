import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageGallery } from "@/features/chat/components/message-gallery";
import { makeAttachment } from "./factories";

/** `n` distinct images — distinct ids, because every card in the stack keys on them. */
function makeAttachments(count: number) {
	return Array.from({ length: count }, (_, index) =>
		makeAttachment({ id: `attachment-${index}`, url: `http://api.test/attachments/${index}?token=signed` }),
	);
}

describe("MessageGallery with one image", () => {
	it("describes the image with its caption", () => {
		render(<MessageGallery attachments={[makeAttachment()]} caption="the whiteboard" />);

		expect(screen.getByAltText("the whiteboard")).toBeInTheDocument();
	});

	it("still says something when there is no caption", () => {
		// An empty alt tells a screen reader the image is decorative, which would
		// make a message that is only a picture read as nothing at all.
		render(<MessageGallery attachments={[makeAttachment()]} caption="" />);

		expect(screen.getByAltText("Image")).toBeInTheDocument();
	});

	it("sets width and height so the box is reserved before the image loads", () => {
		// Without these attributes every picture decoding mid-scroll shoves the
		// messages below it down. Only the single-image case can do this — an album
		// cover is square whatever the picture's shape.
		render(<MessageGallery attachments={[makeAttachment({ width: 1600, height: 800 })]} caption="" />);

		const image = screen.getByAltText("Image");
		expect(image).toHaveAttribute("width", "380");
		expect(image).toHaveAttribute("height", "190");
	});

	it("loads lazily, because most of a loaded page is off screen", () => {
		render(<MessageGallery attachments={[makeAttachment()]} caption="" />);

		expect(screen.getByAltText("Image")).toHaveAttribute("loading", "lazy");
	});

	it("uses the thumbnail in the thread and the full image only in the viewer", () => {
		const attachment = makeAttachment({
			url: "http://api.test/photo-full",
			thumbUrl: "http://api.test/photo-thumb",
		});
		render(<MessageGallery attachments={[attachment]} caption="" />);

		expect(screen.getByAltText("Image")).toHaveAttribute("src", attachment.thumbUrl);
		fireEvent.click(screen.getByRole("button", { name: "Open image" }));

		expect(within(screen.getByRole("dialog")).getByAltText("Image")).toHaveAttribute("src", attachment.url);
	});

	it("keeps the caption out of the thread and states it beside the opened image", () => {
		const caption = "the whiteboard notes that belong to this photo and continue past one compact line";
		render(<MessageGallery attachments={[makeAttachment()]} caption={caption} />);

		expect(screen.queryByText(caption)).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: `Open image and caption: ${caption}` }));

		// Not merely present: *not laid over the picture*. A positioned caption
		// covered the top of every photograph whose subject was at the top of it.
		const captionText = within(screen.getByRole("dialog")).getByText(caption);
		expect(captionText).not.toHaveClass("absolute");
	});

	it("forwards the message from the viewer, and closes it so the forward panel is reachable", async () => {
		const onForward = vi.fn();
		render(<MessageGallery attachments={[makeAttachment()]} caption="" onForward={onForward} />);
		fireEvent.click(screen.getByRole("button", { name: "Open image" }));

		fireEvent.click(screen.getByRole("button", { name: "Forward this message" }));

		await waitFor(() => expect(onForward).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
	});

	it("offers no forward control when there is no message to forward", () => {
		render(<MessageGallery attachments={[makeAttachment()]} caption="" />);
		fireEvent.click(screen.getByRole("button", { name: "Open image" }));

		expect(screen.queryByRole("button", { name: "Forward this message" })).not.toBeInTheDocument();
	});
});

describe("MessageGallery with several images", () => {
	it("draws one stack rather than a tile per picture", () => {
		render(<MessageGallery attachments={makeAttachments(5)} caption="" />);

		expect(screen.getAllByRole("button")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Open album of 5 images" })).toBeInTheDocument();
	});

	it("says how many there are", () => {
		render(<MessageGallery attachments={makeAttachments(5)} caption="" />);

		expect(screen.getByText("5")).toBeInTheDocument();
	});

	it("opens the viewer on the whole set, not just what is drawn", () => {
		render(<MessageGallery attachments={makeAttachments(5)} caption="" />);

		fireEvent.click(screen.getByRole("button", { name: "Open album of 5 images" }));

		expect(screen.getByRole("dialog", { name: "Image 1 of 5" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "View image 5 of 5" })).toBeInTheDocument();
	});

	it("walks the set with the arrow keys and wraps at the end", () => {
		render(<MessageGallery attachments={makeAttachments(2)} caption="" />);
		fireEvent.click(screen.getByRole("button", { name: "Open album of 2 images" }));

		fireEvent.keyDown(window, { key: "ArrowRight" });
		expect(screen.getByRole("dialog", { name: "Image 2 of 2" })).toBeInTheDocument();

		fireEvent.keyDown(window, { key: "ArrowRight" });
		expect(screen.getByRole("dialog", { name: "Image 1 of 2" })).toBeInTheDocument();
	});

	it("closes on Escape", async () => {
		render(<MessageGallery attachments={makeAttachments(2)} caption="" />);
		fireEvent.click(screen.getByRole("button", { name: "Open album of 2 images" }));

		fireEvent.keyDown(document, { key: "Escape" });

		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
	});

	it("renders nothing at all when there are no images", () => {
		const { container } = render(<MessageGallery attachments={[]} caption="" />);

		expect(container).toBeEmptyDOMElement();
	});
});
