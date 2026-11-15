import type { ProtectedMessageContentDTO } from "@chatty/shared-types";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/utils/cn";
import { getErrorMessage } from "@/utils/get-error-message";
import { INCOMING_BUBBLE_RADIUS } from "../constants/message-row";
import type { ClusterPosition } from "../types/message-row";
import type { ThreadMessage } from "../../types/thread-message";
import { describeProtectedContent } from "../utils/protected-message";
import { ProtectedMessageViewer } from "./protected-message-viewer";

interface ProtectedMessageCoverProps {
	message: ThreadMessage;
	clusterPosition: ClusterPosition;
	footer?: ReactNode;
}

/**
 * A protected message as its recipient sees it: a cover, until they choose to open it.
 *
 * Opening is a deliberate tap on the cover, never a hover or an automatic
 * reveal, because it can only happen once — the server records the view before
 * it hands the content over. Afterwards the cover says "Opened" and stays a
 * cover: there is no second look to offer. See ADR 0023.
 */
export function ProtectedMessageCover({ message, clusterPosition, footer }: ProtectedMessageCoverProps) {
	const currentUser = useAuth((state) => state.currentUser);
	const [content, setContent] = useState<ProtectedMessageContentDTO | null>(null);
	const [isOpening, setIsOpening] = useState(false);
	// Held locally too: the server's "opened" broadcast may trail the close.
	const [hasOpened, setHasOpened] = useState(false);
	const [error, setError] = useState("");
	const protection = message.protection!;
	const isOpened = hasOpened || Boolean(currentUser && protection.openedByUserIds.includes(currentUser.id));
	const kind = describeProtectedContent(protection);

	async function open() {
		if (isOpening || isOpened) return;
		setIsOpening(true);
		setError("");
		try {
			setContent(await api.openProtectedMessage(message.conversationId, message.id));
			setHasOpened(true);
		} catch (openError) {
			setError(getErrorMessage(openError, "The message could not be opened. Try again."));
		} finally {
			setIsOpening(false);
		}
	}

	return (
		<div className="flex flex-col items-start text-ink">
			<Button
				variant="ghost"
				onClick={() => void open()}
				disabled={isOpening || isOpened}
				aria-label={
					isOpened ? `Protected ${kind.toLowerCase()}, opened` : `Open protected ${kind.toLowerCase()}`
				}
				className={cn(
					"chat-bubble chat-bubble-theirs h-auto min-w-48 justify-start gap-3 bg-paper-sunken px-3 py-2.5 text-left font-normal",
					INCOMING_BUBBLE_RADIUS[clusterPosition],
					(clusterPosition === "solo" || clusterPosition === "last") && "chat-bubble-tail",
					"disabled:opacity-100",
				)}
			>
				<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper-raised">
					<Lock aria-hidden="true" className="size-4 text-ink-soft" />
				</span>
				<span className="flex min-w-0 flex-col">
					<span className="text-sm font-medium text-ink">Protected {kind.toLowerCase()}</span>
					<span className="note text-ink-faint">
						{isOpened ? "Opened" : isOpening ? "Opening…" : "Tap to open · once"}
					</span>
				</span>
			</Button>
			{error && (
				<p role="alert" className="note mt-1 px-1 text-signal">
					{error}
				</p>
			)}
			{footer}
			{content && currentUser && (
				<ProtectedMessageViewer
					content={content}
					viewerLabel={`${currentUser.displayName} @${currentUser.handle}`}
					isOneTime
					onClose={() => setContent(null)}
				/>
			)}
		</div>
	);
}
