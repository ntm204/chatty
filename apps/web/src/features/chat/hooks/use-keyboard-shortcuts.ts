import { useEffect, useRef } from "react";

interface KeyboardShortcutOptions {
	hasOpenPanel: boolean;
	onClosePanel: () => void;
	hasReply: boolean;
	onCancelReply: () => void;
	isEditing: boolean;
	onCancelEdit: () => void;
	onEditLast: () => void;
	onOpenConversationSearch: () => void;
	onShowHelp: () => void;
}

/** One keyboard map for the chat surface, kept out of its individual controls. */
export function useKeyboardShortcuts(options: KeyboardShortcutOptions): void {
	const optionsRef = useRef(options);
	optionsRef.current = options;

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
			const currentOptions = optionsRef.current;
			const target = event.target as HTMLElement | null;
			const isTextField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

			if (event.key === "Escape") {
				if (currentOptions.hasOpenPanel) currentOptions.onClosePanel();
				else if (currentOptions.hasReply) currentOptions.onCancelReply();
				else if (currentOptions.isEditing) currentOptions.onCancelEdit();
				else return;
				event.preventDefault();

				return;
			}

			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				document.getElementById("global-conversation-search")?.focus();

				return;
			}

			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
				event.preventDefault();
				currentOptions.onOpenConversationSearch();

				return;
			}

			if (
				event.key === "ArrowUp" &&
				target instanceof HTMLInputElement &&
				target.getAttribute("aria-label") === "Message" &&
				target.value === ""
			) {
				event.preventDefault();
				currentOptions.onEditLast();

				return;
			}

			if (event.key === "?" && !isTextField && !event.metaKey && !event.ctrlKey && !event.altKey) {
				event.preventDefault();
				currentOptions.onShowHelp();
			}
		}

		document.addEventListener("keydown", handleKeyDown);

		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);
}
