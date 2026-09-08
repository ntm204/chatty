export function shouldShowWelcome(): boolean {
	return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
