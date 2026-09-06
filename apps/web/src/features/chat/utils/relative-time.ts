/**
 * A single relative unit that only ever gets coarser as it ages — minutes,
 * then hours, then days, then weeks, then years. Never a clock time or a
 * weekday name. Used for sidebar rows and the "Sent"/"Seen" caption under the
 * newest message.
 */
export function formatRelativeTime(isoTimestamp: string): string {
	const elapsedMs = Date.now() - new Date(isoTimestamp).getTime();
	const elapsedMinutes = Math.floor(elapsedMs / 60_000);

	if (elapsedMinutes < 1) return "now";
	if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

	const elapsedHours = Math.floor(elapsedMinutes / 60);
	if (elapsedHours < 24) return `${elapsedHours}h`;

	const elapsedDays = Math.floor(elapsedHours / 24);
	if (elapsedDays < 7) return `${elapsedDays}d`;

	const elapsedWeeks = Math.floor(elapsedDays / 7);
	if (elapsedWeeks < 52) return `${elapsedWeeks}w`;

	return `${Math.floor(elapsedDays / 365)}y`;
}
