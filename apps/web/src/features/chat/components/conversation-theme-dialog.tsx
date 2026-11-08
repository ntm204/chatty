import type { ConversationDTO } from "@chatty/shared-types";
import { Check, Monitor, Smartphone, X } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { cn } from "@/utils/cn";
import { CHAT_THEME_CHOICES } from "../constants/conversation-theme";
import type { PreviewDevice } from "../types/theme-preview";
import { ChatThemeThumbnail } from "./chat-theme-thumbnail";
import { ThemeDevicePreview } from "./theme-device-preview";

interface ConversationThemeDialogProps {
	conversation: ConversationDTO;
	onClose: () => void;
}

/**
 * The chat theme picker, laid out like Telegram's: a live preview of the
 * conversation on top, and a strip of thumbnails — each one the wallpaper and
 * bubbles of a theme — to choose from. Choosing previews locally; Apply saves
 * the shared theme, which everyone in the conversation sees.
 *
 * The preview switches between a phone and a desktop window, opening on the
 * kind of screen it is being viewed on.
 */
export function ConversationThemeDialog({ conversation, onClose }: ConversationThemeDialogProps) {
	const [draft, setDraft] = useState(conversation.themeColor);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");
	const [device, setDevice] = useState<PreviewDevice>(() =>
		window.matchMedia?.("(min-width: 1024px)").matches ? "desktop" : "phone",
	);
	const close = useCallback(() => {
		if (!isSaving) onClose();
	}, [isSaving, onClose]);
	const dialogRef = useDialog<HTMLDivElement>(close);

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
			setError(caught instanceof Error ? caught.message : "Could not change the chat theme");
		} finally {
			setIsSaving(false);
		}
	}

	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/40 p-4 sm:items-center"
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
				className="flex max-h-[calc(100dvh-32px)] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-paper-raised shadow-modal outline-none"
			>
				<div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
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

				<div className="min-h-0 overflow-y-auto">
					<div
						role="radiogroup"
						aria-label="Preview on"
						className="mx-auto mb-3 flex w-fit rounded-full bg-paper-sunken p-1"
					>
						{(["phone", "desktop"] as const).map((option) => {
							const Icon = option === "phone" ? Smartphone : Monitor;

							return (
								<Button
									key={option}
									variant="ghost"
									role="radio"
									aria-checked={device === option}
									onClick={() => setDevice(option)}
									className={cn(
										"gap-1.5 rounded-full px-3.5 py-1.5 text-[12px]",
										device === option
											? "bg-paper-raised font-semibold text-ink shadow-sm hover:bg-paper-raised"
											: "text-ink-soft hover:bg-transparent hover:text-ink",
									)}
								>
									<Icon aria-hidden="true" className="size-3.5" />
									{option === "phone" ? "Phone" : "Desktop"}
								</Button>
							);
						})}
					</div>
					<div
						role="img"
						aria-label={`Chat theme preview on ${device}`}
						className="flex h-[23rem] items-center justify-center px-5"
					>
						<ThemeDevicePreview theme={draft ?? "default"} device={device} />
					</div>

					<p className="mx-5 mt-3 text-xs text-ink-soft">
						Wallpaper and message colour, shared with everyone in this chat.
					</p>
					<div
						role="group"
						aria-label="Choose a chat theme"
						className="flex shrink-0 gap-2.5 overflow-x-auto px-5 pt-3 pb-4 [scrollbar-width:none]"
					>
						{CHAT_THEME_CHOICES.map((choice) => {
							const isSelected = draft === choice.value;

							return (
								<Button
									key={choice.value ?? "default"}
									variant="ghost"
									aria-label={choice.label}
									aria-pressed={isSelected}
									disabled={isSaving}
									onClick={() => setDraft(choice.value)}
									className="shrink-0 flex-col gap-1.5 p-0 hover:bg-transparent"
								>
									<span
										className={cn(
											"relative block h-24 w-[4.5rem] overflow-hidden rounded-xl ring-1 transition",
											isSelected ? "ring-2 ring-ink" : "ring-rule hover:ring-ink-faint",
										)}
									>
										<ChatThemeThumbnail theme={choice.value ?? "default"} className="h-full" />
										{isSelected && (
											<span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-ink text-paper-raised">
												<Check aria-hidden="true" className="size-2.5" />
											</span>
										)}
									</span>
									<span
										className={cn(
											"text-[11px]",
											isSelected ? "font-semibold text-ink" : "text-ink-soft",
										)}
									>
										{choice.label}
									</span>
								</Button>
							);
						})}
					</div>

					{error && (
						<p role="alert" className="mx-5 mb-2 text-xs text-signal">
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
