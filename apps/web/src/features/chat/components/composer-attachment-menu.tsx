import { FileText, ImagePlus, Paperclip, Sticker } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { ACCEPTED_IMAGE_TYPES, MAX_ATTACHMENTS_PER_MESSAGE } from "../constants/attachment";

interface ComposerAttachmentMenuProps {
	isDisabled: boolean;
	isFull: boolean;
	onOpen: () => void;
	onOpenStickerTray: () => void;
	onFilesSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/** One stable attachment entry point for pointer, touch and keyboard users. */
export function ComposerAttachmentMenu({
	isDisabled,
	isFull,
	onOpen,
	onOpenStickerTray,
	onFilesSelected,
	onFileSelected,
}: ComposerAttachmentMenuProps) {
	const [isOpen, setIsOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!isOpen) return;
		const focusFrame = window.requestAnimationFrame(() => {
			rootRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus();
		});

		function handlePointerDown(event: PointerEvent): void {
			if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
		}

		function handleKeyDown(event: KeyboardEvent): void {
			if (event.key === "Escape") {
				setIsOpen(false);
				rootRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();

				return;
			}
			if (!rootRef.current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
			const items = [...rootRef.current.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)")];
			if (items.length === 0) return;
			event.preventDefault();
			const currentIndex = items.findIndex((item) => item === document.activeElement);
			if (event.key === "Home") items[0]?.focus();
			else if (event.key === "End") items[items.length - 1]?.focus();
			else if (event.key === "ArrowDown") items[(currentIndex + 1 + items.length) % items.length]?.focus();
			else items[(currentIndex - 1 + items.length) % items.length]?.focus();
		}

		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			window.cancelAnimationFrame(focusFrame);
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	function toggle(): void {
		if (isOpen) {
			setIsOpen(false);

			return;
		}
		onOpen();
		setIsOpen(true);
	}

	function openPicker(input: HTMLInputElement | null): void {
		setIsOpen(false);
		input?.click();
	}

	return (
		<div ref={rootRef} className="relative shrink-0">
			<input
				ref={imageInputRef}
				type="file"
				accept={ACCEPTED_IMAGE_TYPES}
				multiple
				onChange={onFilesSelected}
				className="hidden"
			/>
			<input ref={fileInputRef} type="file" onChange={onFileSelected} className="hidden" />

			<Button
				variant="ghost"
				onClick={toggle}
				disabled={isDisabled}
				aria-label="Add an attachment"
				title="Attach"
				aria-haspopup="menu"
				aria-expanded={isOpen}
				className={cn(
					"size-9 rounded-full p-0 text-ink-faint hover:bg-transparent hover:text-ink",
					isOpen && "bg-paper-sunken text-ink",
				)}
			>
				<Paperclip aria-hidden="true" className="size-[18px]" />
			</Button>

			{isOpen && (
				<div
					role="menu"
					aria-label="Choose an attachment"
					className="popover-enter origin-bottom-left absolute bottom-full left-0 z-50 mb-2 w-48 overflow-hidden rounded-panel border border-rule bg-paper-raised p-1.5 shadow-lift"
				>
					<Button
						variant="ghost"
						role="menuitem"
						disabled={isDisabled || isFull}
						onClick={() => openPicker(imageInputRef.current)}
						aria-label={isFull ? `At most ${MAX_ATTACHMENTS_PER_MESSAGE} images` : "Photos"}
						className="w-full justify-start px-2.5 py-2.5 text-ink"
					>
						<ImagePlus aria-hidden="true" className="size-4 text-ink-faint" />
						Photos
					</Button>
					<Button
						variant="ghost"
						role="menuitem"
						disabled={isDisabled || isFull}
						onClick={() => openPicker(fileInputRef.current)}
						className="w-full justify-start px-2.5 py-2.5 text-ink"
					>
						<FileText aria-hidden="true" className="size-4 text-ink-faint" />
						File
					</Button>
					<Button
						variant="ghost"
						role="menuitem"
						disabled={isDisabled}
						onClick={() => {
							setIsOpen(false);
							onOpenStickerTray();
						}}
						className="w-full justify-start px-2.5 py-2.5 text-ink"
					>
						<Sticker aria-hidden="true" className="size-4 text-ink-faint" />
						Sticker
					</Button>
				</div>
			)}
		</div>
	);
}
