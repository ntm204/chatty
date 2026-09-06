import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentLightbox } from "@/features/chat/components/attachment-lightbox";
import { makeAttachment } from "./factories";

function makeAttachments(count: number) {
	return Array.from({ length: count }, (_, index) =>
		makeAttachment({ id: `attachment-${index}`, url: `http://api.test/attachments/${index}?token=signed` }),
	);
}

describe("AttachmentLightbox", () => {
	it("states the caption once, and not as a layer over the picture", () => {
		render(
			<AttachmentLightbox
				attachments={[makeAttachment()]}
				initialIndex={0}
				caption="chuyến đi tuần rồi"
				onClose={vi.fn()}
			/>,
		);

		const caption = screen.getByText("chuyến đi tuần rồi");
		expect(caption).not.toHaveClass("absolute");
		expect(caption).toHaveClass("text-center");
	});

	it("walks the set from a thumbnail and says which one is open", () => {
		render(<AttachmentLightbox attachments={makeAttachments(4)} initialIndex={0} caption="" onClose={vi.fn()} />);

		fireEvent.click(screen.getByRole("button", { name: "View image 3 of 4" }));

		expect(screen.getByRole("dialog", { name: "Image 3 of 4" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "View image 3 of 4" })).toHaveAttribute("aria-pressed", "true");
		expect(screen.queryByText(/Photo set/i)).not.toBeInTheDocument();
	});

	it("draws no arrows and no strip for a single picture", () => {
		render(<AttachmentLightbox attachments={[makeAttachment()]} initialIndex={0} caption="" onClose={vi.fn()} />);

		expect(screen.queryByRole("button", { name: "Next image" })).not.toBeInTheDocument();
		expect(screen.queryByRole("group", { name: "Image thumbnails" })).not.toBeInTheDocument();
	});

	it("closes on a press on the backdrop but not on a press on the picture", async () => {
		const onClose = vi.fn();
		render(<AttachmentLightbox attachments={[makeAttachment()]} initialIndex={0} caption="" onClose={onClose} />);
		const dialog = screen.getByRole("dialog");

		fireEvent.click(within(dialog).getByAltText("Image"));
		expect(onClose).not.toHaveBeenCalled();

		fireEvent.click(dialog);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	});

	it("keeps a press on an arrow from closing the viewer underneath it", () => {
		const onClose = vi.fn();
		render(<AttachmentLightbox attachments={makeAttachments(3)} initialIndex={0} caption="" onClose={onClose} />);

		fireEvent.click(screen.getByRole("button", { name: "Next image" }));

		expect(screen.getByRole("dialog", { name: "Image 2 of 3" })).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	it("keeps navigation on fixed rails outside the image and the dock out of the thumbnail strip", () => {
		render(<AttachmentLightbox attachments={makeAttachments(3)} initialIndex={0} caption="" onClose={vi.fn()} />);

		const previousButton = screen.getByRole("button", { name: "Previous image" });
		const nextButton = screen.getByRole("button", { name: "Next image" });
		const imageArea = screen.getByAltText("Image").closest("[data-lightbox-image-area]");
		expect(imageArea).not.toContainElement(previousButton);
		expect(imageArea).not.toContainElement(nextButton);
		expect(previousButton.parentElement).toHaveAttribute("data-lightbox-navigation-rail", "previous");
		expect(nextButton.parentElement).toHaveAttribute("data-lightbox-navigation-rail", "next");
		expect(screen.getByRole("button", { name: "Zoom in" }).parentElement).not.toHaveClass("absolute");
	});
});

describe("AttachmentLightbox zoom and rotation", () => {
	it("zooms with the toolbar and disables each button at its own bound", () => {
		render(<AttachmentLightbox attachments={[makeAttachment()]} initialIndex={0} caption="" onClose={vi.fn()} />);

		expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();

		fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
		expect(screen.getByText("150%")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Zoom out" })).toBeEnabled();

		fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
		expect(screen.getByText("100%")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
	});

	it("zooms in on a double-click and back out on the next one", () => {
		render(<AttachmentLightbox attachments={[makeAttachment()]} initialIndex={0} caption="" onClose={vi.fn()} />);
		const image = screen.getByAltText("Image");

		fireEvent.doubleClick(image);
		expect(screen.getByText("250%")).toBeInTheDocument();

		fireEvent.doubleClick(image);
		expect(screen.getByText("100%")).toBeInTheDocument();
	});

	it("rotates in either direction and wraps back to upright", () => {
		render(<AttachmentLightbox attachments={[makeAttachment()]} initialIndex={0} caption="" onClose={vi.fn()} />);
		const image = screen.getByAltText("Image");
		const rotateClockwiseButton = screen.getByRole("button", { name: "Rotate image clockwise" });
		const rotateCounterclockwiseButton = screen.getByRole("button", { name: "Rotate image counterclockwise" });

		fireEvent.click(rotateClockwiseButton);
		expect(image.style.transform).toContain("rotate(90deg)");

		fireEvent.click(rotateCounterclockwiseButton);
		expect(image.style.transform).toContain("rotate(0deg)");
	});

	it("fits a wide photograph after a quarter turn without changing its form", () => {
		render(<AttachmentLightbox attachments={[makeAttachment()]} initialIndex={0} caption="" onClose={vi.fn()} />);
		const image = screen.getByAltText("Image");
		const imageArea = image.closest("[data-lightbox-image-area]");
		if (!(imageArea instanceof HTMLDivElement)) throw new Error("The image area is missing");

		Object.defineProperties(image, {
			offsetWidth: { configurable: true, value: 1600 },
			offsetHeight: { configurable: true, value: 900 },
		});
		vi.spyOn(imageArea, "getBoundingClientRect").mockReturnValue({ width: 1600, height: 1000 } as DOMRect);

		fireEvent.load(image);
		fireEvent.click(screen.getByRole("button", { name: "Rotate image clockwise" }));

		expect(image.style.transform).toContain("rotate(90deg)");
		expect(image.style.transform).toContain("scale(0.625)");
	});

	it("responds to the keyboard: +/- zoom, 0 resets, R rotates", () => {
		render(<AttachmentLightbox attachments={[makeAttachment()]} initialIndex={0} caption="" onClose={vi.fn()} />);
		const image = screen.getByAltText("Image");

		fireEvent.keyDown(window, { key: "+" });
		expect(screen.getByText("150%")).toBeInTheDocument();

		fireEvent.keyDown(window, { key: "-" });
		expect(screen.getByText("100%")).toBeInTheDocument();

		fireEvent.keyDown(window, { key: "r" });
		expect(image.style.transform).toContain("rotate(90deg)");
		fireEvent.keyDown(window, { key: "R", shiftKey: true });
		expect(image.style.transform).toContain("rotate(0deg)");

		fireEvent.keyDown(window, { key: "+" });
		fireEvent.keyDown(window, { key: "0" });
		expect(screen.getByText("100%")).toBeInTheDocument();
	});

	it("resets zoom and rotation when the reader moves to the next picture", () => {
		render(<AttachmentLightbox attachments={makeAttachments(2)} initialIndex={0} caption="" onClose={vi.fn()} />);

		fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
		fireEvent.click(screen.getByRole("button", { name: "Rotate image clockwise" }));
		expect(screen.getByText("150%")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Next image" }));

		expect(screen.getByText("100%")).toBeInTheDocument();
		expect(screen.getByAltText("Image").style.transform).toContain("rotate(0deg)");
	});
});

describe("AttachmentLightbox saving an image", () => {
	const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

	beforeEach(() => {
		clickSpy.mockClear();
		// jsdom implements neither, and the download is the one thing here that
		// cannot be done with an ordinary anchor — see `downloadAttachment`.
		URL.createObjectURL = vi.fn(() => "blob:saved");
		URL.revokeObjectURL = vi.fn();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("fetches the bytes and hands them to a download rather than navigating to them", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				blob: async () => new Blob(["picture"]),
			}),
		);
		render(<AttachmentLightbox attachments={[makeAttachment()]} initialIndex={0} caption="" onClose={vi.fn()} />);

		fireEvent.click(screen.getByRole("button", { name: "Save this image" }));

		await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
		expect(fetch).toHaveBeenCalledWith("http://api.test/attachments/attachment-1?token=signed");
	});

	it("says so when the bytes never arrive, instead of failing silently", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
		render(<AttachmentLightbox attachments={[makeAttachment()]} initialIndex={0} caption="" onClose={vi.fn()} />);

		fireEvent.click(screen.getByRole("button", { name: "Save this image" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("This image could not be saved");
		expect(clickSpy).not.toHaveBeenCalled();
	});
});
