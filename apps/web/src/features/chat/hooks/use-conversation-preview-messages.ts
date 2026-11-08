import type { MessageDTO } from "@chatty/shared-types";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { PREVIEW_MESSAGE_LIMIT } from "../constants/conversation-preview";

interface PreviewMessages {
	messages: MessageDTO[];
	isLoading: boolean;
	error: string;
}

/**
 * The recent messages of a conversation, read for a preview.
 *
 * Only reads. A conversation is marked read by `POST /read`, which only an
 * opened conversation sends (`useMarkRead`); fetching the history sends nothing
 * the other side can see, which is the whole point of previewing. Refetches
 * when a new message lands, so a preview left open stays current.
 */
export function useConversationPreviewMessages(
	conversationId: string,
	newestMessageId: string | null,
): PreviewMessages {
	const [state, setState] = useState<PreviewMessages>({ messages: [], isLoading: true, error: "" });

	useEffect(() => {
		let isCurrent = true;
		setState((current) => ({ ...current, isLoading: true, error: "" }));
		api.listMessages(conversationId, { limit: PREVIEW_MESSAGE_LIMIT })
			.then((newestFirst) => {
				if (isCurrent) setState({ messages: [...newestFirst].reverse(), isLoading: false, error: "" });
			})
			.catch((error: unknown) => {
				if (isCurrent)
					setState((current) => ({
						...current,
						isLoading: false,
						error: error instanceof Error ? error.message : "Could not load this chat",
					}));
			});

		return () => {
			isCurrent = false;
		};
	}, [conversationId, newestMessageId]);

	return state;
}
