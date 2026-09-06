import type { ParticipantDTO } from "@chatty/shared-types";
import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";

interface ConversationNicknameRowProps {
	conversationId: string;
	participant: ParticipantDTO;
	isSelf: boolean;
}

/**
 * One member's shared name, editable in place by anyone in the conversation.
 *
 * Editing replaces the displayed name itself rather than opening a second
 * input beside it — there is one name on screen for this person, not a real
 * name and a draft nickname shown at once.
 */
export function ConversationNicknameRow({ conversationId, participant, isSelf }: ConversationNicknameRowProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(participant.nickname ?? participant.displayName);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	async function save() {
		const trimmed = draft.trim();
		if (!trimmed) return;
		setIsSaving(true);
		setError("");
		try {
			// Typing the real name back is how a nickname is cleared, not a separate control.
			await api.setConversationNickname(
				conversationId,
				participant.id,
				trimmed === participant.displayName ? null : trimmed,
			);
			setIsEditing(false);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not save name");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<li className="flex flex-col gap-1 px-1 py-2">
			<div className="flex items-center gap-2.5">
				<Avatar user={participant} size="sm" />
				{isEditing ? (
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void save();
						}}
						className="flex min-w-0 flex-1 items-center gap-1.5"
					>
						<input
							autoFocus
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							maxLength={50}
							disabled={isSaving}
							aria-label={`Name for ${participant.displayName}`}
							className="min-w-0 flex-1 rounded-control border border-rule bg-paper-raised px-2 py-1 text-[13px] text-ink outline-none focus:border-ink"
						/>
						<Button
							type="submit"
							variant="ghost"
							aria-label="Save"
							disabled={isSaving}
							className="size-8 shrink-0 p-0"
						>
							<Check className="size-4" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							aria-label="Cancel"
							disabled={isSaving}
							onClick={() => setIsEditing(false)}
							className="size-8 shrink-0 p-0"
						>
							<X className="size-4" />
						</Button>
					</form>
				) : (
					<>
						<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
							{participant.nickname ?? participant.displayName}
							{isSelf && <span className="font-normal text-ink-faint"> (you)</span>}
						</span>
						<Button
							variant="ghost"
							aria-label={`Edit ${participant.displayName}'s name`}
							onClick={() => {
								setDraft(participant.nickname ?? participant.displayName);
								setIsEditing(true);
							}}
							className="size-8 shrink-0 p-0 text-ink-faint"
						>
							<Pencil className="size-3.5" />
						</Button>
					</>
				)}
			</div>
			{error && (
				<p role="alert" className="eyebrow ml-10 text-signal">
					{error}
				</p>
			)}
		</li>
	);
}
