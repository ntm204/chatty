import { useCallback, useEffect, useRef, useState } from "react";
import { useMotionPresence } from "./use-motion-presence";

/** For conditionally mounted surfaces: defer navigation or removal until after exit. */
export function useAnimatedDismiss(onClose: () => void) {
	const [isOpen, setIsOpen] = useState(true);
	const completionRef = useRef(onClose);
	const isClosingRef = useRef(false);
	const { isPresent, motionState } = useMotionPresence(isOpen);
	const dismiss = useCallback((afterClose?: () => void) => {
		if (isClosingRef.current) return;
		isClosingRef.current = true;
		if (afterClose) completionRef.current = afterClose;
		setIsOpen(false);
	}, []);

	useEffect(() => {
		if (!isClosingRef.current) completionRef.current = onClose;
	}, [onClose]);

	useEffect(() => {
		if (!isPresent) completionRef.current();
	}, [isPresent]);

	return { motionState, dismiss, isOpen };
}
