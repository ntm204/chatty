import { useState } from "react";
import { api } from "@/api/client";
import { Switch } from "@/components/switch";
import { getErrorMessage } from "@/utils/get-error-message";

interface ConversationSharingControlProps {
	conversationId: string;
	isRestricted: boolean;
	/** False for a group member who is not an admin — the server refuses them too. */
	canChange: boolean;
}

/**
 * Forwarding for the whole chat, whoever wrote the message. Announced to
 * everyone by name when it changes, so it cannot be lifted quietly.
 */
export function ConversationSharingControl({
	conversationId,
	isRestricted,
	canChange,
}: ConversationSharingControlProps) {
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	async function change(next: boolean) {
		if (!canChange || isSaving) return;
		setIsSaving(true);
		setError("");
		try {
			await api.setSharingRestriction(conversationId, next);
		} catch (changeError) {
			setError(getErrorMessage(changeError, "The setting could not be changed. Try again."));
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-1 py-3">
			<div className="flex items-center justify-between gap-4">
				<span className="text-[13px] font-medium text-ink">Allow forwarding</span>
				<Switch
					label="Allow forwarding in this chat"
					isOn={!isRestricted}
					isDisabled={!canChange}
					onChange={(isAllowed) => void change(!isAllowed)}
				/>
			</div>
			{!canChange && <p className="note text-ink-faint">Only admins can change this.</p>}
			{error && (
				<p role="alert" className="note text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
