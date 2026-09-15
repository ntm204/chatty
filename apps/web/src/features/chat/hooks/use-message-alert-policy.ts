import type { ConversationDTO, MessageDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef } from "react";
import { useSocketEvent } from "./use-socket-event";
import { canAlertForMessage } from "../utils/message-alert-policy";

export function useMessageAlertPolicy(userId: string, conversations: ConversationDTO[]) {
	const conversationsRef = useRef(conversations);
	conversationsRef.current = conversations;
	const isMountedRef = useRef(true);
	const revisionRef = useRef(0);
	const invalidate = useCallback(() => {
		revisionRef.current += 1;
	}, []);
	useSocketEvent("conversation:self-updated", invalidate);
	useSocketEvent("conversation:left", invalidate);
	useEffect(() => {
		isMountedRef.current = true;

		return () => {
			isMountedRef.current = false;
		};
	}, []);

	return useCallback(
		async (message: MessageDTO) => {
			const revision = revisionRef.current;
			const canAlert = await canAlertForMessage(userId, message, () =>
				conversationsRef.current.find((conversation) => conversation.id === message.conversationId),
			);

			return isMountedRef.current && revision === revisionRef.current && canAlert;
		},
		[userId],
	);
}
