import { GroupAvatar } from "../../components/group-avatar";
import { cn } from "@/utils/cn";
import { getConversationThemeClasses } from "../../constants/conversation-theme";
import type { WallpaperKey } from "../types/theme";
import type { PreviewMessage } from "../types/theme";
import { FlowingWallpaper } from "./flowing-wallpaper";

interface ThemePreviewChatProps {
	theme: WallpaperKey;
	messages: PreviewMessage[];
	flowKey: string;
	/** Phone and desktop draw the same chat at different densities. */
	isCompact: boolean;
}

/**
 * The conversation inside the theme preview: header, flowing wallpaper, the
 * sample bubbles and a composer — built from the same classes as the real pane
 * (`chat-bubble`, the theme's bubble pair), so the preview cannot drift from
 * what the theme actually does.
 */
export function ThemePreviewChat({ theme, messages, flowKey, isCompact }: ThemePreviewChatProps) {
	const classes = getConversationThemeClasses(theme === "default" ? null : theme);

	return (
		<div
			data-conversation-theme={theme}
			className="theme-preview-chat relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-paper-raised"
		>
			<FlowingWallpaper theme={theme} flowKey={flowKey} />
			<div
				className={cn(
					"theme-preview-bar relative z-1 flex shrink-0 items-center gap-2 border-b border-rule-soft",
					isCompact ? "px-3 pt-7 pb-2" : "px-4 py-2.5",
				)}
			>
				<GroupAvatar size={isCompact ? "xs" : "sm"} />
				<span className="flex min-w-0 flex-col leading-tight">
					<span
						className={cn("truncate font-semibold text-heading", isCompact ? "text-[11px]" : "text-[13px]")}
					>
						Weekend getaway
					</span>
					<span className={cn("text-ink-faint", isCompact ? "text-[9px]" : "text-[11px]")}>3 members</span>
				</span>
			</div>
			<div
				className={cn(
					"relative z-1 flex flex-1 flex-col justify-end gap-1.5 overflow-hidden",
					isCompact ? "p-2.5" : "p-4",
				)}
			>
				{messages.map((message) => (
					<span
						key={message.id}
						className={cn(
							"theme-preview-bubble chat-bubble w-fit max-w-[80%] rounded-2xl leading-snug",
							isCompact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-[13px]",
							message.isMine
								? cn("self-end rounded-br-md", classes.bubble, classes.bubbleInk)
								: "self-start rounded-bl-md bg-paper-sunken text-ink",
						)}
					>
						{message.text}
					</span>
				))}
			</div>
			<div
				className={cn(
					"theme-preview-bar relative z-1 flex shrink-0 items-center gap-2",
					isCompact ? "px-2.5 pt-1.5 pb-4" : "px-4 py-2.5",
				)}
			>
				<span
					className={cn(
						"flex-1 rounded-full border border-rule-soft bg-paper text-ink-faint",
						isCompact ? "px-3 py-1 text-[10px]" : "px-4 py-1.5 text-[12px]",
					)}
				>
					Write a message
				</span>
				<span className={cn("shrink-0 rounded-full bg-accent", isCompact ? "size-5" : "size-7")} />
			</div>
		</div>
	);
}
