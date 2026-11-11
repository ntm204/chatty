import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BUILTIN_STICKER_KEYS } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { ChattySticker } from "@/components/icons";
import { BUILTIN_STICKER_LABELS, BUILTIN_STICKER_PREFIX } from "../constants/stickers";
import { ACCEPTED_IMAGE_TYPES } from "../../constants/attachment";
import { MAX_PERSONAL_STICKERS } from "../constants/stickers";
import { useStickers } from "../hooks/use-stickers";
import { getErrorMessage } from "@/utils/get-error-message";

interface StickerTrayProps {
	onPick: (stickerId: string) => Promise<void>;
	onClose: () => void;
}

/**
 * Somebody's saved images, one tap from being sent again.
 *
 * A personal tray rather than a shipped pack, and that is the decision: a
 * sticker set means artwork, and the honest options were a built-in pack drawn
 * in this app's ink style — which is not what anybody means by "stickers" — or
 * letting people bring their own. The second is a real feature, needs no
 * licensing, and reuses the image pipeline the gallery already put in place.
 *
 * A sticker is *copied* into a fresh attachment when it is sent, so removing one
 * from the tray never blanks a picture out of a conversation it was sent to.
 */
export function StickerTray({ onPick, onClose }: StickerTrayProps) {
	const { stickers, isLoading, error, isAdding, removingIds, reload, add, remove } = useStickers();
	const [isSending, setIsSending] = useState(false);
	const [sendError, setSendError] = useState("");
	const isSendingRef = useRef(false);
	const isMountedRef = useRef(true);
	const panelRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const openerRef = useRef(document.activeElement);
	const hasReachedLimit = stickers.length >= MAX_PERSONAL_STICKERS;
	useEffect(() => {
		panelRef.current?.focus({ preventScroll: true });
	}, []);

	useEffect(() => {
		isMountedRef.current = true;
		function handlePointerDown(event: PointerEvent) {
			if (!isSendingRef.current && !panelRef.current?.contains(event.target as Node)) onClose();
		}

		document.addEventListener("pointerdown", handlePointerDown);

		return () => {
			isMountedRef.current = false;
			document.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [onClose]);

	async function sendSticker(stickerId: string): Promise<void> {
		if (isSendingRef.current) return;
		isSendingRef.current = true;
		setIsSending(true);
		setSendError("");
		try {
			await onPick(stickerId);
			if (isMountedRef.current) onClose();
		} catch (caught) {
			if (isMountedRef.current)
				setSendError(getErrorMessage(caught, "The sticker could not be sent. Try again."));
		} finally {
			isSendingRef.current = false;
			if (isMountedRef.current) setIsSending(false);
		}
	}

	function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// Reset so the same file can be added twice — the change event does not
		// fire when the value is unchanged.
		event.target.value = "";
		if (file) void add(file);
	}

	return (
		<div
			ref={panelRef}
			role="dialog"
			aria-label="Stickers"
			tabIndex={-1}
			onKeyDown={(event) => {
				if (event.key !== "Escape" || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				if (isSendingRef.current) return;
				onClose();
				if (openerRef.current instanceof HTMLElement && openerRef.current.isConnected)
					openerRef.current.focus();
			}}
			className="popover-enter origin-bottom-left absolute bottom-full left-0 z-40 mb-2 w-[min(320px,calc(100vw-24px))] rounded-panel border border-rule bg-paper-raised shadow-lift"
		>
			<div className="flex items-center justify-between border-b border-rule-soft px-3.5 py-2.5">
				<span className="eyebrow text-ink-soft">Stickers</span>
				<input
					ref={fileInputRef}
					type="file"
					accept={ACCEPTED_IMAGE_TYPES}
					onChange={handleFileSelected}
					className="hidden"
				/>
				<Button
					variant="ghost"
					onClick={() => fileInputRef.current?.click()}
					disabled={isSending || isLoading || isAdding || hasReachedLimit}
					className="eyebrow gap-1.5 px-1.5 py-0.5 text-ink-faint hover:text-ink"
				>
					<ImagePlus className="size-3.5" />
					{isAdding ? "Adding…" : "Add"}
				</Button>
			</div>
			{hasReachedLimit && (
				<p role="status" className="px-3.5 py-2 text-xs text-ink-soft">
					Your tray holds {MAX_PERSONAL_STICKERS} stickers. Remove one to add another; sent stickers stay in
					conversations.
				</p>
			)}

			{(sendError || error) && (
				<p role="alert" className="note border-b border-rule-soft px-3.5 py-2.5 text-signal">
					{sendError || error}
				</p>
			)}

			{error && !isLoading && stickers.length === 0 && (
				<Button variant="ghost" onClick={reload} className="mx-3 text-xs">
					Try loading stickers again
				</Button>
			)}
			{(isSending || isLoading) && (
				<p role="status" className="px-3.5 py-2 text-xs text-ink-soft">
					{isSending ? "Sending sticker…" : "Loading stickers…"}
				</p>
			)}
			<p className="eyebrow px-3.5 pt-3 text-ink-faint">Chatty</p>
			<div className="sticker-tray-builtin grid grid-cols-4 gap-1 px-2.5 pt-1.5">
				{BUILTIN_STICKER_KEYS.map((key) => (
					<Button
						key={key}
						variant="ghost"
						onClick={() => void sendSticker(`${BUILTIN_STICKER_PREFIX}${key}`)}
						disabled={isSending}
						aria-label={`Send the ${BUILTIN_STICKER_LABELS[key]} sticker`}
						className="aspect-square rounded-control p-1"
					>
						<ChattySticker sticker={key} className="size-full" />
					</Button>
				))}
			</div>
			{stickers.length > 0 && <p className="eyebrow px-3.5 pt-3 text-ink-faint">Yours</p>}
			<div className="grid max-h-[240px] grid-cols-3 gap-2 overflow-y-auto p-3">
				{stickers.map((sticker) => (
					<div key={sticker.id}>
						<Button
							variant="ghost"
							onClick={() => void sendSticker(sticker.id)}
							disabled={isSending || removingIds?.has(sticker.id)}
							aria-label="Send this sticker"
							className="block w-full overflow-hidden rounded-control p-0"
						>
							<img
								src={sticker.url}
								alt=""
								loading="lazy"
								className="aspect-square w-full object-contain"
							/>
						</Button>
						<Button
							variant="ghost"
							onClick={() => void remove(sticker.id)}
							disabled={isSending || removingIds?.has(sticker.id)}
							aria-label="Remove this sticker"
							className="mt-1 h-9 w-full rounded-control p-0 text-xs text-ink-soft"
						>
							<X className="size-3" /> Remove
						</Button>
					</div>
				))}
			</div>

			{!isLoading && !error && stickers.length === 0 && (
				<p className="px-4 pb-5 text-center text-[13px] text-ink-faint">No stickers yet. Add a picture.</p>
			)}
		</div>
	);
}
