import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { AttachmentLightbox } from "@/features/chat/components/attachment-lightbox";
import { OFFLINE_IMAGE_URL } from "@/constants/offline-media";
import { makeAttachment } from "./factories";

vi.mock("@/api/client", () => ({ api: { getAttachmentUrls: vi.fn() } }));
afterEach(() => vi.resetAllMocks());

it("retries a failed image through authorized URLs without closing the viewer", async () => {
	const onClose = vi.fn();
	vi.mocked(api.getAttachmentUrls).mockResolvedValue({ url: "https://example.com/renewed.png", thumbUrl: null });
	render(<AttachmentLightbox attachments={[makeAttachment()]} initialIndex={0} caption="Photo" onClose={onClose} />);
	fireEvent.error(screen.getByAltText("Photo"));
	fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
	await waitFor(() => expect(screen.getByAltText("Photo")).toHaveAttribute("src", "https://example.com/renewed.png"));
	expect(api.getAttachmentUrls).toHaveBeenCalledTimes(1);
	expect(onClose).not.toHaveBeenCalled();
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("does not leave an abandoned retry disabled when returning to the same image", async () => {
	let resolve!: (value: { url: string; thumbUrl: null }) => void;
	vi.mocked(api.getAttachmentUrls).mockReturnValue(
		new Promise((finish) => {
			resolve = finish;
		}),
	);
	const attachments = [makeAttachment({ id: "first" }), makeAttachment({ id: "second" })];
	render(<AttachmentLightbox attachments={attachments} initialIndex={0} caption="Photo" onClose={vi.fn()} />);
	fireEvent.error(screen.getByAltText("Photo"));
	fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
	fireEvent.click(screen.getByRole("button", { name: "Next image" }));
	fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
	fireEvent.error(screen.getByAltText("Photo"));
	await act(async () => resolve({ url: "https://example.com/abandoned", thumbUrl: null }));
	expect(screen.getByRole("button", { name: "Retry image" })).toBeEnabled();
	expect(screen.getByAltText("Photo")).not.toHaveAttribute("src", "https://example.com/abandoned");
});

it("ignores renewal from an image that is no longer selected", async () => {
	let resolve!: (value: { url: string; thumbUrl: null }) => void;
	vi.mocked(api.getAttachmentUrls).mockReturnValue(
		new Promise((finish) => {
			resolve = finish;
		}),
	);
	const attachments = [
		makeAttachment({ id: "first", url: "https://example.com/first" }),
		makeAttachment({ id: "second", url: "https://example.com/second" }),
	];
	render(<AttachmentLightbox attachments={attachments} initialIndex={0} caption="Photo" onClose={vi.fn()} />);
	fireEvent.error(screen.getByAltText("Photo"));
	fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
	expect(screen.getByRole("button", { name: "Checking image access…" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Next image" }));
	await act(async () => resolve({ url: "https://example.com/late", thumbUrl: null }));
	expect(screen.getByAltText("Photo")).toHaveAttribute("src", attachments[1]!.url);
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps a denied renewal as an error instead of restoring inaccessible media", async () => {
	vi.mocked(api.getAttachmentUrls).mockRejectedValue(new Error("Not found"));
	const attachment = makeAttachment();
	render(<AttachmentLightbox attachments={[attachment]} initialIndex={0} caption="Photo" onClose={vi.fn()} />);
	fireEvent.error(screen.getByAltText("Photo"));
	fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
	await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("access could not be checked"));
	expect(screen.getByAltText("Photo")).toHaveAttribute("src", attachment.url);
	expect(screen.getByRole("button", { name: "Retry image" })).toBeEnabled();
});

it("does not renew an offline placeholder", () => {
	render(
		<AttachmentLightbox
			attachments={[makeAttachment({ url: OFFLINE_IMAGE_URL })]}
			initialIndex={0}
			caption="Photo"
			onClose={vi.fn()}
		/>,
	);
	fireEvent.error(screen.getByAltText("Photo"));
	expect(screen.queryByRole("button", { name: "Retry image" })).not.toBeInTheDocument();
	expect(api.getAttachmentUrls).not.toHaveBeenCalled();
});
