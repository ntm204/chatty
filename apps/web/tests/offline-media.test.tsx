import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OFFLINE_BINARY_URL, OFFLINE_IMAGE_URL } from "@/constants/offline-media";
import { MessageFileCard } from "@/features/chat/components/message-file-card";
import { AttachmentLightbox } from "@/features/chat/components/attachment-lightbox";
import { downloadAttachment } from "@/features/chat/utils/download-attachment";
import { makeAttachment } from "./factories";

afterEach(() => vi.unstubAllGlobals());

it("shows cached file metadata without offering a bogus empty download", () => {
	render(
		<MessageFileCard
			attachment={makeAttachment({ kind: "file", fileName: "report.pdf", url: OFFLINE_BINARY_URL })}
		/>,
	);
	expect(screen.getByText("report.pdf")).toBeVisible();
	expect(screen.getByText("Connect to download this file")).toBeVisible();
	expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("disables saving a placeholder image and never fetches placeholder bytes", async () => {
	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	const attachment = makeAttachment({ url: OFFLINE_IMAGE_URL });
	render(<AttachmentLightbox attachments={[attachment]} initialIndex={0} caption="Cached photo" onClose={vi.fn()} />);
	expect(screen.getByRole("button", { name: "Save this image" })).toBeDisabled();
	expect(screen.getByRole("status")).toHaveTextContent("Connect to download the original image");
	await expect(downloadAttachment(attachment)).rejects.toThrow("Connect to download");
	expect(fetch).not.toHaveBeenCalled();
});
