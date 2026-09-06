import type { ReactionEmoji } from "@chatty/shared-types";
import { CornerUpLeft, MoreHorizontal, SmilePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { MAX_BROWSER_TIMEOUT_MS } from "../constants/message";
import { formatRemaining } from "../utils";
import type { OpenMessagePanel } from "../types/message-actions";
import { MessageActionsMenu } from "./message-actions-menu";
import { ReactionBar } from "./reaction-bar";

interface MessageActionsProps {
	onEdit?: () => void;
	onDeleteForEveryone?: () => void;
	onDeleteForMe: () => void;
	/** Absent on a message there is nothing left to answer — a tombstone. */
	onReply?: (() => void) | undefined;
	/** Absent for the same reason. Which emoji are allowed is the server's rule, not this component's. */
	onToggleReaction?: ((emoji: ReactionEmoji) => void) | undefined;
	/** Absent until somebody has reacted: a list of nobody is a menu row that opens an empty dialog. */
	onShowReactions?: (() => void) | undefined;
	onForward?: (() => void) | undefined;
	onTogglePin?: (() => void) | undefined;
	isPinned?: boolean;
	/** The one emoji the viewer has left here, so the bar can show it as set. Null if none. */
	myReaction: ReactionEmoji | null;
	authorActionExpiresAt: string | null;
	align: "start" | "end";
}

/**
 * A compact action menu beside a message bubble, visible on hover or keyboard
 * focus, and after a plain tap on that message when there is no hover.
 *
 * Three buttons, and the first of them changed shape in phase 29. It used to be
 * a heart that reacted with a heart, with the other four reactions parked at the
 * top of the "more" menu — so the commonest action in the feature cost two
 * clicks and offered five choices. It now opens `ReactionBar`, which is six
 * choices in one click and every emoji in two.
 *
 * The panels share one piece of state rather than a boolean each. They occupy
 * the same corner and only one can usefully be open, and a pair of booleans is
 * how you end up with both drawn on top of each other after a fast click.
 */
export function MessageActions({
	onEdit,
	onDeleteForEveryone,
	onDeleteForMe,
	onReply,
	onToggleReaction,
	onShowReactions,
	onForward,
	onTogglePin,
	isPinned = false,
	myReaction,
	authorActionExpiresAt,
	align,
}: MessageActionsProps) {
	const [openPanel, setOpenPanel] = useState<OpenMessagePanel>(null);
	const [isChoosingDeleteScope, setIsChoosingDeleteScope] = useState(false);
	const [hasAuthorActionsExpired, setHasAuthorActionsExpired] = useState(
		() => !authorActionExpiresAt || Date.parse(authorActionExpiresAt) <= Date.now(),
	);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!authorActionExpiresAt) {
			setHasAuthorActionsExpired(true);

			return;
		}

		const remaining = Date.parse(authorActionExpiresAt) - Date.now();
		if (remaining <= 0) {
			setHasAuthorActionsExpired(true);

			return;
		}

		setHasAuthorActionsExpired(false);
		const timer = window.setTimeout(
			() => {
				setHasAuthorActionsExpired(true);
				setIsChoosingDeleteScope(false);
			},
			Math.min(remaining, MAX_BROWSER_TIMEOUT_MS),
		);

		return () => window.clearTimeout(timer);
	}, [authorActionExpiresAt]);

	useEffect(() => {
		if (!openPanel) return;

		function close() {
			setOpenPanel(null);
			setIsChoosingDeleteScope(false);
		}

		const focusFrame = window.requestAnimationFrame(() => {
			rootRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
		});

		function closeFromOutside(event: PointerEvent) {
			if (!rootRef.current?.contains(event.target as Node)) close();
		}

		function closeFromKeyboard(event: KeyboardEvent) {
			if (event.key === "Escape") {
				close();
				rootRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();

				return;
			}

			// Left and right as well as up and down, because one of the two panels
			// is a horizontal row: the reaction bar reads left to right and an
			// arrow key that does nothing there would be the only dead key in it.
			const previousKeys = ["ArrowUp", "ArrowLeft"];
			const nextKeys = ["ArrowDown", "ArrowRight"];
			if (!rootRef.current || ![...previousKeys, ...nextKeys, "Home", "End"].includes(event.key)) return;
			const items = [...rootRef.current.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];
			if (items.length === 0) return;
			event.preventDefault();
			const currentIndex = items.findIndex((item) => item === document.activeElement);
			if (event.key === "Home") items[0]?.focus();
			else if (event.key === "End") items[items.length - 1]?.focus();
			else if (nextKeys.includes(event.key)) items[(currentIndex + 1 + items.length) % items.length]?.focus();
			else items[(currentIndex - 1 + items.length) % items.length]?.focus();
		}

		document.addEventListener("pointerdown", closeFromOutside);
		document.addEventListener("keydown", closeFromKeyboard);

		return () => {
			window.cancelAnimationFrame(focusFrame);
			document.removeEventListener("pointerdown", closeFromOutside);
			document.removeEventListener("keydown", closeFromKeyboard);
		};
	}, [openPanel, isChoosingDeleteScope]);

	const canChangeForEveryone = !hasAuthorActionsExpired && Boolean(onEdit || onDeleteForEveryone);
	// Recomputed on each render of an open menu rather than ticked on a timer:
	// a menu is open for seconds, and a second interval per message on screen
	// costs more than the minute of precision it would buy.
	const remainingLabel = openPanel === "menu" && canChangeForEveryone ? formatRemaining(authorActionExpiresAt) : null;

	function toggle(panel: Exclude<OpenMessagePanel, null>) {
		setOpenPanel((current) => (current === panel ? null : panel));
		setIsChoosingDeleteScope(false);
	}

	return (
		<div
			ref={rootRef}
			className={cn(
				"relative flex shrink-0 items-center",
				"opacity-0 transition-opacity",
				// Keep the controls keyboard-discoverable, but remove the invisible
				// pointer target until a touch focuses this message.
				"max-sm:pointer-events-none max-sm:group-focus-within:pointer-events-auto max-sm:group-focus-within:opacity-70",
				"sm:group-hover:opacity-100 sm:focus-within:opacity-100",
				openPanel && "opacity-100",
			)}
		>
			{onToggleReaction && (
				<Button
					variant="ghost"
					onClick={() => toggle("reactions")}
					aria-label="React to message"
					aria-haspopup="menu"
					aria-expanded={openPanel === "reactions"}
					className={cn(
						"size-6 p-0 hover:bg-transparent hover:text-ink max-sm:hidden",
						openPanel === "reactions" || myReaction ? "text-ink" : "text-ink-faint",
					)}
				>
					<SmilePlus className="size-3.5" />
				</Button>
			)}

			{onReply && (
				<Button
					variant="ghost"
					onClick={onReply}
					aria-label="Reply to message"
					className="size-6 p-0 text-ink-faint hover:bg-transparent hover:text-ink max-sm:hidden"
				>
					<CornerUpLeft className="size-3.5" />
				</Button>
			)}

			<Button
				variant="ghost"
				onClick={() => toggle("menu")}
				aria-label="Message actions"
				aria-haspopup="menu"
				aria-expanded={openPanel === "menu"}
				className={cn(
					"size-6 p-0 text-ink-faint hover:bg-transparent hover:text-ink",
					openPanel === "menu" && "text-ink",
				)}
			>
				<MoreHorizontal className="size-4" />
			</Button>

			{openPanel === "reactions" && onToggleReaction && (
				<ReactionBar
					myEmoji={myReaction}
					align={align}
					onPick={(emoji) => {
						setOpenPanel(null);
						onToggleReaction(emoji);
					}}
				/>
			)}

			{openPanel === "menu" && (
				<div
					role="menu"
					aria-label="Message actions"
					className={cn(
						"absolute bottom-full z-30 mb-2 w-56 overflow-hidden rounded-control border border-rule",
						"bg-paper-raised p-1.5 text-[13px] shadow-lift",
						align === "end" ? "right-0" : "left-0",
					)}
				>
					<MessageActionsMenu
						isChoosingDeleteScope={isChoosingDeleteScope}
						setIsChoosingDeleteScope={setIsChoosingDeleteScope}
						onClose={() => setOpenPanel(null)}
						onEdit={onEdit}
						onDeleteForEveryone={onDeleteForEveryone}
						onDeleteForMe={onDeleteForMe}
						onReply={onReply}
						onShowReactions={onShowReactions}
						onForward={onForward}
						onTogglePin={onTogglePin}
						isPinned={isPinned}
						canChangeForEveryone={canChangeForEveryone}
						remainingLabel={remainingLabel}
					/>
				</div>
			)}
		</div>
	);
}
