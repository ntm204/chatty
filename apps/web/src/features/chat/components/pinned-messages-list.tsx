import type { PinnedMessageDTO } from "@chatty/shared-types";
import { Eye, FileText, Mic, MoreHorizontal, PinOff } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getPinnedMessageAuthorLabel, getPinnedMessagePreview } from "../utils/pinned-message-preview";
import { api } from "@/api/client";
import { Button } from "@/components/button";

interface PinnedMessagesListProps {
	pinnedMessages: PinnedMessageDTO[];
	currentUserId: string;
	onOpenMessage: (messageId: string) => void;
}

export function PinnedMessagesList({ pinnedMessages, currentUserId, onOpenMessage }: PinnedMessagesListProps) {
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const menuRef = useRef<HTMLDivElement>(null);
	// Whichever "..." button is currently open, so the portalled menu below can
	// be positioned against it without every row needing its own ref.
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });

	useEffect(() => {
		if (!openMenuId) return;

		function closeFromOutside(event: PointerEvent) {
			if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node))
				setOpenMenuId(null);
		}

		document.addEventListener("pointerdown", closeFromOutside);

		return () => document.removeEventListener("pointerdown", closeFromOutside);
	}, [openMenuId]);

	// Portalled to <body> rather than absolutely positioned inside the row: the
	// dialog's list scrolls, and a menu clipped by that overflow — or one that
	// forced the dialog to grow to fit it — was the whole complaint this fixes.
	useLayoutEffect(() => {
		if (!openMenuId || !triggerRef.current || !menuRef.current) return;
		const triggerBounds = triggerRef.current.getBoundingClientRect();
		const menuBounds = menuRef.current.getBoundingClientRect();
		const gap = 4;
		setMenuPosition({
			left: Math.max(
				gap,
				Math.min(window.innerWidth - menuBounds.width - gap, triggerBounds.right - menuBounds.width),
			),
			top:
				triggerBounds.bottom + gap + menuBounds.height <= window.innerHeight
					? triggerBounds.bottom + gap
					: Math.max(gap, triggerBounds.top - menuBounds.height - gap),
		});
	}, [openMenuId]);

	async function unpin(pin: PinnedMessageDTO) {
		if (!pin.message || pendingId) return;
		setOpenMenuId(null);
		setPendingId(pin.messageId);
		setError("");
		try {
			await api.unpinMessage(pin.message.conversationId, pin.messageId);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not unpin message");
		} finally {
			setPendingId(null);
		}
	}

	const openMenuMessage = pinnedMessages.find((message) => message.messageId === openMenuId);

	return (
		<>
			{error && (
				<p role="alert" className="px-4 py-2 text-sm text-signal">
					{error}
				</p>
			)}
			<ul aria-label="Pinned messages" className="flex flex-col gap-1 p-2">
				{pinnedMessages.length === 0 && <li className="p-4 text-sm text-ink-faint">No pinned messages yet.</li>}
				{pinnedMessages.map((message) => {
					const attachment = message.message?.attachments[0];
					const isImage = attachment?.kind === "image";
					const label = getPinnedMessagePreview(message);
					const authorLabel = getPinnedMessageAuthorLabel(message, currentUserId);

					return (
						<li
							key={message.messageId}
							className="relative flex items-center rounded-panel hover:bg-paper-sunken"
						>
							<Button
								variant="ghost"
								aria-label={label}
								onClick={() => onOpenMessage(message.messageId)}
								className="min-w-0 flex-1 items-center justify-start gap-3 p-3 text-left font-normal"
							>
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="truncate text-sm text-ink">
										{attachment && message.content ? `${label} · ${message.content}` : label}
									</span>
									<span className="truncate text-xs text-ink-faint">
										{authorLabel === "You" ? "Your message" : `Message from ${authorLabel}`}
									</span>
								</span>
								{isImage ? (
									<img
										src={attachment.thumbUrl || attachment.url}
										alt=""
										className="size-11 shrink-0 rounded-lg object-cover"
									/>
								) : (
									attachment && (
										<span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-paper-sunken">
											{attachment.kind === "audio" ? (
												<Mic className="size-4" />
											) : (
												<FileText className="size-4" />
											)}
										</span>
									)
								)}
							</Button>
							{message.message && (
								<Button
									variant="ghost"
									aria-label={`More options for ${label}`}
									aria-haspopup="menu"
									aria-expanded={openMenuId === message.messageId}
									onClick={(event) => {
										triggerRef.current = event.currentTarget;
										setOpenMenuId(openMenuId === message.messageId ? null : message.messageId);
									}}
									className="mr-2 size-8 shrink-0 p-0"
								>
									<MoreHorizontal className="size-4 text-ink-faint" />
								</Button>
							)}
						</li>
					);
				})}
			</ul>
			{openMenuMessage &&
				createPortal(
					<div
						ref={menuRef}
						role="menu"
						aria-label={`Options for ${getPinnedMessagePreview(openMenuMessage)}`}
						style={menuPosition}
						className="fixed z-50 w-48 overflow-hidden rounded-panel border border-rule bg-paper-raised p-1.5 shadow-lift"
					>
						<Button
							variant="ghost"
							role="menuitem"
							onClick={() => {
								setOpenMenuId(null);
								onOpenMessage(openMenuMessage.messageId);
							}}
							className="w-full justify-start px-2.5 py-2 text-ink"
						>
							<Eye className="size-4 text-ink-faint" />
							View in chat
						</Button>
						<Button
							variant="ghost"
							role="menuitem"
							disabled={pendingId !== null}
							onClick={() => void unpin(openMenuMessage)}
							className="w-full justify-start px-2.5 py-2 text-ink"
						>
							<PinOff className="size-4 text-ink-faint" />
							Unpin
						</Button>
					</div>,
					document.body,
				)}
		</>
	);
}
