import { useAutosizeTextarea } from "@/hooks/use-autosize-textarea";
import { isComposingKey } from "@/utils/is-composing-key";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageDTO, ParticipantDTO } from "@chatty/shared-types";
import { cn } from "@/utils/cn";
import { ComposerDraftNotices } from "./composer-draft-notices";
import { getMentionedUserIds } from "../utils/mentioned-user-ids";
import { useTypingNotifier } from "../hooks";
import { useComposerMentions } from "../hooks/use-composer-mentions";
import { useComposerAttachments } from "../hooks/use-composer-attachments";
import { useComposerTextInsertion } from "../hooks/use-composer-text-insertion";
import { useComposerStickerSend } from "../hooks/use-composer-sticker-send";
import { useComposerFileSend } from "../hooks/use-composer-file-send";
import { useMessageDraft } from "../hooks/use-message-draft";
import { ComposerControls } from "./composer-controls";
import { ComposerMentionSuggestions } from "./composer-mention-suggestions";
import { ComposerReplyPreview } from "./composer-reply-preview";
import { ComposerUploadPreview } from "./composer-upload-preview";
import { VoiceRecorder } from "./voice-recorder";

interface MessageInputProps {
	conversationId: string;
	participants: ParticipantDTO[];
	currentUserId: string;
	isGroup?: boolean;
	/** Only true for the caller's own direct block, never the reverse direction. */
	isDisabled?: boolean;
	/** The message being answered, or null for an ordinary send. */
	replyTo: MessageDTO | null;
	pendingReplyId?: string | null;
	replyError?: string;
	onCancelReply: () => void;
	/** Owned by the page because the thread, including optimistic messages, is its sibling. */
	onSend: (
		content: string,
		attachments: File[],
		replyTo: MessageDTO | null,
		mentionedUserIds?: string[],
	) => Promise<void>;
	onSendSticker: (stickerId: string, replyTo: MessageDTO | null) => Promise<void>;
	onSendFile: (
		file: File,
		content: string,
		replyTo: MessageDTO | null,
		onProgress?: (percent: number) => void,
	) => Promise<void>;
	onSendVoice: (recording: Blob, onProgress?: (percent: number) => void) => Promise<void>;
	onRestoreReply: (messageId: string) => void;
}

export function MessageInput({
	conversationId,
	participants,
	currentUserId,
	isGroup = false,
	isDisabled = false,
	replyTo,
	pendingReplyId = null,
	replyError = "",
	onCancelReply,
	onSend,
	onSendSticker,
	onSendFile,
	onSendVoice,
	onRestoreReply,
}: MessageInputProps) {
	const [content, setContent] = useState("");
	const [error, setError] = useState("");
	const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
	const [isStickerTrayOpen, setIsStickerTrayOpen] = useState(false);
	const [isVoiceActive, setIsVoiceActive] = useState(false);
	const fieldRef = useRef<HTMLTextAreaElement>(null);
	const composerRef = useRef<HTMLDivElement>(null);
	const isComposingRef = useRef(false);
	useAutosizeTextarea(fieldRef, content);
	const { notifyTyping, stopTyping } = useTypingNotifier(conversationId);
	const insertText = useComposerTextInsertion({ fieldRef, conversationId, content, setContent, notifyTyping });
	const { selectedFile, isSending, uploadProgress, sendFile, removeFile } = useComposerFileSend({
		isDisabled: isDisabled || isVoiceActive,
		onSendFile,
		setError,
		onStart: useCallback(() => {
			setIsEmojiPickerOpen(false);
			setIsStickerTrayOpen(false);
		}, []),
	});
	const {
		attachments,
		setAttachments,
		previewUrls,
		isDragActive,
		isFull,
		handleFilesSelected,
		handleFileSelected,
		handlePaste,
		removeAttachment,
	} = useComposerAttachments({
		dropTargetRef: composerRef,
		setError,
		selectedFile,
		isDisabled: isDisabled || isSending || isVoiceActive,
		onFileSelected: sendFile,
		onPasteText: insertText,
	});
	const { clearDraft, hasStorageError } = useMessageDraft({
		userId: currentUserId,
		conversationId,
		content,
		replyToId: replyTo?.id ?? pendingReplyId,
		onRestore: useCallback(
			(draft) => {
				setContent(draft.content);
				if (draft.replyToId) onRestoreReply(draft.replyToId);
			},
			[onRestoreReply],
		),
	});
	const sendSticker = useComposerStickerSend({
		isDisabled: isDisabled || isSending || isVoiceActive || pendingReplyId !== null,
		replyTo,
		onSend: onSendSticker,
		onCancelReply,
		stopTyping,
	});
	const mentions = useComposerMentions({
		content,
		setContent,
		fieldRef,
		participants,
		currentUserId,
		isEnabled: isGroup && !isDisabled && !isVoiceActive,
		onInsert: notifyTyping,
	});

	// A message is allowed to be pictures with nothing written on them.
	const hasSomethingToSend = Boolean(content.trim()) || attachments.length > 0;

	useEffect(() => {
		if (!isDisabled) return;

		stopTyping();
		setIsEmojiPickerOpen(false);
		setIsStickerTrayOpen(false);
	}, [isDisabled, stopTyping]);

	function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
		if (isDisabled) return;
		setContent(event.target.value);
		mentions.syncSelection(event.target);
		if (event.target.value.trim()) notifyTyping();
		else stopTyping();
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (isComposingKey(event) || isComposingRef.current) return;
		if (mentions.handleKeyDown(event)) return;
		if (event.key !== "Enter" || event.shiftKey) return;
		event.preventDefault();
		if (!event.repeat) event.currentTarget.form?.requestSubmit();
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (
			isDisabled ||
			isSending ||
			isVoiceActive ||
			pendingReplyId ||
			isComposingRef.current ||
			!hasSomethingToSend
		) {
			return;
		}

		// Retract before the request: a slow network must not leave "typing…" behind.
		stopTyping();
		setError("");

		const draftContent = content.trim();
		const draftReplyTo = replyTo;
		const mentionedUserIds = isGroup ? getMentionedUserIds(draftContent, participants) : [];

		// The thread's optimistic row owns retry for both text and images. A failed
		// request must never restore an old message over words typed after sending.
		setContent("");
		setAttachments([]);
		clearDraft();
		onCancelReply();
		try {
			await onSend(draftContent, attachments, draftReplyTo, mentionedUserIds);
		} catch {
			// The row remains visible with Retry. Do not create a second composer copy.
		}
	}

	return (
		<div
			ref={composerRef}
			className="message-composer shrink-0 border-t border-rule-soft bg-paper-raised px-3 py-2.5 sm:px-4 md:px-5"
		>
			<ComposerDraftNotices
				isBlocked={isDisabled}
				hasStorageError={hasStorageError}
				pendingReplyId={pendingReplyId}
				replyError={replyError}
				onRestoreReply={onRestoreReply}
				onCancelReply={onCancelReply}
			/>
			<form
				onSubmit={handleSubmit}
				className={cn(
					"relative flex flex-col gap-2 rounded-panel transition",
					isDragActive && "bg-signal-soft p-2 ring-2 ring-signal/20",
				)}
			>
				{replyTo && <ComposerReplyPreview replyTo={replyTo} onCancel={onCancelReply} />}
				<ComposerUploadPreview
					error={error}
					isSending={isSending}
					uploadProgress={uploadProgress}
					attachments={attachments}
					previewUrls={previewUrls}
					selectedFile={selectedFile}
					isDisabled={isDisabled || isVoiceActive}
					onRemoveImage={removeAttachment}
					onRetryFile={() => {
						if (selectedFile) void sendFile(selectedFile);
					}}
					onRemoveFile={removeFile}
				/>

				<ComposerMentionSuggestions
					participants={mentions.suggestions}
					onPick={mentions.insertMention}
					listId={mentions.listId}
					selectedIndex={mentions.selectedIndex}
				/>

				<ComposerControls
					isDisabled={isDisabled}
					isSending={isSending || isVoiceActive}
					isVoiceActive={isVoiceActive}
					isFull={isFull}
					canSend={hasSomethingToSend}
					isSendBlocked={pendingReplyId !== null}
					isEmojiPickerOpen={isEmojiPickerOpen}
					isStickerTrayOpen={isStickerTrayOpen}
					onToggleEmojiPicker={() => {
						setIsStickerTrayOpen(false);
						setIsEmojiPickerOpen((current) => !current);
					}}
					onToggleStickerTray={() => {
						setIsEmojiPickerOpen(false);
						setIsStickerTrayOpen((current) => !current);
					}}
					onCloseEmojiPicker={() => setIsEmojiPickerOpen(false)}
					onCloseStickerTray={() => setIsStickerTrayOpen(false)}
					onFilesSelected={handleFilesSelected}
					onFileSelected={handleFileSelected}
					onInsertEmoji={insertText}
					onPickSticker={sendSticker}
					field={
						<textarea
							ref={fieldRef}
							rows={1}
							onKeyDown={handleKeyDown}
							onCompositionStart={() => {
								isComposingRef.current = true;
							}}
							onCompositionEnd={() => {
								isComposingRef.current = false;
							}}
							value={content}
							onChange={handleChange}
							onSelect={(event) => mentions.syncSelection(event.currentTarget)}
							aria-controls={mentions.suggestions.length ? mentions.listId : undefined}
							aria-activedescendant={
								mentions.suggestions.length ? `${mentions.listId}-${mentions.selectedIndex}` : undefined
							}
							aria-autocomplete={isGroup ? "list" : undefined}
							onPaste={handlePaste}
							disabled={isDisabled || isVoiceActive}
							placeholder="Write a message"
							aria-label="Message"
							className="max-h-40 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint"
						/>
					}
					voiceRecorder={
						<VoiceRecorder
							isDisabled={isDisabled || isSending || attachments.length > 0 || replyTo !== null}
							onSend={onSendVoice}
							onActiveChange={setIsVoiceActive}
						/>
					}
				/>
			</form>
		</div>
	);
}
