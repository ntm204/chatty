/** Move through enabled actions without making a menu trap the browser's Tab order. */
export function focusMenuItem(menu: HTMLElement, key: string): boolean {
	if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) return false;
	const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
	if (!items.length) return false;
	const current = items.indexOf(document.activeElement as HTMLElement);
	const next =
		key === "Home"
			? 0
			: key === "End"
				? items.length - 1
				: (current + (key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
	items[next]?.focus();

	return true;
}
