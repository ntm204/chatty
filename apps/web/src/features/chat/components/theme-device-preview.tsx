import { SilhouetteAvatar } from "@/components/avatar";
import { GroupAvatar } from "./group-avatar";
import { cn } from "@/utils/cn";
import { DESKTOP_PREVIEW_HEIGHT, DESKTOP_PREVIEW_WIDTH, PREVIEW_SIDEBAR_ROWS } from "../constants/theme-preview";
import { useFitScale, usePreviewConversation } from "../hooks";
import type { WallpaperKey } from "../types/chat-wallpaper";
import type { PreviewDevice } from "../types/theme-preview";
import { ThemePreviewChat } from "./theme-preview-chat";

interface ThemeDevicePreviewProps {
	theme: WallpaperKey;
	device: PreviewDevice;
}

/**
 * The chat theme, live, on the device you choose.
 *
 * Messengers preview a theme on a phone-shaped card at best; none shows how it
 * sits on a desktop, where the wallpaper fills a wide pane beside the list and
 * reads very differently. This draws both: a phone with its island, and an app
 * window with traffic lights, a sidebar and the conversation. The sample
 * conversation plays itself (`usePreviewConversation`), so the wallpaper is
 * seen flowing and bubbles arriving, in the app's current mode and palette.
 *
 * The desktop window is drawn at a real window's proportions and scaled down as
 * one picture to fit, the way a screenshot shrinks — squeezing its layout into
 * a phone-width dialog instead would preview a desktop nobody has.
 */
export function ThemeDevicePreview({ theme, device }: ThemeDevicePreviewProps) {
	const { messages, flowKey } = usePreviewConversation();
	const { containerRef, scale } = useFitScale<HTMLDivElement>(DESKTOP_PREVIEW_WIDTH);

	if (device === "phone") {
		return (
			<div className="theme-device-phone relative mx-auto h-[22rem] w-[11.5rem] shrink-0 rounded-[2.2rem] bg-device-bezel p-1.5 shadow-lift">
				<span className="absolute top-3 left-1/2 z-10 h-4 w-14 -translate-x-1/2 rounded-full bg-device-bezel" />
				<div className="theme-device-screen flex h-full overflow-hidden rounded-[1.8rem]">
					<ThemePreviewChat theme={theme} messages={messages} flowKey={flowKey} isCompact />
				</div>
			</div>
		);
	}

	return (
		// `min-w-0`: as a flex item it would otherwise grow to the window's fixed
		// width, measure that, and never scale anything down.
		<div ref={containerRef} className="w-full min-w-0" style={{ height: DESKTOP_PREVIEW_HEIGHT * scale }}>
			<div
				className="theme-device-desktop mx-auto flex origin-top-left flex-col overflow-hidden rounded-xl bg-shell shadow-lift ring-1 ring-rule"
				style={{ width: DESKTOP_PREVIEW_WIDTH, height: DESKTOP_PREVIEW_HEIGHT, transform: `scale(${scale})` }}
			>
				<div className="flex h-6 shrink-0 items-center gap-1.5 px-2.5">
					<span className="size-2.5 rounded-full bg-window-close" />
					<span className="size-2.5 rounded-full bg-window-minimise" />
					<span className="size-2.5 rounded-full bg-window-zoom" />
				</div>
				<div className="flex min-h-0 flex-1 gap-1.5 px-1.5 pb-1.5">
					<div className="flex w-[30%] shrink-0 flex-col gap-1 rounded-lg bg-paper-raised p-1.5">
						<span className="mb-1 px-1 font-display text-[13px] text-heading">Chats</span>
						{PREVIEW_SIDEBAR_ROWS.map((name, index) => (
							<span
								key={name}
								className={cn(
									"flex items-center gap-1.5 rounded-md p-1",
									index === 0 && "bg-selection",
								)}
							>
								{index === 0 ? <GroupAvatar size="xs" /> : <SilhouetteAvatar size="xs" />}
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="truncate text-[10px] font-medium text-ink">{name}</span>
									<span className="h-1 w-10 rounded-full bg-rule" />
								</span>
							</span>
						))}
					</div>
					<div className="theme-device-screen flex min-w-0 flex-1 overflow-hidden rounded-lg">
						<ThemePreviewChat theme={theme} messages={messages} flowKey={flowKey} isCompact={false} />
					</div>
				</div>
			</div>
		</div>
	);
}
