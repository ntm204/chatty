import type { ConversationDTO } from "@chatty/shared-types";
import { BellOff, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { useConversationMuted } from "../hooks/use-conversation-muted";
import { useConversationMutation } from "../hooks/use-conversation-mutation";
import { ConversationActionError } from "./conversation-action-error";
import { ConversationMuteMenu } from "./conversation-mute-menu";

interface ConversationQuickActionsProps {
	conversation: ConversationDTO;
	onOpenSearch: () => void;
}

/** The two icon-button quick actions at the top of the details panel, matching Messenger's row. */
export function ConversationQuickActions({ conversation, onOpenSearch }: ConversationQuickActionsProps) {
	const [isChoosingMute, setIsChoosingMute] = useState(false);
	const { isSaving, error, clearError, run } = useConversationMutation(conversation.id);
	const rootRef = useRef<HTMLDivElement>(null);
	const isMuted = useConversationMuted(conversation.mutedUntil);

	useEffect(() => setIsChoosingMute(false), [conversation.id]);

	useEffect(() => {
		if (!isChoosingMute) return;
		function closeFromOutside(event: PointerEvent) {
			if (!rootRef.current?.contains(event.target as Node)) setIsChoosingMute(false);
		}
		document.addEventListener("pointerdown", closeFromOutside);

		return () => document.removeEventListener("pointerdown", closeFromOutside);
	}, [isChoosingMute]);

	async function apply(action: () => Promise<unknown>): Promise<void> {
		if (await run(action)) setIsChoosingMute(false);
	}

	function muteFor(milliseconds: number | null): void {
		const until =
			milliseconds === null ? "9999-12-31T23:59:59.999Z" : new Date(Date.now() + milliseconds).toISOString();
		void apply(() => api.setConversationMuted(conversation.id, until));
	}

	return (
		<div className="flex flex-wrap justify-center gap-x-8 gap-y-3 border-b border-rule px-5 py-4">
			<div ref={rootRef} className="relative flex flex-col items-center gap-1.5">
				<Button
					variant="ghost"
					onClick={() => setIsChoosingMute((current) => !current)}
					aria-label={isMuted ? "Turn notifications back on" : "Mute notifications"}
					aria-haspopup="menu"
					aria-expanded={isChoosingMute}
					aria-busy={isSaving}
					className={cn("size-11 rounded-full border border-rule p-0", isMuted && "text-signal")}
				>
					<BellOff className="size-4" />
				</Button>
				<span className="eyebrow text-ink-faint">{isMuted ? "Turn back on" : "Mute"}</span>

				{isChoosingMute && (
					<div
						role="menu"
						aria-label="Mute duration"
						aria-busy={isSaving}
						className="absolute top-full z-30 mt-2 w-52 rounded-panel border border-rule bg-paper-raised p-1.5 shadow-lift"
					>
						<ConversationMuteMenu
							isMuted={isMuted}
							isSaving={isSaving}
							onBack={() => setIsChoosingMute(false)}
							onUnmute={() => void apply(() => api.setConversationMuted(conversation.id, null))}
							onMuteFor={muteFor}
						/>
						{error && <ConversationActionError error={error} onDismiss={clearError} />}
					</div>
				)}
			</div>

			<div className="flex flex-col items-center gap-1.5">
				<Button
					variant="ghost"
					onClick={onOpenSearch}
					aria-label="Search in conversation"
					className="size-11 rounded-full border border-rule p-0"
				>
					<Search className="size-4" />
				</Button>
				<span className="eyebrow text-ink-faint">Search</span>
			</div>
			{error && !isChoosingMute && (
				<ConversationActionError error={error} onDismiss={clearError} className="basis-full" />
			)}
		</div>
	);
}
