import type { AttachmentDTO } from "@chatty/shared-types";
import { FileArchive, FileText, FileType2 } from "lucide-react";
import { isOfflineMediaUrl } from "@/utils/is-offline-media-url";
import { cn } from "@/utils/cn";
import { formatBytes } from "../utils/attachment-size";
import { useRef, useState } from "react";
import { downloadAttachment } from "../utils/download-attachment";

interface MessageFileCardProps {
	attachment: AttachmentDTO;
	className?: string;
}

export function MessageFileCard({ attachment, className }: MessageFileCardProps) {
	const isOffline = isOfflineMediaUrl(attachment.url);
	const pendingRef = useRef(false);
	const [isDownloading, setIsDownloading] = useState(false);
	const [error, setError] = useState("");
	const Icon = attachment.mediaType.includes("zip")
		? FileArchive
		: attachment.mediaType.includes("pdf")
			? FileType2
			: FileText;

	return (
		<div className="min-w-0 max-w-full">
			<a
				href={isOffline ? undefined : attachment.url}
				aria-disabled={isOffline || undefined}
				download={attachment.fileName ?? "download"}
				onClick={(event) => {
					event.preventDefault();
					if (isOffline || pendingRef.current) return;
					pendingRef.current = true;
					setIsDownloading(true);
					setError("");
					void downloadAttachment(attachment)
						.catch(() => setError("Could not download this file. Check your connection and try again."))
						.finally(() => {
							pendingRef.current = false;
							setIsDownloading(false);
						});
				}}
				aria-busy={isDownloading}
				className={cn(
					"flex min-w-0 w-max max-w-full items-center gap-3 rounded-media bg-paper-sunken px-3.5 py-3 text-ink",
					className,
				)}
			>
				<Icon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-medium">{attachment.fileName ?? "Download"}</span>
					<span className="meta block text-ink-faint">
						{isOffline
							? "Connect to download this file"
							: isDownloading
								? "Downloading…"
								: formatBytes(attachment.byteSize)}
					</span>
				</span>
			</a>
			{error && (
				<p role="alert" className="mt-1 text-xs text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
