import type { ConversationDTO } from "@chatty/shared-types";
import { CheckCheck, EyeOff, MessageCircle, Pin, PinOff, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { cn } from "@/utils/cn";
import { PREVIEW_POPOVER_GAP, PREVIEW_POPOVER_MAX_HEIGHT, PREVIEW_POPOVER_WIDTH } from "../constants/conversation-list";
import { useConversationPreviewMessages } from "../hooks/use-conversation-preview-messages";
import { getConversationTitle } from "../../utils";
import { ConversationAvatar } from "../../components/conversation-avatar";
import { ConversationPreviewMessage } from "./conversation-preview-message";
import { FlowingWallpaper } from "../../theme/components";
import { getErrorMessage } from "@/utils/get-error-message";

interface ConversationPreviewProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
	/**
	 * `sheet` on touch (long-press): the list blurs and the preview fills the
	 * middle of the screen. `popover` on desktop (the eye button): a panel beside
	 * the sidebar, next to the row it came from, the rest of the app still in view.
	 */
	variant: "sheet" | "popover";
	/** The row the preview was opened from; the popover lines up with it. */
	anchor: DOMRect;
	/** The sidebar's right edge; the popover opens just past it. */
	sidebarRight: number;
	onOpen: () => void;
	onClose: () => void;
}

/**
 * Read a conversation without opening it — so nobody is told you have.
 *
 * The reason the feature exists, on every messenger that has it: a message
 * arrives that you want to read now and answer later, and opening the chat
 * would hand the sender a "Seen". Here opening is what marks a chat read
 * (`useMarkRead` posts `/read`); the preview only fetches history, so the
 * sender's ticks do not move until you open the chat or choose Mark as read.
 * The header says so, because a reader who is not sure will not trust it.
 */
export function ConversationPreview({
	conversation,
	currentUserId,
	onlineUserIds,
	variant,
	anchor,
	sidebarRight,
	onOpen,
	onClose,
}: ConversationPreviewProps) {
	const dialogRef = useDialog<HTMLDivElement>(onClose);
	const scrollerRef = useRef<HTMLDivElement>(null);
	const { messages, isLoading, error } = useConversationPreviewMessages(
		conversation.id,
		conversation.lastMessage?.id ?? null,
	);
	const [actionError, setActionError] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const title = getConversationTitle(conversation, currentUserId);
	const newest = messages.at(-1);
	const firstUnreadIndex =
		conversation.unreadCount > 0 ? Math.max(0, messages.length - conversation.unreadCount) : -1;

	// Open on the newest message, as the chat itself would.
	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	}, [messages]);

	// A preview of a conversation that disappears (left, deleted) has nothing to show.
	useEffect(() => {
		if (error && messages.length === 0 && !isLoading) setActionError(error);
	}, [error, isLoading, messages.length]);

	async function act(action: () => Promise<unknown>) {
		if (isSaving) return;
		setIsSaving(true);
		setActionError("");
		try {
			await action();
			onClose();
		} catch (caught) {
			setActionError(getErrorMessage(caught, "Could not do that. Try again."));
		} finally {
			setIsSaving(false);
		}
	}

	const popoverHeight = Math.min(PREVIEW_POPOVER_MAX_HEIGHT, window.innerHeight - PREVIEW_POPOVER_GAP * 2);
	const popoverStyle = {
		width: PREVIEW_POPOVER_WIDTH,
		height: popoverHeight,
		left: Math.min(
			sidebarRight + PREVIEW_POPOVER_GAP,
			window.innerWidth - PREVIEW_POPOVER_WIDTH - PREVIEW_POPOVER_GAP,
		),
		top: Math.max(
			PREVIEW_POPOVER_GAP,
			Math.min(anchor.top - 24, window.innerHeight - popoverHeight - PREVIEW_POPOVER_GAP),
		),
	};

	const actions = (
		<>
			<Button onClick={onOpen} disabled={isSaving} className="conversation-preview-action gap-2">
				<MessageCircle aria-hidden="true" className="size-4" />
				Open chat
			</Button>
			{conversation.unreadCount > 0 && newest && (
				<Button
					variant="ghost"
					onClick={() => void act(() => api.markConversationRead(conversation.id, newest.id))}
					disabled={isSaving}
					className="conversation-preview-action gap-2"
				>
					<CheckCheck aria-hidden="true" className="size-4" />
					Mark as read
				</Button>
			)}
			<Button
				variant="ghost"
				onClick={() => void act(() => api.setConversationPinned(conversation.id, !conversation.isPinned))}
				disabled={isSaving}
				className="conversation-preview-action gap-2"
			>
				{conversation.isPinned ? (
					<PinOff aria-hidden="true" className="size-4" />
				) : (
					<Pin aria-hidden="true" className="size-4" />
				)}
				{conversation.isPinned ? "Unpin" : "Pin"}
			</Button>
		</>
	);

	return createPortal(
		<div
			ref={dialogRef}
			role="dialog"
			aria-modal="true"
			aria-label={`Preview of ${title}`}
			tabIndex={-1}
			data-variant={variant}
			className="conversation-preview fixed inset-0 z-50 outline-none"
		>
			<div className="conversation-preview-backdrop absolute inset-0" onClick={onClose} />
			<div
				className={cn(
					"absolute flex flex-col gap-3",
					variant === "sheet" && "inset-x-4 top-1/2 mx-auto max-w-[26rem] -translate-y-1/2",
				)}
				style={variant === "popover" ? popoverStyle : undefined}
			>
				<section
					className={cn(
						"conversation-preview-card flex min-h-0 flex-col overflow-hidden rounded-3xl bg-paper-raised shadow-modal",
						variant === "sheet" ? "h-[min(60dvh,32rem)]" : "h-full",
					)}
				>
					<header className="flex shrink-0 items-center gap-3 border-b border-rule-soft px-4 py-3">
						<ConversationAvatar
							conversation={conversation}
							currentUserId={currentUserId}
							onlineUserIds={onlineUserIds}
							size="sm"
						/>
						<div className="min-w-0 flex-1">
							<p className="truncate text-base font-semibold text-ink">{title}</p>
							<p className="flex items-center gap-1 text-[12px] text-ink-faint">
								<EyeOff aria-hidden="true" className="size-3.5 shrink-0" />
								Preview · not marked as read
							</p>
						</div>
						{variant === "popover" && (
							<Button
								variant="ghost"
								onClick={onClose}
								aria-label="Close preview"
								className="size-8 shrink-0 rounded-full p-0"
							>
								<X className="size-4" />
							</Button>
						)}
					</header>

					<div
						data-conversation-theme={conversation.themeColor ?? "default"}
						className="theme-preview-chat relative min-h-0 flex-1"
					>
						<FlowingWallpaper theme={conversation.themeColor ?? "default"} />
						<div
							ref={scrollerRef}
							aria-label="Recent messages"
							className="relative flex h-full flex-col gap-1.5 overflow-y-auto px-3 py-3"
						>
							{isLoading && messages.length === 0 && (
								<p className="wallpaper-pill m-auto rounded-full px-3 py-1 text-[12px] text-ink-faint">
									Loading…
								</p>
							)}
							{!isLoading && messages.length === 0 && !error && (
								<p className="wallpaper-pill m-auto rounded-full px-3 py-1 text-[12px] text-ink-faint">
									No messages yet
								</p>
							)}
							{messages.length > 0 && <span className="mt-auto" />}
							{messages.map((message, index) => {
								const previous = messages[index - 1];
								const isMine = message.author?.id === currentUserId;

								return (
									<div key={message.id} className="flex flex-col gap-1.5">
										{index === firstUnreadIndex && (
											<p className="wallpaper-pill mx-auto my-1 w-fit rounded-full px-3 py-1 text-[11px] font-semibold text-ink-soft">
												Unread messages
											</p>
										)}
										<ConversationPreviewMessage
											message={message}
											isMine={isMine}
											showsAuthor={
												conversation.isGroup &&
												!isMine &&
												(previous?.author?.id !== message.author?.id ||
													index === firstUnreadIndex)
											}
											participants={conversation.participants}
											themeColor={conversation.themeColor}
										/>
									</div>
								);
							})}
						</div>
					</div>

					{variant === "popover" && (
						<footer className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-t border-rule-soft px-3 py-2.5">
							{actions}
						</footer>
					)}
				</section>

				{variant === "sheet" && (
					<div className="conversation-preview-menu flex flex-col rounded-2xl bg-paper-raised p-1.5 shadow-modal">
						{actions}
					</div>
				)}
				{actionError && (
					<p role="alert" className="rounded-xl bg-paper-raised px-3 py-2 text-[13px] text-signal shadow-sm">
						{actionError}
					</p>
				)}
			</div>
		</div>,
		document.body,
	);
}
