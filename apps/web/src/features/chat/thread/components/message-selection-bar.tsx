import { Copy, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { useAuth } from "@/hooks/use-auth";
import { SHARING_RESTRICTED_TEXT } from "../../constants/message";
import { useMessageSelection } from "../hooks/use-message-selection";
import type { ThreadMessage } from "../../types/thread-message";
import { getConversationPreview } from "../../utils";
import { getErrorMessage } from "@/utils/get-error-message";

interface MessageSelectionBarProps {
	messages: ThreadMessage[];
	isSharingRestricted: boolean;
	onHideMessage: (messageId: string) => void | Promise<void>;
}

/**
 * The bar shown while messages are selected: how many, and what to do with
 * them — copy as text in thread order, or delete for yourself. Escape leaves.
 */
export function MessageSelectionBar({ messages, isSharingRestricted, onHideMessage }: MessageSelectionBarProps) {
	const ids = useMessageSelection((state) => state.ids);
	const currentUserId = useAuth((state) => state.currentUser?.id);
	const clear = useMessageSelection((state) => state.clear);
	const [isWorking, setIsWorking] = useState(false);
	const [error, setError] = useState("");
	const picked = messages.filter((message) => ids.includes(message.id));

	useEffect(() => {
		function leave(event: KeyboardEvent) {
			if (event.key === "Escape" && !event.defaultPrevented) clear();
		}
		document.addEventListener("keydown", leave);

		return () => document.removeEventListener("keydown", leave);
	}, [clear]);

	async function copy() {
		const text = picked
			.map((message) => {
				// The app's own copy honours its author's choice; text selection is the user's.
				const isRestricted =
					isSharingRestricted || (!message.isForwardable && message.author?.id !== currentUserId);

				return `${message.author?.displayName ?? ""}: ${isRestricted ? SHARING_RESTRICTED_TEXT : getConversationPreview(message)}`;
			})
			.join("\n");
		await navigator.clipboard?.writeText(text);
		clear();
	}

	async function deleteForMe() {
		setIsWorking(true);
		setError("");
		try {
			for (const message of picked) await onHideMessage(message.id);
			clear();
		} catch (caught) {
			setError(getErrorMessage(caught, "Some messages could not be deleted. Try again."));
		} finally {
			setIsWorking(false);
		}
	}

	return (
		<div
			role="toolbar"
			aria-label="Selected messages"
			className="message-composer flex shrink-0 items-center gap-2 px-4 sm:px-5"
		>
			<Button variant="ghost" onClick={clear} aria-label="Cancel selection" className="size-8 rounded-full p-0">
				<X className="size-4" />
			</Button>
			<span className="flex-1 text-[14px] font-semibold text-ink tabular-nums">
				{picked.length} selected
				{error && (
					<span role="alert" className="ml-2 text-[12px] font-normal text-signal">
						{error}
					</span>
				)}
			</span>
			<Button variant="ghost" onClick={() => void copy()} disabled={isWorking} className="gap-1.5 px-3">
				<Copy className="size-4" />
				Copy
			</Button>
			<Button
				variant="ghost"
				onClick={() => void deleteForMe()}
				disabled={isWorking}
				className="gap-1.5 px-3 text-signal hover:bg-signal-soft"
			>
				<Trash2 className="size-4" />
				Delete for me
			</Button>
		</div>
	);
}
