import type { ChangeEvent, ClipboardEvent, Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import {
	MAX_ATTACHMENTS_PER_MESSAGE,
	MAX_FILE_BYTES,
	MAX_IMAGE_BYTES,
	REFUSED_FILE_EXTENSIONS,
} from "../constants/attachment";

interface UseComposerAttachmentsOptions {
	setError: Dispatch<SetStateAction<string>>;
	isDisabled: boolean;
	selectedFile: File | null;
	onFileSelected: (file: File) => Promise<void>;
}

export function useComposerAttachments({
	setError,
	isDisabled,
	selectedFile,
	onFileSelected,
}: UseComposerAttachmentsOptions) {
	const [attachments, setAttachments] = useState<File[]>([]);
	const [previewUrls, setPreviewUrls] = useState<string[]>([]);
	const [isDragActive, setIsDragActive] = useState(false);
	const isFull = attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE || selectedFile !== null;

	useEffect(() => {
		const objectUrls = attachments.map((file) => URL.createObjectURL(file));
		setPreviewUrls(objectUrls);

		return () => objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
	}, [attachments]);

	const addImages = useCallback(
		(picked: File[]) => {
			if (isDisabled || picked.length === 0) return;
			if (selectedFile) {
				setError("Send images or one file, not both");

				return;
			}
			const images = picked.filter((file) => file.type.startsWith("image/"));
			if (images.length !== picked.length) {
				setError("Only images can be added together");

				return;
			}
			if (images.some((file) => file.size > MAX_IMAGE_BYTES)) {
				setError("Each image must be smaller than 10MB");

				return;
			}

			setAttachments((current) => [...current, ...images].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
			setError(
				images.length + attachments.length > MAX_ATTACHMENTS_PER_MESSAGE
					? `A message may carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} images`
					: "",
			);
		},
		[attachments.length, isDisabled, selectedFile, setError],
	);

	const selectDocument = useCallback(
		(file: File) => {
			if (isDisabled) return;
			if (selectedFile) {
				setError("Retry or remove the current file first");

				return;
			}
			if (attachments.length > 0) {
				setError("Send images or one file, not both");

				return;
			}
			const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
			if ((REFUSED_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
				setError("Executable files cannot be sent");

				return;
			}
			if (file.size > MAX_FILE_BYTES) {
				setError("File must be smaller than 25MB");

				return;
			}
			setError("");
			void onFileSelected(file);
		},
		[attachments.length, isDisabled, onFileSelected, selectedFile, setError],
	);

	useEffect(() => {
		function hasFiles(event: DragEvent): boolean {
			return [...(event.dataTransfer?.types ?? [])].includes("Files");
		}

		function handleDragOver(event: DragEvent) {
			if (!hasFiles(event)) return;
			event.preventDefault();
			if (isDisabled) return;
			setIsDragActive(true);
		}

		function handleDragLeave(event: DragEvent) {
			if (event.relatedTarget === null) setIsDragActive(false);
		}

		function handleDrop(event: DragEvent) {
			if (!hasFiles(event)) return;
			event.preventDefault();
			setIsDragActive(false);
			const files = [...(event.dataTransfer?.files ?? [])];
			if (files.every((file) => file.type.startsWith("image/"))) addImages(files);
			else if (files.length === 1 && files[0]) selectDocument(files[0]);
			else setError("Drop images together, or one other file at a time");
		}

		window.addEventListener("dragover", handleDragOver);
		window.addEventListener("dragleave", handleDragLeave);
		window.addEventListener("drop", handleDrop);

		return () => {
			window.removeEventListener("dragover", handleDragOver);
			window.removeEventListener("dragleave", handleDragLeave);
			window.removeEventListener("drop", handleDrop);
		};
	}, [addImages, isDisabled, selectDocument, setError]);

	function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
		const picked = [...(event.target.files ?? [])];
		event.target.value = "";
		addImages(picked);
	}

	function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		if (file.type.startsWith("image/")) addImages([file]);
		else selectDocument(file);
	}

	function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
		const files = [...event.clipboardData.files];
		if (files.length === 0) return;
		event.preventDefault();
		if (files.every((file) => file.type.startsWith("image/"))) addImages(files);
		else if (files.length === 1 && files[0]) selectDocument(files[0]);
		else setError("Paste images together, or one other file at a time");
	}

	function removeAttachment(index: number) {
		setAttachments((current) => current.filter((_, position) => position !== index));
		setError("");
	}

	return {
		attachments,
		setAttachments,
		previewUrls,
		isDragActive,
		isFull,
		handleFilesSelected,
		handleFileSelected,
		handlePaste,
		removeAttachment,
	};
}
