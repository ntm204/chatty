import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MessageDeliveryStatus } from "@/features/chat/components/message-delivery-status";
import { ComposerUploadPreview } from "@/features/chat/components/composer-upload-preview";

afterEach(() => vi.restoreAllMocks());

it("separates preparation, measured upload and server confirmation", () => {
	const props = { state: "pending" as const, onRetry: vi.fn(), onDiscard: vi.fn() };
	const view = render(<MessageDeliveryStatus {...props} phase="preparing" />);
	expect(screen.getByRole("status")).toHaveTextContent("Preparing images…");
	view.rerender(<MessageDeliveryStatus {...props} phase="uploading" />);
	expect(screen.getByRole("status")).toHaveTextContent("Uploading…");
	expect(screen.queryByText(/%/)).toBeNull();
	view.rerender(<MessageDeliveryStatus {...props} phase="uploading" progress={42} />);
	expect(screen.getByRole("status")).toHaveTextContent("42%");
	view.rerender(<MessageDeliveryStatus {...props} phase="confirming" progress={100} />);
	expect(screen.getByRole("status")).toHaveTextContent("Awaiting confirmation…");
	expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
});

it("explains offline waiting and prevents futile retries while retaining discard", () => {
	const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
	const onRetry = vi.fn();
	const onDiscard = vi.fn();
	render(<MessageDeliveryStatus state="failed" onRetry={onRetry} onDiscard={onDiscard} />);
	expect(screen.getByRole("status")).toHaveTextContent("Waiting for network");
	expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Discard" }));
	expect(onDiscard).toHaveBeenCalledOnce();
	online.mockReturnValue(true);
	act(() => window.dispatchEvent(new Event("online")));
	expect(screen.getByRole("status")).toHaveTextContent("Not sent");
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(onRetry).toHaveBeenCalledOnce();
});

it("does not call an uploaded file successful before acknowledgement", () => {
	render(
		<ComposerUploadPreview
			error=""
			isDisabled={false}
			isSending
			uploadProgress={100}
			attachments={[]}
			previewUrls={[]}
			selectedFile={new File(["file"], "report.pdf")}
			onRemoveImage={vi.fn()}
			onRemoveFile={vi.fn()}
			onRetryFile={vi.fn()}
		/>,
	);
	expect(screen.getByRole("status")).toHaveAccessibleName("Uploaded. Waiting for server confirmation");
	expect(screen.getByRole("button", { name: "Remove attached file" })).toBeDisabled();
});
