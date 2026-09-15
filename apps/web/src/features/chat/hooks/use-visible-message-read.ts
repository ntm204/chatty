import { useEffect, useState, type RefObject } from "react";
import type { ThreadMessage } from "../types/thread-message";
import { findVisibleMessageId } from "../utils/visible-message";
import { useMarkRead } from "./use-mark-read";

interface VisibleReadMarker {
	scope: string;
	messageId: string;
	createdAt: string;
}

export function useVisibleMessageRead(
	containerRef: RefObject<HTMLDivElement>,
	conversationId: string,
	currentUserId: string,
	messages: ThreadMessage[],
	isEnabled: boolean,
): void {
	const [marker, setMarker] = useState<VisibleReadMarker | null>(null);
	const scope = `${currentUserId}:${conversationId}`;
	useMarkRead(isEnabled ? conversationId : null, marker?.scope === scope ? marker.messageId : undefined);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !isEnabled) return;
		let frame: number | undefined;
		function measure() {
			frame = undefined;
			if (document.visibilityState !== "visible" || document.querySelector('[aria-modal="true"]')) return;
			const messageId = findVisibleMessageId(container!, messages);
			const message = messages.find((item) => item.id === messageId);
			if (message) {
				setMarker((current) => {
					if (
						current?.scope === scope &&
						(current.createdAt > message.createdAt ||
							(current.createdAt === message.createdAt && current.messageId >= message.id))
					) {
						return current;
					}

					return { scope, messageId: message.id, createdAt: message.createdAt };
				});
			}
		}
		function schedule() {
			if (frame === undefined) frame = requestAnimationFrame(measure);
		}
		schedule();
		container.addEventListener("scroll", schedule, { passive: true });
		document.addEventListener("visibilitychange", schedule);
		window.addEventListener("resize", schedule);
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
		observer?.observe(container);
		if (container.firstElementChild) observer?.observe(container.firstElementChild);

		return () => {
			if (frame !== undefined) cancelAnimationFrame(frame);
			container.removeEventListener("scroll", schedule);
			document.removeEventListener("visibilitychange", schedule);
			window.removeEventListener("resize", schedule);
			observer?.disconnect();
		};
	}, [containerRef, isEnabled, messages, scope]);
}
