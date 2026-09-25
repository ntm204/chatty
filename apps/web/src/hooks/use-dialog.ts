import { useEffect, useRef } from "react";

/**
 * Everything a `<div role="dialog">` needs to behave like one.
 *
 * Everything focusable that is not disabled and not deliberately skipped. The
 * trap is only as good as this list: anything missing from it is a control Tab
 * can reach and Shift+Tab cannot come back from.
 */
const FOCUSABLE_SELECTOR =
	"button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Escape to close, Tab wrapped inside the panel, focus moved into it on open.
 *
 * Extracted because the edit-history dialog and the settings dialog need the
 * identical thing and live in different features, which is exactly the case the
 * frontend conventions say to lift into `src/hooks` rather than copy. Two copies
 * of a focus trap are two chances for one of them to lose a case.
 *
 * The caller owns the state: this closes nothing itself, it calls `onClose`.
 * Callback changes must not reset focus while somebody is editing inside it.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
	const dialogRef = useRef<T>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		const opener = document.activeElement;
		const dialog = dialogRef.current;
		dialog?.focus();

		function handleKeyDown(event: KeyboardEvent) {
			if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
			const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
			if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				onCloseRef.current();

				return;
			}

			if (event.key !== "Tab" || !dialogRef.current) return;

			const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
				(element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]'),
			);
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!first || !last) {
				event.preventDefault();
				dialogRef.current.focus();

				return;
			}
			if (!dialogRef.current.contains(document.activeElement) || document.activeElement === dialogRef.current) {
				event.preventDefault();
				(event.shiftKey ? last : first).focus();

				return;
			}

			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}

		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			if (!dialog?.contains(document.activeElement) && document.activeElement !== document.body) return;
			if (
				opener instanceof HTMLElement &&
				opener !== document.body &&
				opener.isConnected &&
				!opener.matches(":disabled")
			) {
				opener.focus({ preventScroll: true });

				return;
			}
			// Removing a message can also remove its opener. Wait for React's DOM
			// cleanup, and do not steal focus from a newly opened surface.
			queueMicrotask(() => {
				if (document.activeElement !== document.body) return;
				const remaining = [
					...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
				].filter((element) => element !== dialog);
				const fallback =
					remaining.at(-1) ??
					document.querySelector<HTMLElement>("main textarea:not(:disabled), aside button:not(:disabled)");
				fallback?.focus({ preventScroll: true });
			});
		};
	}, []);

	return dialogRef;
}
