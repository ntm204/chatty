import type { ConversationDTO } from "@chatty/shared-types";
import { Check, X } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { cn } from "@/utils/cn";
import { CONVERSATION_THEME_OPTIONS, getConversationThemeClasses } from "../constants/conversation-theme";

interface ConversationThemeDialogProps {
	conversation: ConversationDTO;
	onClose: () => void;
}

/** Preview is local; Apply uses the existing shared, persisted conversation theme. */
export function ConversationThemeDialog({ conversation, onClose }: ConversationThemeDialogProps) {
	const [draft, setDraft] = useState(conversation.themeColor);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");
	const close = useCallback(() => {
		if (!isSaving) onClose();
	}, [isSaving, onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close);
	const theme = getConversationThemeClasses(draft);

	async function applyTheme() {
		if (isSaving) return;
		if (draft === conversation.themeColor) {
			onClose();

			return;
		}
		setIsSaving(true);
		setError("");
		try {
			await api.setConversationTheme(conversation.id, draft);
			onClose();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not change the theme");
		} finally {
			setIsSaving(false);
		}
	}

	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) close();
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label="Chat theme"
				tabIndex={-1}
				className="flex h-[580px] max-h-[calc(100dvh-32px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-rule-soft bg-paper-raised shadow-modal outline-none"
			>
				<div className="flex shrink-0 items-center justify-between border-b border-rule-soft px-5 py-4">
					<h2 className="text-base font-semibold text-heading">Chat theme</h2>
					<Button
						variant="ghost"
						aria-label="Close chat theme"
						disabled={isSaving}
						onClick={close}
						className="size-8 rounded-full p-0"
					>
						<X className="size-4" />
					</Button>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto p-5">
					<div
						data-conversation-theme={draft ?? "default"}
						className="theme-wallpaper rounded-2xl border border-rule-soft p-4"
						role="img"
						aria-label="Theme preview"
					>
						<p className="mb-3 text-center text-[11px] text-ink-faint">A little more together</p>
						<div className="w-fit rounded-2xl rounded-bl-md bg-paper-raised px-3 py-2 text-xs text-ink">
							Hey, good to see you.
						</div>
						<div
							className={cn(
								"ml-auto mt-3 w-fit rounded-2xl rounded-br-md px-3 py-2 text-xs",
								theme.bubble,
								theme.bubbleInk,
							)}
						>
							You too. Stay a little?
						</div>
					</div>
					<p className="mb-3 mt-4 text-xs text-ink-soft">A shared look for everyone in this chat.</p>
					<div className="grid grid-cols-3 gap-2" role="group" aria-label="Choose a theme">
						<Button
							variant="ghost"
							aria-label="Default theme"
							aria-pressed={draft === null}
							disabled={isSaving}
							onClick={() => setDraft(null)}
							className={cn("theme-choice", draft === null && "theme-choice-selected")}
						>
							<span data-conversation-theme="default" className="theme-wallpaper theme-swatch">
								<span className="bg-block" />
								{draft === null && <Check className="size-4 text-heading" />}
							</span>
							<span>Default</span>
						</Button>
						{CONVERSATION_THEME_OPTIONS.map((option) => (
							<Button
								key={option.value}
								variant="ghost"
								aria-label={option.label}
								aria-pressed={draft === option.value}
								disabled={isSaving}
								onClick={() => setDraft(option.value)}
								className={cn("theme-choice", draft === option.value && "theme-choice-selected")}
							>
								<span data-conversation-theme={option.value} className="theme-wallpaper theme-swatch">
									<span className={getConversationThemeClasses(option.value).bubble} />
									{draft === option.value && <Check className="size-4 text-heading" />}
								</span>
								<span>{option.label}</span>
							</Button>
						))}
					</div>
					{error && (
						<p role="alert" className="mt-3 text-xs text-signal">
							{error}
						</p>
					)}
				</div>
				<div className="flex shrink-0 justify-end gap-2 border-t border-rule-soft px-5 py-3">
					<Button variant="ghost" disabled={isSaving} onClick={close}>
						Cancel
					</Button>
					<Button disabled={isSaving} onClick={() => void applyTheme()}>
						{isSaving ? "Applying…" : "Apply theme"}
					</Button>
				</div>
			</div>
		</div>,
		document.body,
	);
}
