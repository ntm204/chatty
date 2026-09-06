import { useEffect, useState } from "react";
import { MOTION_DURATION } from "@/constants/motion";

/** Retain a closing surface until its exit finishes; reopening cancels removal. */
export function useMotionPresence(isOpen: boolean) {
	const [isRetained, setIsRetained] = useState(isOpen);

	useEffect(() => {
		if (isOpen) {
			setIsRetained(true);

			return;
		}
		const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
		if (preference?.matches) {
			setIsRetained(false);

			return;
		}
		const timer = window.setTimeout(() => setIsRetained(false), MOTION_DURATION);
		const finishIfReduced = () => {
			if (preference?.matches) setIsRetained(false);
		};
		preference?.addEventListener("change", finishIfReduced);

		return () => {
			window.clearTimeout(timer);
			preference?.removeEventListener("change", finishIfReduced);
		};
	}, [isOpen]);

	return { isPresent: isOpen || isRetained, motionState: isOpen ? "open" : "closed" };
}
