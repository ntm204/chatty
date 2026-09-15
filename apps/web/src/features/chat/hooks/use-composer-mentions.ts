import type { ParticipantDTO } from "@chatty/shared-types";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

interface ComposerMentionsOptions {
	content: string;
	setContent: (content: string) => void;
	fieldRef: RefObject<HTMLTextAreaElement>;
	participants: ParticipantDTO[];
	currentUserId: string;
	isEnabled: boolean;
	onInsert: () => void;
}

/** Selection belongs to the textarea; opening suggestions must not discard the suffix after it. */
export function useComposerMentions({
	content,
	setContent,
	fieldRef,
	participants,
	currentUserId,
	isEnabled,
	onInsert,
}: ComposerMentionsOptions) {
	const listId = useId();
	const [selection, setSelection] = useState<[number, number] | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const [dismissedToken, setDismissedToken] = useState<string | null>(null);
	const pendingCaretRef = useRef<number | null>(null);
	const caret = selection?.[0] ?? content.length;
	const match =
		isEnabled && (!selection || selection[0] === selection[1])
			? content.slice(0, caret).match(/(?:^|\s)@([a-z0-9_.-]*)$/iu)
			: null;
	const query = match?.[1]?.toLowerCase() ?? "";
	const token = `${content}:${caret}`;
	const suggestions =
		match && token !== dismissedToken
			? participants
					.filter(
						(participant) =>
							participant.id !== currentUserId &&
							(participant.handle.toLowerCase().includes(query) ||
								participant.displayName.toLowerCase().includes(query)),
					)
					.slice(0, 5)
			: [];
	const selectedIndex = Math.min(activeIndex, Math.max(0, suggestions.length - 1));

	useEffect(() => {
		setActiveIndex(0);
	}, [token]);
	useLayoutEffect(() => {
		const nextCaret = pendingCaretRef.current;
		if (nextCaret === null) return;
		pendingCaretRef.current = null;
		fieldRef.current?.focus();
		fieldRef.current?.setSelectionRange(nextCaret, nextCaret);
	}, [content, fieldRef, selection]);

	function syncSelection(field: HTMLTextAreaElement) {
		const start = field.selectionStart;
		const end = field.selectionEnd;
		setSelection((current) => (current?.[0] === start && current[1] === end ? current : [start, end]));
	}

	function insertMention(participant: ParticipantDTO) {
		if (!match || match.index === undefined) return;
		const start = match.index + (match[0].startsWith("@") ? 0 : 1);
		// Replace the whole handle even when the caret is inside it, keeping the rest of the message.
		const end = caret + (content.slice(caret).match(/^[a-z0-9_.-]*/iu)?.[0].length ?? 0);
		const suffix = content.slice(end);
		const replacement = `@${participant.handle}${/^\s/u.test(suffix) ? "" : " "}`;
		const nextCaret = start + replacement.length + (/^\s/u.test(suffix) ? 1 : 0);
		pendingCaretRef.current = nextCaret;
		setSelection([nextCaret, nextCaret]);
		setDismissedToken(`${content.slice(0, start)}${replacement}${suffix}:${nextCaret}`);
		setContent(`${content.slice(0, start)}${replacement}${suffix}`);
		onInsert();
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
		if (!suggestions.length || event.shiftKey) return false;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			setDismissedToken(token);

			return true;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex(
				(selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length,
			);

			return true;
		}
		if (event.key !== "Enter") return false;
		event.preventDefault();
		if (!event.repeat) insertMention(suggestions[selectedIndex]!);

		return true;
	}

	return { listId, suggestions, selectedIndex, insertMention, syncSelection, handleKeyDown };
}
