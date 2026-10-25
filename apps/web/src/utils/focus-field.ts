/**
 * Moves focus to a form control by name — the first invalid one, so the reader
 * lands on what to fix and a screen reader announces its error.
 *
 * After a server error the fields are still disabled from the pending request,
 * and a disabled control cannot take focus until it re-renders, so that case
 * waits a tick. It then gives way if the reader has already moved on: a late
 * focus that pulls someone back out of the field they are typing in is worse
 * than none.
 */
export function focusField(form: HTMLFormElement | null, name: string | null): void {
	if (!form || !name) return;
	const field = form.elements.namedItem(name);
	if (!(field instanceof HTMLElement)) return;
	if (!(field instanceof HTMLInputElement && field.disabled)) {
		field.focus();

		return;
	}

	const focusedBefore = document.activeElement;
	setTimeout(() => {
		const focusedNow = document.activeElement;
		if (focusedNow !== focusedBefore && focusedNow !== document.body) return;
		field.focus();
	}, 0);
}
