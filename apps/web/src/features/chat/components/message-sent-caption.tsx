import type { ParticipantDTO } from "@chatty/shared-types";
import { CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { SENT_CAPTION_WINDOW_MS } from "../constants/message";
import type { ReadReceipt } from "../utils/read-receipt";
import { formatRelativeTime } from "../utils";

interface MessageSentCaptionProps {
	createdAt: string;
	isMine: boolean;
	isLastMessage: boolean;
	isGroup: boolean;
	isDeleted: boolean;
	hasDeliveryState: boolean;
	receipt: ReadReceipt | null;
	participants: ParticipantDTO[];
}

/**
 * Messenger-style caption below the newest message I sent — "Sent"/"Seen" plus
 * how long ago, with the reader's own mark beside it. Expires to an ordinary
 * hover-only time once `SENT_CAPTION_WINDOW_MS` has passed, the same as it
 * would if Facebook's own client stopped calling it "news" after a while.
 */
export function MessageSentCaption({
	createdAt,
	isMine,
	isLastMessage,
	isGroup,
	isDeleted,
	hasDeliveryState,
	receipt,
	participants,
}: MessageSentCaptionProps) {
	const showsCaption = isMine && isLastMessage && !isDeleted && !hasDeliveryState;
	const [isExpired, setIsExpired] = useState(false);
	const [isReaderListOpen, setIsReaderListOpen] = useState(false);

	useEffect(() => {
		if (!showsCaption) return;
		const remaining = SENT_CAPTION_WINDOW_MS - (Date.now() - new Date(createdAt).getTime());
		if (remaining <= 0) {
			setIsExpired(true);

			return;
		}
		const timer = window.setTimeout(() => setIsExpired(true), remaining);

		return () => window.clearTimeout(timer);
	}, [showsCaption, createdAt]);

	const showsReceiptOnly = receipt && !(showsCaption && !isExpired);
	if (!(showsCaption && !isExpired) && !showsReceiptOnly) return null;

	const readers = receipt
		? receipt.readerIds
				.map((readerId) => participants.find((participant) => participant.id === readerId))
				.filter((participant): participant is ParticipantDTO => Boolean(participant))
		: [];

	return (
		<div className="relative mr-2 mt-1 flex items-center gap-1">
			{receipt &&
				(isGroup ? (
					<Button
						variant="ghost"
						onClick={() => setIsReaderListOpen((current) => !current)}
						aria-label={`Seen by ${receipt.readerCount}`}
						aria-expanded={isReaderListOpen}
						className="-space-x-1.5 px-0 py-0 hover:bg-transparent"
					>
						{readers.slice(0, 3).map((reader) => (
							<Avatar key={reader.id} user={reader} size="2xs" className="ring-1 ring-paper" />
						))}
					</Button>
				) : (
					<CheckCheck aria-label="Seen" className="size-3 text-signal" />
				))}
			{showsCaption && !isExpired && (
				<span className="meta text-ink-faint">
					{receipt ? "Seen" : "Sent"} {formatRelativeTime(createdAt)}
				</span>
			)}
			{isReaderListOpen && (
				<div className="absolute bottom-full right-0 z-30 mb-2 w-48 rounded-control border border-rule bg-paper-raised p-2 shadow-lift">
					<p className="eyebrow px-2 pb-1 text-ink-faint">Seen by</p>
					{readers.map((reader) => (
						<div key={reader.id} className="flex items-center gap-2 px-2 py-1.5 text-xs text-ink-soft">
							<Avatar user={reader} size="xs" />
							<span className="truncate">{reader.nickname ?? reader.displayName}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
