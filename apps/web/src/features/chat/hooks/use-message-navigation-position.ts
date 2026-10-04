import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { MessageDTO } from "@chatty/shared-types";
import { clearMessageLocation, scrollToMessage } from "../utils/scroll-to-message";
import { prefersReducedMotion, prepareGlide } from "../utils/glide-scroll";
import { getMessageViewportTop } from "../utils/message-viewport";

interface ReadingPosition {
	conversationId: string;
	messageId: string;
	offset: number;
}

interface MessageNavigationPositionOptions {
	conversationId: string;
	targetMessageId: string | null | undefined;
	messages: MessageDTO[];
	containerRef: RefObject<HTMLDivElement>;
	isLoadingThread: boolean;
	navigationError: string;
	onJumpToMessage: (messageId: string) => void;
}

/** Keep the reader's viewport anchor across an explicit reply-context jump. */
export function useMessageNavigationPosition({
	conversationId,
	targetMessageId,
	messages,
	containerRef,
	isLoadingThread,
	navigationError,
	onJumpToMessage,
}: MessageNavigationPositionOptions) {
	const lastScrollTargetRef = useRef<string | null>(null);
	const [readingPosition, setReadingPosition] = useState<ReadingPosition | null>(null);
	const [isReturning, setIsReturning] = useState(false);
	const dismissReadingPosition = useCallback(() => {
		setReadingPosition(null);
		setIsReturning(false);
		if (containerRef.current) clearMessageLocation(containerRef.current);
	}, [containerRef]);
	useEffect(() => {
		dismissReadingPosition();
		const container = containerRef.current;

		return () => {
			if (container) clearMessageLocation(container);
		};
	}, [conversationId, containerRef, dismissReadingPosition]);
	useEffect(() => {
		if (navigationError) dismissReadingPosition();
	}, [navigationError, dismissReadingPosition]);
	useEffect(() => {
		lastScrollTargetRef.current = null;
	}, [conversationId, targetMessageId]);
	useEffect(() => {
		if (!targetMessageId || lastScrollTargetRef.current === targetMessageId) return;
		// A context page replaces the whole window, so there is nothing loaded to
		// travel through: land directly. A glide here was also fragile — media in
		// the fresh window resizes it, and the anchor correction that follows
		// cancels a native smooth scroll partway, leaving the target off screen.
		const tryScroll = () => {
			if (lastScrollTargetRef.current !== targetMessageId && scrollToMessage(targetMessageId, "auto"))
				lastScrollTargetRef.current = targetMessageId;
		};
		tryScroll();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(tryScroll);
		if (containerRef.current) observer.observe(containerRef.current);

		return () => observer.disconnect();
	}, [conversationId, targetMessageId, messages, containerRef]);

	const jumpWithReturn = useCallback(
		(messageId: string) => {
			const container = containerRef.current;
			if (container) {
				const viewport = container.getBoundingClientRect();
				const visibleTop = getMessageViewportTop(container);
				const visible = [...container.querySelectorAll<HTMLElement>('[id^="message-"]')].find((element) => {
					const bounds = element.getBoundingClientRect();

					return bounds.bottom > visibleTop && bounds.top < viewport.bottom;
				});
				if (visible)
					setReadingPosition({
						conversationId,
						messageId: visible.id.slice("message-".length),
						offset: visible.getBoundingClientRect().top - viewport.top,
					});
			}
			setIsReturning(false);
			onJumpToMessage(messageId);
		},
		[containerRef, conversationId, onJumpToMessage],
	);

	useEffect(() => {
		if (!isReturning || !readingPosition || readingPosition.conversationId !== conversationId || isLoadingThread) {
			return;
		}
		const container = containerRef.current;
		const element = document.getElementById(`message-${readingPosition.messageId}`);
		if (!container || !element || !container.contains(element)) return;
		const top =
			container.scrollTop +
			element.getBoundingClientRect().top -
			container.getBoundingClientRect().top -
			readingPosition.offset;
		const behavior = prefersReducedMotion() ? "auto" : "smooth";
		if (behavior === "smooth") prepareGlide(container, top);
		container.scrollTo({ top, behavior });
		container.dispatchEvent(new Event("scroll"));
		container.focus({ preventScroll: true });
		clearMessageLocation(container);
		setIsReturning(false);
		setReadingPosition(null);
	}, [containerRef, conversationId, isLoadingThread, isReturning, messages, readingPosition]);

	function returnToReadingPosition() {
		if (!readingPosition || readingPosition.conversationId !== conversationId) return;
		setIsReturning(true);
		onJumpToMessage(readingPosition.messageId);
	}

	return {
		hasReadingPosition: readingPosition?.conversationId === conversationId,
		jumpWithReturn,
		returnToReadingPosition,
		dismissReadingPosition,
	};
}
