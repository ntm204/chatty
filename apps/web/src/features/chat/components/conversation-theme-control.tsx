import type { ConversationDTO } from "@chatty/shared-types";
import { Check } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { CONVERSATION_THEME_OPTIONS, getConversationThemeClasses } from "../constants/conversation-theme";

interface ConversationThemeControlProps {
	conversation: ConversationDTO;
}

/** Cosmetic — any participant may change it, in a direct conversation or a group alike. See ADR 0022. */
export function ConversationThemeControl({ conversation }: ConversationThemeControlProps) {
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	async function choose(theme: (typeof CONVERSATION_THEME_OPTIONS)[number]["value"] | null) {
		if (theme === conversation.themeColor) return;
		setIsSaving(true);
		setError("");
		try {
			await api.setConversationTheme(conversation.id, theme);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not change the theme");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="px-3 py-2">
			<div className="flex flex-wrap gap-2">
				<Button
					variant="ghost"
					disabled={isSaving}
					onClick={() => void choose(null)}
					aria-label="Default theme"
					aria-pressed={conversation.themeColor === null}
					className="size-8 rounded-full border border-rule bg-block p-0 text-block-ink"
				>
					{conversation.themeColor === null && <Check className="size-3.5" />}
				</Button>
				{CONVERSATION_THEME_OPTIONS.map((option) => {
					const swatch = getConversationThemeClasses(option.value);

					return (
						<Button
							key={option.value}
							variant="ghost"
							disabled={isSaving}
							onClick={() => void choose(option.value)}
							aria-label={option.label}
							aria-pressed={conversation.themeColor === option.value}
							className={cn("size-8 rounded-full p-0", swatch.bubble, swatch.bubbleInk)}
						>
							{conversation.themeColor === option.value && <Check className="size-3.5" />}
						</Button>
					);
				})}
			</div>
			{error && (
				<p role="alert" className="eyebrow mt-2 text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
