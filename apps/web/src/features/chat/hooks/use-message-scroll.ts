import type { MessageDTO } from "@chatty/shared-types";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
	LATEST_MESSAGE_THRESHOLD_PX,
	LOAD_OLDER_THRESHOLD_PX,
	RETURN_TO_LATEST_THRESHOLD_PX,
} from "../constants/pagination";

interface UseMessageScrollOptions {
	conversationId: string;
	currentUserId: string;
	messages: MessageDTO[];
	isViewingHistory: boolean;
	hasMoreOlder: boolean;
	isLoadingOlder: boolean;
	onLoadOlder: () => void;
}

interface MessageScrollSnapshot {
	firstId: string | null;
	lastId: string | null;
	scrollHeight: number;
	/** Distinguishes a prepend from a trim: both change `firstId` and keep `lastId`. */
	length: number;
}

interface MessageScrollAnchor {
	element: HTMLElement;
	top: number;
}

/** Follows the live edge, preserves the reader's anchor, and counts unseen arrivals. */
export function useMessageScroll({
	conversationId,
	currentUserId,
	messages,
	isViewingHistory,
	hasMoreOlder,
	isLoadingOlder,
	onLoadOlder,
}: UseMessageScrollOptions) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewportSizeRef = useRef({ width: 0, height: 0 });
	const contentRef = useRef<HTMLDivElement>(null);
	const previousRef = useRef<MessageScrollSnapshot>({ firstId: null, lastId: null, scrollHeight: 0, length: 0 });
	const conversationIdRef = useRef(conversationId);
	const wasViewingHistoryRef = useRef(isViewingHistory);
	const shouldFollowLatestRef = useRef(true);
	const knownMessageIdsRef = useRef(new Set<string>());
	const newMessageIdsRef = useRef(new Set<string>());
	const anchorRef = useRef<MessageScrollAnchor | null>(null);
	const isFarFromBottomRef = useRef(false);
	const isJumpingToLatestRef = useRef(false);
	const jumpDestinationRef = useRef<number | null>(null);
	const jumpBehaviorRef = useRef<ScrollBehavior>("smooth");
	const [isJumpingToLatest, setIsJumpingToLatest] = useState(false);
	const [isFarFromBottom, setIsFarFromBottom] = useState(false);
	const [newMessageCount, setNewMessageCount] = useState(0);
	const cancelJumpToLatest = useCallback(() => {
		if (!isJumpingToLatestRef.current) return;
		isJumpingToLatestRef.current = false;
		jumpDestinationRef.current = null;
		shouldFollowLatestRef.current = false;
		setIsJumpingToLatest(false);
		const container = containerRef.current;
		if (container) container.scrollTo({ top: container.scrollTop, behavior: "auto" });
	}, []);

	const syncScrollPosition = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		const size = viewportSizeRef.current;
		// A resize can dispatch scroll before ResizeObserver. Preserve follow intent
		// until the observer has compensated for the new viewport dimensions.
		if (size.height > 0 && (size.height !== container.clientHeight || size.width !== container.clientWidth)) return;
		const distanceFromBottom = Math.max(0, container.scrollHeight - container.scrollTop - container.clientHeight);
		// Different exit/return distances keep tiny trackpad or layout changes from
		// repeatedly revealing and hiding the control at the same boundary.
		const threshold = isFarFromBottomRef.current ? RETURN_TO_LATEST_THRESHOLD_PX : LATEST_MESSAGE_THRESHOLD_PX;
		const isAwayFromBottom = distanceFromBottom > threshold;
		isFarFromBottomRef.current = isAwayFromBottom;
		setIsFarFromBottom(isAwayFromBottom);
		if (isJumpingToLatestRef.current && distanceFromBottom <= 1) {
			isJumpingToLatestRef.current = false;
			jumpDestinationRef.current = null;
			setIsJumpingToLatest(false);
		}
		// Reaching the near-bottom area can clear the badge before the animation
		// finishes. Trimming and instant resize corrections must wait until it lands.
		shouldFollowLatestRef.current = !isViewingHistory && !isAwayFromBottom && !isJumpingToLatestRef.current;
		if (!isViewingHistory && !isAwayFromBottom) {
			newMessageIdsRef.current.clear();
			setNewMessageCount(0);
		}
	}, [isViewingHistory]);

	const captureAnchor = useCallback(() => {
		const container = containerRef.current;
		const content = contentRef.current;
		anchorRef.current = null;
		if (!container || !content || shouldFollowLatestRef.current || isJumpingToLatestRef.current) return;
		const viewport = container.getBoundingClientRect();
		for (const element of content.querySelectorAll<HTMLElement>('[id^="message-"]')) {
			const bounds = element.getBoundingClientRect();
			if (bounds.bottom > viewport.top && bounds.top < viewport.bottom) {
				anchorRef.current = { element, top: bounds.top - viewport.top };
				break;
			}
		}
	}, []);

	const restoreAnchor = useCallback(() => {
		const container = containerRef.current;
		const anchor = anchorRef.current;
		if (!container || !anchor || !container.contains(anchor.element)) return false;
		const nextTop = anchor.element.getBoundingClientRect().top - container.getBoundingClientRect().top;
		const correction = nextTop - anchor.top;
		// Even a no-op scrollTop assignment cancels native smooth navigation to
		// a quoted message. Touch the scroll position only when its anchor moved.
		if (correction !== 0) container.scrollTop += correction;

		return true;
	}, []);

	const retargetJumpToLatest = useCallback(() => {
		const container = containerRef.current;
		if (!container || !isJumpingToLatestRef.current) return;
		const destination = Math.max(0, container.scrollHeight - container.clientHeight);
		if (destination === jumpDestinationRef.current) return;
		jumpDestinationRef.current = destination;
		container.scrollTo({ top: container.scrollHeight, behavior: jumpBehaviorRef.current });
	}, []);

	// useLayoutEffect, not useEffect: the correction has to happen before the
	// browser paints, otherwise the reader sees the list jump and snap back.
	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const didChangeConversation = conversationIdRef.current !== conversationId;
		const didReturnToLatest = wasViewingHistoryRef.current && !isViewingHistory;
		const didEnterHistory = !wasViewingHistoryRef.current && isViewingHistory;
		if (didChangeConversation || didReturnToLatest || didEnterHistory || messages.length === 0) {
			cancelJumpToLatest();
			anchorRef.current = null;
		}
		if (didChangeConversation || didReturnToLatest) {
			isFarFromBottomRef.current = false;
			previousRef.current = { firstId: null, lastId: null, scrollHeight: 0, length: 0 };
			shouldFollowLatestRef.current = !isViewingHistory;
		}
		if (didChangeConversation || didReturnToLatest || isViewingHistory || messages.length === 0) {
			knownMessageIdsRef.current.clear();
			newMessageIdsRef.current.clear();
		}
		if (isViewingHistory) shouldFollowLatestRef.current = false;
		conversationIdRef.current = conversationId;
		wasViewingHistoryRef.current = isViewingHistory;

		const firstId = messages[0]?.id ?? null;
		const lastId = messages[messages.length - 1]?.id ?? null;
		const previous = previousRef.current;
		const knownIds = knownMessageIdsRef.current;
		const newIds = newMessageIdsRef.current;
		let lastKnownIndex = -1;
		messages.forEach((message, index) => {
			if (knownIds.has(message.id)) lastKnownIndex = index;
		});
		const currentIds = new Set(messages.map((message) => message.id));
		// History paging and socket arrivals both append to the same array. Only the live
		// thread gives this hook enough information to count new arrivals without guessing.
		const canCountAppends = !isViewingHistory && !shouldFollowLatestRef.current && lastKnownIndex >= 0;
		messages.forEach((message, index) => {
			const isIncoming = message.kind === "user" && message.author?.id !== currentUserId && !message.deletedAt;
			if (!isIncoming) newIds.delete(message.id);
			else if (canCountAppends && index > lastKnownIndex && !knownIds.has(message.id)) newIds.add(message.id);
			knownIds.add(message.id);
		});
		for (const messageId of newIds) {
			if (!currentIds.has(messageId)) newIds.delete(messageId);
		}
		setNewMessageCount(newIds.size);

		const didStartChange = previous.firstId !== null && firstId !== previous.firstId;
		const previousFirstIndex = messages.findIndex((message) => message.id === previous.firstId);
		const didPrependOlder = didStartChange && previousFirstIndex > 0;
		const didDropOldest = didStartChange && lastId === previous.lastId && messages.length < previous.length;

		if (isJumpingToLatestRef.current) {
			// New arrivals and late media can move the destination during a native
			// smooth scroll. Retarget it without an instant scrollTop assignment.
			retargetJumpToLatest();
		} else if (didPrependOlder) {
			// A visible row separates added height above from simultaneous arrivals
			// below. The total height delta alone would move the reader too far.
			if (!restoreAnchor() && lastId === previous.lastId) {
				container.scrollTop += container.scrollHeight - previous.scrollHeight;
			}
		} else if (
			!isViewingHistory &&
			(didDropOldest || lastId !== previous.lastId) &&
			(previous.lastId === null || shouldFollowLatestRef.current)
		) {
			container.scrollTop = container.scrollHeight;
		} else if (!shouldFollowLatestRef.current) {
			// Edits and reactions above the viewport can change row heights too.
			restoreAnchor();
		}

		previousRef.current = { firstId, lastId, scrollHeight: container.scrollHeight, length: messages.length };
		syncScrollPosition();
		captureAnchor();
		// The thread trims old pages at the live edge; do not keep those ids indefinitely.
		if (shouldFollowLatestRef.current) knownMessageIdsRef.current = currentIds;
	}, [
		conversationId,
		currentUserId,
		isViewingHistory,
		messages,
		cancelJumpToLatest,
		captureAnchor,
		restoreAnchor,
		retargetJumpToLatest,
		syncScrollPosition,
	]);

	useLayoutEffect(() => {
		const container = containerRef.current;
		const content = contentRef.current;
		if (!container || !content || typeof ResizeObserver === "undefined") return;

		// The composer and late-loading media change the viewport without a scroll
		// event. Follow those changes only while the reader is already at the live edge.
		viewportSizeRef.current = { width: container.clientWidth, height: container.clientHeight };
		const observer = new ResizeObserver(() => {
			viewportSizeRef.current = { width: container.clientWidth, height: container.clientHeight };
			if (isJumpingToLatestRef.current) retargetJumpToLatest();
			else if (shouldFollowLatestRef.current && !isViewingHistory) container.scrollTop = container.scrollHeight;
			else restoreAnchor();
			previousRef.current.scrollHeight = container.scrollHeight;
			syncScrollPosition();
			captureAnchor();
		});
		observer.observe(container);
		observer.observe(content);

		return () => observer.disconnect();
	}, [conversationId, isViewingHistory, captureAnchor, restoreAnchor, retargetJumpToLatest, syncScrollPosition]);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		function handleWheel(event: WheelEvent) {
			if (event.deltaY !== 0) cancelJumpToLatest();
		}
		function handlePointerDown(event: PointerEvent) {
			// A mouse press on the viewport itself can start dragging its scrollbar.
			if (event.pointerType === "mouse" && event.target === container) cancelJumpToLatest();
		}
		function handleKeyDown(event: KeyboardEvent) {
			if (
				event.defaultPrevented ||
				!["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)
			) {
				return;
			}
			const target = event.target;
			if (
				target instanceof Element &&
				target.closest(
					'input, textarea, select, button, a, [role="textbox"], [contenteditable]:not([contenteditable="false"])',
				)
			) {
				return;
			}
			cancelJumpToLatest();
		}
		container.addEventListener("wheel", handleWheel, { passive: true });
		container.addEventListener("touchmove", cancelJumpToLatest, { passive: true });
		container.addEventListener("pointerdown", handlePointerDown);
		container.addEventListener("keydown", handleKeyDown);
		container.addEventListener("scrollend", syncScrollPosition);

		return () => {
			container.removeEventListener("wheel", handleWheel);
			container.removeEventListener("touchmove", cancelJumpToLatest);
			container.removeEventListener("pointerdown", handlePointerDown);
			container.removeEventListener("keydown", handleKeyDown);
			container.removeEventListener("scrollend", syncScrollPosition);
		};
	}, [conversationId, cancelJumpToLatest, syncScrollPosition]);

	function handleScroll() {
		const container = containerRef.current;
		if (!container) return;
		const wasJumping = isJumpingToLatestRef.current;
		syncScrollPosition();
		captureAnchor();

		if (!wasJumping && !isLoadingOlder && hasMoreOlder && container.scrollTop <= LOAD_OLDER_THRESHOLD_PX)
			onLoadOlder();
	}

	function scrollToLatest(): void {
		const container = containerRef.current;
		if (!container || isViewingHistory || isJumpingToLatestRef.current) return;
		isJumpingToLatestRef.current = true;
		shouldFollowLatestRef.current = false;
		anchorRef.current = null;
		setIsJumpingToLatest(true);
		const shouldReduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		jumpBehaviorRef.current = shouldReduceMotion ? "auto" : "smooth";
		retargetJumpToLatest();
		syncScrollPosition();
	}

	// The ref itself rather than its value: the trim decision is made in an effect
	// that must not re-run because the reader scrolled, and a boolean in the
	// return would make every scroll event a render.
	return {
		containerRef,
		contentRef,
		handleScroll,
		isFarFromBottom,
		isJumpingToLatest,
		newMessageCount,
		scrollToLatest,
		isPinnedToLatestRef: shouldFollowLatestRef,
	};
}
