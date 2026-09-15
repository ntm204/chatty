import type { StickerDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";

interface StickerTray {
	stickers: StickerDTO[];
	isLoading: boolean;
	error: string;
	isAdding: boolean;
	removingIds: Set<string>;
	reload: () => void;
	add: (file: File) => Promise<void>;
	remove: (stickerId: string) => Promise<void>;
}

/**
 * The signed-in person's sticker tray.
 *
 * Loaded once when the tray is first opened rather than with the chat: most
 * sessions never open it, and the URLs it returns carry tokens that expire —
 * fetching them an hour before they are looked at would hand back links that
 * have already gone stale.
 */
export function useStickers(): StickerTray {
	const [stickers, setStickers] = useState<StickerDTO[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const [isAdding, setIsAdding] = useState(false);
	const [removingIds, setRemovingIds] = useState(new Set<string>());
	const removingIdsRef = useRef(new Set<string>());
	const isAddingRef = useRef(false);
	const [reloadCount, setReloadCount] = useState(0);

	useEffect(() => {
		let isCurrent = true;
		setIsLoading(true);
		setError("");

		void api
			.listStickers()
			.then((loaded) => isCurrent && setStickers(loaded))
			.catch((loadError: Error) => isCurrent && setError(loadError.message))
			.finally(() => isCurrent && setIsLoading(false));

		return () => {
			isCurrent = false;
		};
	}, [reloadCount]);
	const reload = useCallback(() => setReloadCount((current) => current + 1), []);

	const add = useCallback(async (file: File) => {
		if (isAddingRef.current) return;
		isAddingRef.current = true;
		setIsAdding(true);
		setError("");
		try {
			const saved = await api.addSticker(file);
			// Newest first, matching the order the server lists them in.
			setStickers((current) => [saved, ...current]);
		} catch (addError) {
			setError((addError as Error).message);
		} finally {
			isAddingRef.current = false;
			setIsAdding(false);
		}
	}, []);

	const remove = useCallback(async (stickerId: string) => {
		if (removingIdsRef.current.has(stickerId)) return;
		removingIdsRef.current.add(stickerId);
		setRemovingIds(new Set(removingIdsRef.current));
		setError("");
		try {
			await api.removeSticker(stickerId);
			setStickers((current) => current.filter((sticker) => sticker.id !== stickerId));
		} catch (removeError) {
			setError((removeError as Error).message);
		} finally {
			removingIdsRef.current.delete(stickerId);
			setRemovingIds(new Set(removingIdsRef.current));
		}
	}, []);

	return { stickers, isLoading, error, isAdding, removingIds, reload, add, remove };
}
