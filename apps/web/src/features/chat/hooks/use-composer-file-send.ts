import type { MessageDTO } from "@chatty/shared-types";
import { useCallback, useRef, useState } from "react";

interface UseComposerFileSendOptions {
	isDisabled: boolean;
	onSendFile: (
		file: File,
		content: string,
		replyTo: MessageDTO | null,
		onProgress?: (percent: number) => void,
	) => Promise<void>;
	onStart: () => void;
	setError: (error: string) => void;
}

/** A failed standalone file stays available without taking ownership of the text or reply draft. */
export function useComposerFileSend({ isDisabled, onSendFile, onStart, setError }: UseComposerFileSendOptions) {
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const isSendingRef = useRef(false);

	const sendFile = useCallback(
		async (file: File): Promise<void> => {
			if (isDisabled || isSendingRef.current) return;
			isSendingRef.current = true;
			setSelectedFile(file);
			setIsSending(true);
			setUploadProgress(0);
			setError("");
			onStart();
			try {
				await onSendFile(file, "", null, setUploadProgress);
				setSelectedFile(null);
			} catch (caught) {
				setError(caught instanceof Error ? caught.message : "The file could not be sent");
			} finally {
				isSendingRef.current = false;
				setIsSending(false);
			}
		},
		[isDisabled, onSendFile, onStart, setError],
	);

	const removeFile = useCallback(() => {
		if (isSendingRef.current) return;
		setSelectedFile(null);
		setError("");
	}, [setError]);

	return { selectedFile, isSending, uploadProgress, sendFile, removeFile };
}
