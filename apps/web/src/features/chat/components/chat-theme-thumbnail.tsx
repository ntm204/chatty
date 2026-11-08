import { cn } from "@/utils/cn";
import { getConversationThemeClasses } from "../constants/conversation-theme";
import type { WallpaperKey } from "../types/chat-wallpaper";
import { FlowingWallpaper } from "./flowing-wallpaper";

interface ChatThemeThumbnailProps {
	theme: WallpaperKey;
	className?: string;
}

/**
 * One card of the theme strip: the theme's wallpaper, still, with a received
 * bubble and one of yours drawn as bars — enough to tell themes apart at a
 * glance; the live preview above shows the real thing.
 */
export function ChatThemeThumbnail({ theme, className }: ChatThemeThumbnailProps) {
	const classes = getConversationThemeClasses(theme === "default" ? null : theme);

	return (
		<span
			aria-hidden="true"
			className={cn("relative flex flex-col justify-end gap-1 overflow-hidden p-2", className)}
		>
			<FlowingWallpaper theme={theme} isStill />
			<span className="relative h-3 w-3/5 rounded-2xl rounded-bl-md bg-paper-raised shadow-sm" />
			<span className={cn("relative ml-auto h-3 w-2/5 rounded-2xl rounded-br-md shadow-sm", classes.bubble)} />
		</span>
	);
}
