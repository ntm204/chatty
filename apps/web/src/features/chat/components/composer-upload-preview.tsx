import { X } from "lucide-react";
import { Button } from "@/components/button";
import { ComposerAttachments } from "./composer-attachments";

interface ComposerUploadPreviewProps {
	error: string;
	isDisabled: boolean;
	isSending: boolean;
	uploadProgress: number;
	attachments: File[];
	previewUrls: string[];
	selectedFile: File | null;
	onRemoveImage: (index: number) => void;
	onRemoveFile: () => void;
	onRetryFile: () => void;
}

export function ComposerUploadPreview({
	error,
	isDisabled,
	isSending,
	uploadProgress,
	attachments,
	previewUrls,
	selectedFile,
	onRemoveImage,
	onRemoveFile,
	onRetryFile,
}: ComposerUploadPreviewProps) {
	return (
		<>
			{error && (
				<p role="alert" className="eyebrow border-b border-rule-soft px-4 py-2.5 text-signal">
					{error}
				</p>
			)}

			{isSending && (attachments.length > 0 || selectedFile) && (
				<div className="px-4 pt-3" role="status" aria-label={`Uploading attachment ${uploadProgress}%`}>
					<div className="mb-1.5 flex justify-between">
						<span className="eyebrow text-ink-faint">
							{selectedFile
								? `Uploading ${selectedFile.name}`
								: attachments.length > 1
									? `Uploading ${attachments.length} images`
									: "Uploading image"}
						</span>
						<span className="meta text-ink-faint">{uploadProgress}%</span>
					</div>
					<div className="h-[3px] overflow-hidden rounded-badge bg-rule-soft">
						<div className="h-full bg-ink transition-[width]" style={{ width: `${uploadProgress}%` }} />
					</div>
				</div>
			)}

			{previewUrls.length > 0 && <ComposerAttachments previewUrls={previewUrls} onRemove={onRemoveImage} />}
			{selectedFile && (
				<div className="flex items-center gap-2 px-4 pt-3 text-sm text-ink-soft">
					<span className="min-w-0 flex-1 truncate">{selectedFile.name}</span>
					{!isSending && (
						<Button
							variant="ghost"
							onClick={onRetryFile}
							disabled={isDisabled}
							aria-label="Retry file upload"
						>
							Retry
						</Button>
					)}
					<Button
						variant="ghost"
						onClick={onRemoveFile}
						disabled={isSending}
						aria-label="Remove attached file"
						className="size-6 p-0"
					>
						<X className="size-3.5" />
					</Button>
				</div>
			)}
		</>
	);
}
