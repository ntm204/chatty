import type { MessageDTO } from "@chatty/shared-types";
import { Forward, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { api } from "@/api/client";
import { useDialog } from "@/hooks/use-dialog";
import { useForwardDestinations } from "../hooks/use-forward-destinations";
import { Button } from "@/components/button";
import { getConversationTitle } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";

interface ForwardMessagePanelProps {
	message: MessageDTO;
	currentUserId: string;
	onClose: () => void;
}

export function ForwardMessagePanel({ message, currentUserId, onClose }: ForwardMessagePanelProps) {
	const [sendingToId, setSendingToId] = useState<string | null>(null);
	const [forwardedTo, setForwardedTo] = useState<string | null>(null);
	const [error, setError] = useState("");
	const destinations = useForwardDestinations();
	const isSendingRef = useRef(false);
	const attemptsRef = useRef(new Map<string, string>());
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const close = useCallback(() => {
		if (!isSendingRef.current) onCloseRef.current();
	}, []);
	const dialogRef = useDialog<HTMLDivElement>(close);

	async function forwardTo(conversationId: string): Promise<void> {
		if (isSendingRef.current) return;
		isSendingRef.current = true;
		setSendingToId(conversationId);
		setError("");
		try {
			const clientId = attemptsRef.current.get(conversationId) ?? crypto.randomUUID();
			attemptsRef.current.set(conversationId, clientId);
			await api.forwardMessage(conversationId, message.id, clientId);
			const destination = destinations.items.find((conversation) => conversation.id === conversationId);
			setForwardedTo(destination ? getConversationTitle(destination, currentUserId) : "the conversation");
			setSendingToId(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "The message could not be forwarded");
			setSendingToId(null);
		} finally {
			isSendingRef.current = false;
		}
	}

	return (
		<div className="absolute inset-0 z-40 flex items-center justify-center bg-scrim/20 p-4 dark:bg-scrim/50">
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label="Forward message"
				tabIndex={-1}
				className="flex h-[min(32rem,80dvh)] w-full max-w-sm flex-col overflow-hidden rounded-bubble border border-rule bg-paper-raised shadow-lift"
			>
				<div className="flex items-center gap-3 border-b border-rule px-4 py-3">
					<Forward className="size-4 text-ink-faint" />
					<h2 className="flex-1 text-sm font-semibold">Forward to</h2>
					<Button
						variant="ghost"
						onClick={close}
						disabled={sendingToId !== null}
						aria-label="Close forward panel"
						className="size-7 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>
				{forwardedTo ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
						<p role="status" className="text-sm text-ink">
							Forwarded to {forwardedTo}.
						</p>
						<Button onClick={close}>Done</Button>
					</div>
				) : (
					<>
						<p className="mx-4 mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink-soft">
							{message.content || `${message.attachments.length} attachment(s)`}
						</p>
						<input
							type="search"
							aria-label="Find a conversation to forward to"
							placeholder="Search conversations"
							maxLength={100}
							value={destinations.query}
							disabled={sendingToId !== null}
							onChange={(event) => destinations.setQuery(event.target.value)}
							className="m-3 rounded-control border border-rule bg-paper px-3 py-2 text-sm"
						/>
						{error && (
							<p role="alert" className="px-4 py-2 text-xs text-signal">
								{error}
							</p>
						)}
						<div className="min-h-0 flex-1 overflow-y-auto p-2">
							{destinations.error && (
								<div role="alert" className="p-3 text-sm text-signal">
									{destinations.error}
									<Button variant="ghost" onClick={destinations.retry}>
										Retry search
									</Button>
								</div>
							)}
							{destinations.isLoading && (
								<p role="status" className="p-3 text-sm text-ink-soft">
									Loading conversations…
								</p>
							)}
							{!destinations.isLoading && !destinations.error && !destinations.items.length && (
								<p className="p-3 text-sm text-ink-soft">No conversations found.</p>
							)}
							{sendingToId && (
								<p role="status" className="p-3 text-sm text-ink-soft">
									Forwarding message…
								</p>
							)}
							{destinations.items.map((conversation) => (
								<Button
									key={conversation.id}
									variant="ghost"
									onClick={() => void forwardTo(conversation.id)}
									disabled={sendingToId !== null}
									className="w-full justify-start px-3 py-2.5"
								>
									<ConversationAvatar
										conversation={conversation}
										currentUserId={currentUserId}
										onlineUserIds={new Set()}
										size="sm"
									/>
									<span className="flex min-w-0 flex-col items-start">
										<span className="max-w-full truncate">
											{getConversationTitle(conversation, currentUserId)}
										</span>
										<span className="meta max-w-full truncate text-ink-faint">
											{conversation.participants
												.filter((participant) => participant.id !== currentUserId)
												.map((participant) => `@${participant.handle}`)
												.join(", ") || "Your personal notes"}
										</span>
									</span>
									{conversation.isArchived && <span className="meta text-ink-faint">Archived</span>}
								</Button>
							))}
							{destinations.hasMore && !destinations.error && (
								<Button
									variant="ghost"
									onClick={destinations.loadMore}
									disabled={destinations.isLoading || sendingToId !== null}
									className="w-full"
								>
									Load more conversations
								</Button>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
