import { useEffect, useState } from "react";

/** True only once `flag` has stayed true for `delayMs`; false again the moment it drops. */
export function useDelayedFlag(flag: boolean, delayMs: number): boolean {
	const [isLate, setIsLate] = useState(false);

	useEffect(() => {
		if (!flag) {
			setIsLate(false);

			return;
		}
		const timer = window.setTimeout(() => setIsLate(true), delayMs);

		return () => window.clearTimeout(timer);
	}, [flag, delayMs]);

	return flag && isLate;
}
