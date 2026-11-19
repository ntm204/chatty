import type { ConversationDTO } from "@chatty/shared-types";
import { BellOff, Search, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { useConversationMuted } from "../../hooks/use-conversation-muted";
import { useConversationMutation } from "../../hooks/use-conversation-mutation";
import { ConversationActionError } from "../../components/conversation-action-error";
import { ConversationMuteMenu } from "../../components/conversation-mute-menu";

interface ConversationQuickActionsProps {
	conversation: ConversationDTO;
	onOpenSearch: () => void;
	/** Set in a group the person may add people to: Messenger's first circle, "Add". */
	onAddPeople?: (() => void) | undefined;
}

/** The round quick actions under the name, matching Messenger's row: Add (groups), Mute, Search. */
export function ConversationQuickActions({ conversation, onOpenSearch, onAddPeople }: ConversationQuickActionsProps) {
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
		<div className="flex flex-wrap justify-center gap-x-7 gap-y-3 px-5 pb-4">
			{onAddPeople && (
				<div className="flex flex-col items-center gap-1.5">
					<Button
						variant="ghost"
						onClick={onAddPeople}
						aria-label="Add members"
						className="size-10 rounded-full bg-paper-sunken p-0 hover:bg-paper"
					>
						<UserPlus className="size-[18px]" />
					</Button>
					<span className="text-[12px] text-ink-soft">Add</span>
				</div>
			)}
			<div ref={rootRef} className="relative flex flex-col items-center gap-1.5">
				<Button
					variant="ghost"
					onClick={() => setIsChoosingMute((current) => !current)}
					aria-label={isMuted ? "Turn notifications back on" : "Mute notifications"}
					aria-haspopup="menu"
					aria-expanded={isChoosingMute}
					aria-busy={isSaving}
					className={cn("size-10 rounded-full bg-paper-sunken p-0 hover:bg-paper", isMuted && "text-signal")}
				>
					<BellOff className="size-[18px]" />
				</Button>
				<span className="text-[12px] text-ink-soft">{isMuted ? "Unmute" : "Mute"}</span>

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
					className="size-10 rounded-full bg-paper-sunken p-0 hover:bg-paper"
				>
					<Search className="size-[18px]" />
				</Button>
				<span className="text-[12px] text-ink-soft">Search</span>
			</div>
			{error && !isChoosingMute && (
				<ConversationActionError error={error} onDismiss={clearError} className="basis-full" />
			)}
		</div>
	);
}
