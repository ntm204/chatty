import type { ConversationDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { isOnLayerEntry } from "@/hooks/use-back-dismiss";
import type { ConversationRouteState } from "../types/conversation-route";

interface UseConversationRouteOptions {
	conversations: ConversationDTO[];
	isListLoading: boolean;
	openedConversation: ConversationDTO | null;
	setOpenedConversation: (conversation: ConversationDTO | null) => void;
}

interface ConversationRoute {
	selectedConversationId: string | null;
	selectConversation: (conversationId: string | null) => void;
	/** The thread's own back arrow: return to the list the reader came from, or to it fresh. */
	leaveConversation: () => void;
	/** Set when a link or reload named a conversation this account cannot open. */
	isUnavailable: boolean;
}

/**
 * The open conversation lives in the URL (`/chat/:conversationId`).
 *
 * It used to be component state, so the browser's Back — or a phone's back
 * gesture — left the app from inside a thread, a reload dropped the reader on
 * the welcome screen, and no conversation could be linked to. Now each opened
 * thread is a history entry, Back returns to the previous one or the list, and
 * reload or a pasted link opens the same thread.
 *
 * `/profile` draws the chat under the settings dialog; it carries the thread in
 * router state so the chat behind the dialog stays where it was.
 */
export function useConversationRoute({
	conversations,
	isListLoading,
	openedConversation,
	setOpenedConversation,
}: UseConversationRouteOptions): ConversationRoute {
	const { conversationId } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const state = (location.state as ConversationRouteState | null) ?? null;
	const isChatPath = location.pathname.startsWith("/chat");
	const selectedConversationId = isChatPath ? (conversationId ?? null) : (state?.conversationId ?? null);
	const resolvingRef = useRef<string | null>(null);

	// Reads the live address, not the render's `location`: memoised rows can hold an
	// older copy of this callback, and comparing against the path from that render
	// made a click on a thread the reader had visited before do nothing.
	const selectConversation = useCallback(
		(nextId: string | null) => {
			const currentPath = window.location.pathname;
			const target = nextId ? `/chat/${encodeURIComponent(nextId)}` : "/chat";
			if (currentPath === target) return;
			navigate(target, {
				// A layer's own history entry is replaced, so Back does not land on a closed panel.
				replace: isOnLayerEntry(),
				state: { isFromList: currentPath === "/chat" } satisfies ConversationRouteState,
			});
		},
		[navigate],
	);

	const leaveConversation = useCallback(() => {
		if (state?.isFromList) navigate(-1);
		else navigate("/chat", { replace: true });
	}, [navigate, state?.isFromList]);

	// A thread named by the URL but not in the loaded sidebar page — a reload of an
	// archived or older conversation, or a pasted link — is fetched on its own.
	const isKnown =
		!selectedConversationId ||
		conversations.some((conversation) => conversation.id === selectedConversationId) ||
		openedConversation?.id === selectedConversationId;
	useEffect(() => {
		if (isKnown || isListLoading || !selectedConversationId) return;
		if (resolvingRef.current === selectedConversationId) return;
		const requested = selectedConversationId;
		resolvingRef.current = requested;
		api.getConversation(requested)
			.then((conversation) => {
				if (resolvingRef.current === requested) setOpenedConversation(conversation);
			})
			.catch(() => {
				if (resolvingRef.current !== requested) return;
				navigate("/chat", { replace: true, state: { isUnavailable: true } satisfies ConversationRouteState });
			})
			.finally(() => {
				if (resolvingRef.current === requested) resolvingRef.current = null;
			});
	}, [isKnown, isListLoading, navigate, selectedConversationId, setOpenedConversation]);

	return {
		selectedConversationId,
		selectConversation,
		leaveConversation,
		isUnavailable: isChatPath && !conversationId && Boolean(state?.isUnavailable),
	};
}
