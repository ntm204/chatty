import { useEffect, useState } from "react";

/**
 * True while the page is hidden or the window has lost focus.
 *
 * An opened protected message covers itself then. It is not screenshot
 * protection — a browser cannot provide that, and the viewer says so — but it
 * keeps the content off the screen while the reader is elsewhere: switching
 * apps, a notification pulled down, a capture tool that takes focus, the app
 * switcher's thumbnail.
 */
export function useConcealedWhenAway(): boolean {
	const [isConcealed, setIsConcealed] = useState(() => document.visibilityState === "hidden" || !document.hasFocus());

	useEffect(() => {
		const update = () => setIsConcealed(document.visibilityState === "hidden" || !document.hasFocus());
		document.addEventListener("visibilitychange", update);
		window.addEventListener("blur", update);
		window.addEventListener("focus", update);

		return () => {
			document.removeEventListener("visibilitychange", update);
			window.removeEventListener("blur", update);
			window.removeEventListener("focus", update);
		};
	}, []);

	return isConcealed;
}
