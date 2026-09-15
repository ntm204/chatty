import type { MessageDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef } from "react";

interface UseComposerStickerSendOptions {
	isDisabled: boolean;
	replyTo: MessageDTO | null;
	onSend: (stickerId: string, replyTo: MessageDTO | null) => Promise<void>;
	onCancelReply: () => void;
	stopTyping: () => void;
}

export function useComposerStickerSend(options: UseComposerStickerSendOptions) {
	const isMountedRef = useRef(true);
	useEffect(() => {
		isMountedRef.current = true;

		return () => {
			isMountedRef.current = false;
		};
	}, []);
	const optionsRef = useRef(options);
	optionsRef.current = options;

	return useCallback(async (stickerId: string) => {
		const started = optionsRef.current;
		if (started.isDisabled) throw new Error("Sending is currently unavailable.");
		started.stopTyping();
		await started.onSend(stickerId, started.replyTo);
		// A different reply selected during upload belongs to the next message.
		if (isMountedRef.current && optionsRef.current.replyTo?.id === started.replyTo?.id) started.onCancelReply();
	}, []);
}
