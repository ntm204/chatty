import { Button } from "@/components/button";

interface ComposerDraftNoticesProps {
	isBlocked: boolean;
	hasStorageError: boolean;
	pendingReplyId: string | null;
	replyError: string;
	onRestoreReply: (messageId: string) => void;
	onCancelReply: () => void;
}

export function ComposerDraftNotices({
	isBlocked,
	hasStorageError,
	pendingReplyId,
	replyError,
	onRestoreReply,
	onCancelReply,
}: ComposerDraftNoticesProps) {
	return (
		<>
			{isBlocked && (
				<p role="status" className="mb-2 rounded-control bg-signal-soft px-3 py-2 text-[13px] text-signal">
					You blocked this person. Unblock them to send a message.
				</p>
			)}
			{hasStorageError && (
				<p role="status" className="mb-2 text-xs text-signal">
					This draft cannot be saved on this device. Keep this page open to avoid losing it.
				</p>
			)}
			{pendingReplyId && (
				<div className="mb-2 rounded-control bg-paper-sunken p-3 text-sm text-ink-soft">
					<p role={replyError ? "alert" : "status"}>{replyError || "Restoring reply…"}</p>
					{replyError && (
						<Button variant="ghost" onClick={() => onRestoreReply(pendingReplyId)}>
							Retry reply
						</Button>
					)}
					<Button variant="ghost" onClick={onCancelReply}>
						Remove reply
					</Button>
				</div>
			)}
		</>
	);
}
