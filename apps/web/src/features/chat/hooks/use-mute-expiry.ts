import { useEffect, useState } from "react";

/** One timer for the next deadline, so lists and title counts also recover after a mute ends. */
export function useMuteExpiry(mutedUntil: readonly (string | null)[]): void {
	const [, refresh] = useState(0);
	const now = Date.now();
	const nextExpiry = mutedUntil.reduce((next, until) => {
		const deadline = until ? Date.parse(until) : 0;

		return deadline > now ? Math.min(next, deadline) : next;
	}, Infinity);

	useEffect(() => {
		if (!Number.isFinite(nextExpiry)) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		function schedule() {
			clearTimeout(timer);
			const remaining = nextExpiry - Date.now();
			// Browsers overflow delays above a signed 32-bit integer (including Forever).
			if (remaining > 0) timer = setTimeout(refreshAndSchedule, Math.min(remaining, 2_147_483_647));
		}
		function refreshAndSchedule() {
			refresh((revision) => revision + 1);
			schedule();
		}
		if (nextExpiry <= Date.now()) refreshAndSchedule();
		else schedule();
		window.addEventListener("focus", refreshAndSchedule);
		document.addEventListener("visibilitychange", refreshAndSchedule);

		return () => {
			clearTimeout(timer);
			window.removeEventListener("focus", refreshAndSchedule);
			document.removeEventListener("visibilitychange", refreshAndSchedule);
		};
	}, [nextExpiry]);
}
