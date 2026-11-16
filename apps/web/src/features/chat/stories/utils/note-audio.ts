/**
 * One player for every song preview on the page: starting one stops whatever
 * was playing, so the picker, the composer and the viewer can never talk over
 * each other.
 */
let player: HTMLAudioElement | null = null;
let onCurrentEnded: (() => void) | null = null;

function finish(): void {
	const ended = onCurrentEnded;
	onCurrentEnded = null;
	ended?.();
}

/** Plays a 30-second preview; `onEnded` runs when it ends, fails, or another starts. */
export function playNotePreview(url: string, onEnded?: () => void): void {
	stopNotePreview();
	player ??= new Audio();
	player.onended = finish;
	player.onerror = finish;
	player.src = url;
	onCurrentEnded = onEnded ?? null;
	// Browsers refuse sound before a gesture; that ends the preview rather than throwing.
	player.play().catch(finish);
}

export function stopNotePreview(): void {
	if (player) {
		player.pause();
		player.removeAttribute("src");
	}
	finish();
}
