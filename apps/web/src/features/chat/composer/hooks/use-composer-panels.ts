import { useCallback, useState } from "react";

/**
 * The composer's two pop-over panels — emoji and stickers. At most one is open:
 * they open from the same row, and opening one closes the other.
 */
export function useComposerPanels() {
	const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
	const [isStickerTrayOpen, setIsStickerTrayOpen] = useState(false);
	const closePanels = useCallback(() => {
		setIsEmojiPickerOpen(false);
		setIsStickerTrayOpen(false);
	}, []);

	return {
		isEmojiPickerOpen,
		isStickerTrayOpen,
		closePanels,
		toggleEmojiPicker: () => {
			setIsStickerTrayOpen(false);
			setIsEmojiPickerOpen((current) => !current);
		},
		toggleStickerTray: () => {
			setIsEmojiPickerOpen(false);
			setIsStickerTrayOpen((current) => !current);
		},
		closeEmojiPicker: () => setIsEmojiPickerOpen(false),
		closeStickerTray: () => setIsStickerTrayOpen(false),
	};
}
