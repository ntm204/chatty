import type { ChangeEvent, ClipboardEvent, KeyboardEvent, MutableRefObject, RefObject, SyntheticEvent } from "react";

interface ComposerTextFieldProps {
	fieldRef: RefObject<HTMLTextAreaElement>;
	/** Set while an IME is composing, so Enter picks a candidate instead of sending. */
	isComposingRef: MutableRefObject<boolean>;
	value: string;
	isDisabled: boolean;
	/** The open mention list and its highlighted row, for the combobox semantics; null when closed. */
	mentionList: { id: string; activeIndex: number } | null;
	isGroup: boolean;
	onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
	onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
	onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
}

/** The composer's text well: one auto-growing field that is also a mention combobox in groups. */
export function ComposerTextField({
	fieldRef,
	isComposingRef,
	value,
	isDisabled,
	mentionList,
	isGroup,
	onChange,
	onKeyDown,
	onPaste,
	onSelect,
}: ComposerTextFieldProps) {
	return (
		<textarea
			ref={fieldRef}
			rows={1}
			onKeyDown={onKeyDown}
			onCompositionStart={() => {
				isComposingRef.current = true;
			}}
			onCompositionEnd={() => {
				isComposingRef.current = false;
			}}
			value={value}
			onChange={onChange}
			onSelect={onSelect}
			aria-controls={mentionList?.id}
			aria-activedescendant={mentionList ? `${mentionList.id}-${mentionList.activeIndex}` : undefined}
			aria-autocomplete={isGroup ? "list" : undefined}
			onPaste={onPaste}
			disabled={isDisabled}
			placeholder="Write a message"
			aria-label="Message"
			className="font-content max-h-40 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint"
		/>
	);
}
