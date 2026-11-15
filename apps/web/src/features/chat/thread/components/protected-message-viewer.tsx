import type { ProtectedMessageContentDTO } from "@chatty/shared-types";
import { EyeOff, Lock, X } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { PROTECTED_WATERMARK_REPEATS } from "../constants/message-row";
import { useConcealedWhenAway } from "../hooks/use-concealed-when-away";
import { refuseEvent } from "../utils/refuse-event";

interface ProtectedMessageViewerProps {
	content: ProtectedMessageContentDTO;
	/** Who is looking — drawn across the content, so a capture says who took it. */
	viewerLabel: string;
	/** True for a recipient's one opening; the author may look again. */
	isOneTime: boolean;
	onClose: () => void;
}

/**
 * An opened protected message.
 *
 * Every deterrent a web page honestly has, and a sentence saying where they
 * stop: copying, dragging, the context menu and printing are refused; the
 * content covers itself whenever the window is not in front; and the viewer's
 * own name runs across it, so a screenshot or a photo of the screen names the
 * person who took it. None of that stops a capture, and the footer says so
 * rather than letting the lock imply otherwise. See ADR 0023.
 *
 * The content lives only in this component's props. Closing it is the end of a
 * recipient's one look: nothing was written to the thread or the local cache.
 */
export function ProtectedMessageViewer({ content, viewerLabel, isOneTime, onClose }: ProtectedMessageViewerProps) {
	const close = useCallback(() => onClose(), [onClose]);
	const ref = useDialog<HTMLDivElement>(close);
	const isConcealed = useConcealedWhenAway();

	return (
		<div
			className="protected-viewer fixed inset-0 z-50 flex items-center justify-center bg-scrim/60 p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={ref}
				role="dialog"
				aria-modal="true"
				aria-label="Protected message"
				tabIndex={-1}
				className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-panel border border-rule bg-paper-raised shadow-modal outline-none"
			>
				<div className="relative flex shrink-0 items-center gap-2 border-b border-rule px-4 py-3">
					<Lock aria-hidden="true" className="size-4 text-ink-soft" />
					<h2 className="text-sm font-semibold">Protected message</h2>
					<Button
						variant="ghost"
						aria-label="Close protected message"
						onClick={onClose}
						className="absolute right-2 top-2 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>

				<div
					onCopy={refuseEvent}
					onCut={refuseEvent}
					onContextMenu={refuseEvent}
					onDragStart={refuseEvent}
					className="relative min-h-32 select-none overflow-y-auto p-4"
				>
					<div className={isConcealed ? "invisible" : "flex flex-col gap-3"}>
						{content.attachments.map((attachment) => (
							<img
								key={attachment.id}
								src={attachment.url}
								alt=""
								draggable={false}
								className="w-full rounded-control object-contain"
							/>
						))}
						{content.content && (
							<p className="font-content whitespace-pre-wrap wrap-anywhere text-[15px]/[1.55] text-ink">
								{content.content}
							</p>
						)}
					</div>

					<div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
						<div className="protected-watermark">
							{Array.from({ length: PROTECTED_WATERMARK_REPEATS }, (_, index) => (
								<span key={index}>{viewerLabel}</span>
							))}
						</div>
					</div>

					{isConcealed && (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-paper-raised text-ink-soft">
							<EyeOff aria-hidden="true" className="size-5" />
							<p className="text-[13px]">Hidden while Chatty is in the background</p>
						</div>
					)}
				</div>

				<p className="note border-t border-rule-soft px-4 py-3 text-ink-faint">
					{isOneTime ? "You can open this once. It's gone when you close it. " : ""}
					Chatty can't stop screenshots or photos of the screen — your name is shown across it.
				</p>
			</div>
		</div>
	);
}
