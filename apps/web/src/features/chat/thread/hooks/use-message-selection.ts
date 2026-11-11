import { create } from "zustand";

interface MessageSelectionState {
	/** The messages picked, in the order they were picked. Empty when not selecting. */
	ids: string[];
	isSelecting: boolean;
	start: (messageId: string) => void;
	toggle: (messageId: string) => void;
	clear: () => void;
}

/**
 * Selecting several messages at once — to copy or delete them together, as in
 * every messenger. A store rather than props: each row reads only whether it
 * is picked, so picking one message re-renders that row and the bar, not the
 * thread. Leaving selection when the last message is unpicked matches Telegram.
 */
export const useMessageSelection = create<MessageSelectionState>((set) => ({
	ids: [],
	isSelecting: false,
	start: (messageId) => set({ ids: [messageId], isSelecting: true }),
	toggle: (messageId) =>
		set((state) => {
			const isPicked = state.ids.includes(messageId);
			const ids = isPicked ? state.ids.filter((id) => id !== messageId) : [...state.ids, messageId];

			return { ids, isSelecting: ids.length > 0 };
		}),
	clear: () => set({ ids: [], isSelecting: false }),
}));

/** One row's view of the selection: whether it is picked, and the click that picks it. */
export function useRowSelection(messageId: string) {
	const isSelecting = useMessageSelection((state) => state.isSelecting);
	const isSelected = useMessageSelection((state) => state.ids.includes(messageId));

	return {
		isSelecting,
		isSelected,
		/** While selecting, a click picks the message instead of acting on it. */
		onClickCapture(event: { preventDefault: () => void; stopPropagation: () => void }) {
			if (!useMessageSelection.getState().isSelecting) return;
			event.preventDefault();
			event.stopPropagation();
			useMessageSelection.getState().toggle(messageId);
		},
		start: () => useMessageSelection.getState().start(messageId),
	};
}
