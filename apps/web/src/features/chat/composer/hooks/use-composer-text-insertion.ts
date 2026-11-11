import { useEffect, useRef, type RefObject } from "react";

interface ComposerTextInsertionOptions {
	fieldRef: RefObject<HTMLTextAreaElement>;
	conversationId: string;
	content: string;
	setContent: (value: string) => void;
	notifyTyping: () => void;
}

/** Emoji and clipboard text share replacement and caret restoration. */
export function useComposerTextInsertion({
	fieldRef,
	conversationId,
	content,
	setContent,
	notifyTyping,
}: ComposerTextInsertionOptions) {
	const frameRef = useRef<number>();
	useEffect(
		() => () => {
			if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
		},
		[conversationId],
	);

	return (text: string) => {
		const field = fieldRef.current;
		const caret = field?.selectionStart ?? content.length;
		setContent(`${content.slice(0, caret)}${text}${content.slice(field?.selectionEnd ?? caret)}`);
		notifyTyping();
		if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
		frameRef.current = requestAnimationFrame(() => {
			if (!field?.isConnected) return;
			field.focus();
			field.setSelectionRange(caret + text.length, caret + text.length);
		});
	};
}
