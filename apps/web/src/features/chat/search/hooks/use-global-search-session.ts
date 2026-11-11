import { useCallback, useRef, useState } from "react";
import { useMessageSearch } from "./use-message-search";

/** Keep results and their scroll position while the reader opens a matching message. */
export function useGlobalSearchSession() {
	const search = useMessageSearch();
	const scrollPosition = useRef({ query: "", top: 0 });
	const [isOpen, setIsOpen] = useState(false);
	const [conversationId, selectConversation] = useState<string | null>(null);
	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);

	return { search, scrollPosition, isOpen, open, close, conversationId, selectConversation };
}
