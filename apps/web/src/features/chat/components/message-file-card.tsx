import type { AttachmentDTO } from "@chatty/shared-types";
import { FileArchive, FileText, FileType2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatBytes } from "../utils/attachment-size";

interface MessageFileCardProps {
	attachment: AttachmentDTO;
	className?: string;
}

export function MessageFileCard({ attachment, className }: MessageFileCardProps) {
	const Icon = attachment.mediaType.includes("zip")
		? FileArchive
		: attachment.mediaType.includes("pdf")
			? FileType2
			: FileText;

	return (
		<a
			href={attachment.url}
			download={attachment.fileName ?? "download"}
			className={cn(
				"flex min-w-0 w-max max-w-full items-center gap-3 rounded-media bg-paper-sunken px-3.5 py-3 text-ink",
				className,
			)}
		>
			<Icon aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">{attachment.fileName ?? "Download"}</span>
				<span className="meta block text-ink-faint">{formatBytes(attachment.byteSize)}</span>
			</span>
		</a>
	);
}
