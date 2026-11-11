/**
 * How long an author still has to edit or unsend a message.
 *
 * Shown in the actions menu because the alternative is what shipped first: the
 * two controls simply stop being there one day, which reads as a bug rather
 * than as a rule. Null once the deadline has passed — there is nothing left to
 * count down to, and the actions are gone with it.
 *
 * Derived from the server's own `authorActionExpiresAt` rather than from a copy
 * of the eight-hour window on this side, so the client cannot disagree with the
 * deadline that will actually be enforced.
 */
export function formatRemaining(isoDeadline: string | null): string | null {
	if (!isoDeadline) return null;

	const remainingMs = Date.parse(isoDeadline) - Date.now();
	if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;

	const totalMinutes = Math.floor(remainingMs / 60_000);
	const hours = Math.floor(totalMinutes / 60);

	if (hours > 0) return `${hours}h ${totalMinutes % 60}m left`;
	if (totalMinutes > 0) return `${totalMinutes}m left`;

	return "under a minute left";
}
