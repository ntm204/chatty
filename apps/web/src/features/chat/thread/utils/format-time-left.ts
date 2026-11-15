/**
 * How long a disappearing message has left, as compactly as a gutter allows:
 * "6d", "23h", "45m", "<1m". Days and hours are rounded down, so the label never
 * promises more time than there is.
 */
export function formatTimeLeft(isoDeadline: string, now = Date.now()): string {
	const minutes = Math.floor((Date.parse(isoDeadline) - now) / 60_000);
	if (minutes >= 1440) return `${String(Math.floor(minutes / 1440))}d`;
	if (minutes >= 60) return `${String(Math.floor(minutes / 60))}h`;
	if (minutes >= 1) return `${String(minutes)}m`;

	return "<1m";
}
