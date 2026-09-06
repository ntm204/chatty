import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageDTO, ParticipantDTO } from "@chatty/shared-types";
import { cn } from "@/utils/cn";
import { useTypingNotifier } from "../hooks";
import { useComposerAttachments } from "../hooks/use-composer-attachments";
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
	/** Only true for the caller's own direct block, never the reverse direction. */
	isDisabled?: boolean;
	/** The message being answered, or null for an ordinary send. */
	replyTo: MessageDTO | null;
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
	isDisabled = false,
	replyTo,
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
	const fieldRef = useRef<HTMLInputElement>(null);
	const contentRef = useRef(content);
	contentRef.current = content;
	const { notifyTyping, stopTyping } = useTypingNotifier(conversationId);
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
		setError,
		selectedFile,
		isDisabled: isDisabled || isSending || isVoiceActive,
		onFileSelected: sendFile,
	});
	const clearDraft = useMessageDraft({
		conversationId,
		content,
		replyToId: replyTo?.id ?? null,
		onRestore: useCallback(
			(draft) => {
				setContent(draft.content);
				if (draft.replyToId) onRestoreReply(draft.replyToId);
			},
			[onRestoreReply],
		),
	});
	const mentionMatch = content.match(/(?:^|\s)@([a-z0-9_.-]*)$/iu);
	const mentionQuery = mentionMatch?.[1]?.toLowerCase();
	const mentionSuggestions = mentionMatch
		? participants
				.filter(
					(participant) =>
						participant.id !== currentUserId &&
						(participant.handle.includes(mentionQuery ?? "") ||
							participant.displayName.toLowerCase().includes(mentionQuery ?? "")),
				)
				.slice(0, 5)
		: [];

	// A message is allowed to be pictures with nothing written on them.
	const hasSomethingToSend = Boolean(content.trim()) || attachments.length > 0;

	useEffect(() => {
		if (!isDisabled) return;

		stopTyping();
		setIsEmojiPickerOpen(false);
		setIsStickerTrayOpen(false);
	}, [isDisabled, stopTyping]);

	function handleChange(event: ChangeEvent<HTMLInputElement>) {
		if (isDisabled) return;
		setContent(event.target.value);
		if (event.target.value.trim()) notifyTyping();
		else stopTyping();
	}

	function insertMention(participant: ParticipantDTO) {
		if (!mentionMatch || mentionMatch.index === undefined) return;
		const leadingSpace = mentionMatch[0].startsWith(" ") ? " " : "";
		setContent(`${content.slice(0, mentionMatch.index)}${leadingSpace}@${participant.handle} `);
		requestAnimationFrame(() => fieldRef.current?.focus());
	}

	/** Inserts at the caret and restores focus after the controlled field renders. */
	function insertEmoji(char: string) {
		const field = fieldRef.current;
		const caret = field?.selectionStart ?? content.length;
		const next = `${content.slice(0, caret)}${char}${content.slice(field?.selectionEnd ?? caret)}`;

		setContent(next);
		notifyTyping();
		// Wait for the new value to render before placing the caret.
		requestAnimationFrame(() => {
			field?.focus();
			field?.setSelectionRange(caret + char.length, caret + char.length);
		});
	}

	function sendSticker(stickerId: string) {
		if (isDisabled) return;
		// A sticker is the whole message, so its tray must not cover what was just sent.
		setIsStickerTrayOpen(false);
		stopTyping();
		const target = replyTo;
		void onSendSticker(stickerId, target).then(() => {
			// Sending a sticker consumes the reply, not the text still in the field.
			onCancelReply();
		});
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (isDisabled || isSending || !hasSomethingToSend) return;

		// Retract before the request: a slow network must not leave "typing…" behind.
		stopTyping();
		setError("");

		const draftContent = content.trim();
		const draftReplyTo = replyTo;
		const mentionedUserIds = participants
			.filter((participant) =>
				new RegExp(`(^|\\s)@${participant.handle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?=\\s|$)`, "iu").test(
					draftContent,
				),
			)
			.map((participant) => participant.id);

		// Empty text before the round trip; the optimistic bubble owns any failure.
		if (attachments.length === 0) {
			localStorage.setItem(
				`chatty:draft:${conversationId}`,
				JSON.stringify({ content: draftContent, replyToId: draftReplyTo?.id ?? null }),
			);
			setContent("");
			try {
				await onSend(draftContent, [], draftReplyTo, mentionedUserIds);
				if (contentRef.current === "") clearDraft();
				onCancelReply();
			} catch (sendError) {
				setContent(draftContent);
				setError(sendError instanceof Error ? sendError.message : "The message could not be sent");
			}

			return;
		}

		// Pictures also empty optimistically; their bubble owns the retry state.
		setContent("");
		setAttachments([]);
		clearDraft();
		onCancelReply();
		try {
			await onSend(draftContent, attachments, draftReplyTo, mentionedUserIds);
		} catch {
			// Swallowed on purpose: the draft in the thread is already showing
			// "Not sent" with a retry beside it, and a second copy of the same
			// news in a composer the sender has moved on from is noise.
		}
	}

	return (
		<div className="shrink-0 border-t border-rule-soft bg-paper-raised px-3 py-2.5 sm:px-4 md:px-5">
			{isDisabled && (
				<p role="status" className="mb-2 rounded-control bg-signal-soft px-3 py-2 text-[13px] text-signal">
					You blocked this person. Unblock them to send a message.
				</p>
			)}
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

				<ComposerMentionSuggestions participants={mentionSuggestions} onPick={insertMention} />

				<ComposerControls
					isDisabled={isDisabled}
					isSending={isSending || isVoiceActive}
					isVoiceActive={isVoiceActive}
					isFull={isFull}
					canSend={hasSomethingToSend}
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
					onInsertEmoji={insertEmoji}
					onPickSticker={sendSticker}
					field={
						<input
							ref={fieldRef}
							value={content}
							onChange={handleChange}
							onPaste={handlePaste}
							disabled={isDisabled || isVoiceActive}
							placeholder="Write a message"
							aria-label="Message"
							className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint"
						/>
					}
					voiceRecorder={
						<VoiceRecorder
							isDisabled={isDisabled || isSending || hasSomethingToSend || replyTo !== null}
							onSend={onSendVoice}
							onActiveChange={setIsVoiceActive}
						/>
					}
				/>
			</form>
		</div>
	);
}
