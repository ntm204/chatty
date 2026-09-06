import { ArrowUp, Smile } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { ComposerAttachmentMenu } from "./composer-attachment-menu";
import { EmojiPicker } from "./emoji-picker";
import { StickerTray } from "./sticker-tray";

interface ComposerControlsProps {
	isDisabled: boolean;
	isSending: boolean;
	isVoiceActive: boolean;
	/** True at the attachment cap: the picker is disabled rather than silently trimming. */
	isFull: boolean;
	canSend: boolean;
	isEmojiPickerOpen: boolean;
	isStickerTrayOpen: boolean;
	onToggleEmojiPicker: () => void;
	onToggleStickerTray: () => void;
	onCloseEmojiPicker: () => void;
	onCloseStickerTray: () => void;
	onFilesSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onInsertEmoji: (char: string) => void;
	onPickSticker: (stickerId: string) => void;
	field: ReactNode;
	voiceRecorder: ReactNode;
}

/**
 * The complete one-line composer: one attachment entry point, the text well
 * and one contextual action at the end. Voice replaces the rest of the bar.
 *
 * Split out of `MessageInput` when that file went over the 300-line limit for
 * the second time. State stays in the composer; the attachment menu owns its
 * file inputs because they only exist to support that trigger.
 */
export function ComposerControls({
	isDisabled,
	isSending,
	isVoiceActive,
	isFull,
	canSend,
	isEmojiPickerOpen,
	isStickerTrayOpen,
	onToggleEmojiPicker,
	onToggleStickerTray,
	onCloseEmojiPicker,
	onCloseStickerTray,
	onFilesSelected,
	onFileSelected,
	onInsertEmoji,
	onPickSticker,
	field,
	voiceRecorder,
}: ComposerControlsProps) {
	return (
		<div className="relative flex min-w-0 items-center gap-1.5">
			{/* Right-anchored: the trigger is the Smile button at the end of the text
			    well, and a 320px panel opening from the left edge of the row lands
			    under the attachment button instead — a composer's width from the thing
			    that opened it. The sticker tray below stays left because its trigger,
			    the attachment menu, really is on the left. */}
			{isEmojiPickerOpen && (
				<EmojiPicker
					onPick={onInsertEmoji}
					onClose={onCloseEmojiPicker}
					anchor="absolute bottom-full right-0 mb-2 origin-bottom-right"
				/>
			)}
			{isStickerTrayOpen && <StickerTray onPick={onPickSticker} onClose={onCloseStickerTray} />}

			{!isVoiceActive && (
				<ComposerAttachmentMenu
					isDisabled={isDisabled || isSending}
					isFull={isFull}
					onOpen={() => {
						onCloseEmojiPicker();
						onCloseStickerTray();
					}}
					onOpenStickerTray={onToggleStickerTray}
					onFilesSelected={onFilesSelected}
					onFileSelected={onFileSelected}
				/>
			)}

			<div
				className={cn(
					"flex min-w-0 flex-1 items-center rounded-composer bg-paper-sunken pl-1",
					"transition-shadow focus-within:ring-2 focus-within:ring-ink/10",
					isVoiceActive && "hidden",
				)}
			>
				{field}
				<Button
					variant="ghost"
					onClick={onToggleEmojiPicker}
					disabled={isDisabled || isSending}
					aria-label="Insert an emoji"
					aria-expanded={isEmojiPickerOpen}
					className="mr-1 size-8 shrink-0 rounded-full p-0 text-ink-faint hover:bg-transparent hover:text-ink"
				>
					<Smile className="size-[17px]" />
				</Button>
			</div>

			{(!canSend || isVoiceActive) && (
				<div className={cn("shrink-0", isVoiceActive && "min-w-0 flex-1")}>{voiceRecorder}</div>
			)}

			{!isVoiceActive && canSend && (
				<Button
					type="submit"
					disabled={isDisabled || isSending}
					aria-label="Send message"
					className="size-9 shrink-0 rounded-bubble p-0"
				>
					<ArrowUp className="size-4" />
				</Button>
			)}
		</div>
	);
}
