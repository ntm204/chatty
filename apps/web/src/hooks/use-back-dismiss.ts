import { useEffect, useRef } from "react";

const LAYER_KEY = "chattyLayer";

/**
 * A `history.back()` issued to remove a closed layer's entry, until the browser
 * has carried it out. Traversal is asynchronous: an entry pushed before it lands
 * would be the one it removes — reopening a panel right after closing it closed
 * it again — so new layers wait for this first.
 */
let pendingBack: Promise<void> | null = null;

function readLayer(): unknown {
	return (window.history.state as Record<string, unknown> | null)?.[LAYER_KEY];
}

function goBackOnce(): void {
	const done = new Promise<void>((resolve) => {
		window.addEventListener("popstate", () => resolve(), { once: true });
		// A traversal that never fires (the entry was already gone) must not block forever.
		setTimeout(resolve, 500);
	});
	const tracked: Promise<void> = done.then(() => {
		if (pendingBack === tracked) pendingBack = null;
	});
	pendingBack = tracked;
	window.history.back();
}

/** True while an open layer owns the newest history entry — a route change should replace it, not stack on it. */
export function isOnLayerEntry(): boolean {
	return Boolean(readLayer());
}

/**
 * Lets the browser's Back (and a phone's back gesture) close an open layer —
 * a panel, a viewer, a dialog — instead of leaving the conversation or the app.
 *
 * Opening adds one history entry that copies the current one and only adds a
 * marker, so the router sees the same location and keeps its own index. Back
 * pops that entry and closes the layer; closing from the UI removes the entry
 * again, so the next Back goes where the reader expects. Layers nest: each
 * listener only reacts when its own marker is gone from the top.
 */
export function useBackDismiss(isOpen: boolean, onClose: () => void): void {
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		if (!isOpen) return;
		const marker = crypto.randomUUID();
		let isActive = true;
		let isPushed = false;
		let isPoppedByBrowser = false;

		function handlePopState() {
			if (readLayer() === marker) return;
			isPoppedByBrowser = true;
			window.removeEventListener("popstate", handlePopState);
			onCloseRef.current();
		}

		function push() {
			if (!isActive) return;
			const state = (window.history.state as Record<string, unknown> | null) ?? {};
			window.history.pushState({ ...state, [LAYER_KEY]: marker }, "");
			isPushed = true;
			window.addEventListener("popstate", handlePopState);
		}

		if (pendingBack) void pendingBack.then(push);
		else push();

		return () => {
			isActive = false;
			window.removeEventListener("popstate", handlePopState);
			if (isPushed && !isPoppedByBrowser && readLayer() === marker) goBackOnce();
		};
	}, [isOpen]);
}
