import type { MessageTimerSeconds } from "@chatty/shared-types";
import { useState } from "react";
import { api } from "@/api/client";
import { MessageTimerPicker } from "@/components/message-timer-picker";
import { getErrorMessage } from "@/utils/get-error-message";

interface ConversationMessageTimerControlProps {
	conversationId: string;
	timer: MessageTimerSeconds | null;
	/** False for a group member who is not an admin — the server refuses them too. */
	canChange: boolean;
}

/**
 * Disappearing messages for this conversation. The one sentence says the two
 * things to know before choosing: it applies to everyone, and everyone sees
 * who changed it — nothing about it is hidden from the other side.
 */
export function ConversationMessageTimerControl({
	conversationId,
	timer,
	canChange,
}: ConversationMessageTimerControlProps) {
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	async function change(seconds: MessageTimerSeconds | null) {
		if (!canChange || isSaving) return;
		setIsSaving(true);
		setError("");
		try {
			await api.setMessageTimer(conversationId, seconds);
		} catch (changeError) {
			setError(getErrorMessage(changeError, "The timer could not be changed. Try again."));
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-2 py-3">
			<span id="conversation-message-timer-label" className="text-[13px] font-medium text-ink">
				Disappearing messages
			</span>
			<MessageTimerPicker
				value={timer}
				onChange={(seconds) => void change(seconds)}
				isDisabled={!canChange}
				labelledBy="conversation-message-timer-label"
			/>
			{!canChange && <p className="note text-ink-faint">Only admins can change this.</p>}
			{error && (
				<p role="alert" className="note text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
