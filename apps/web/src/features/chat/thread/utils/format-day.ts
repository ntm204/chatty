/**
 * The label on the rule that separates one day of a conversation from the next.
 *
 * "Today" and "Yesterday" rather than the date, because those are the two days
 * anybody reading a chat is actually oriented by. The year is dropped inside the
 * current one — "23 August" is unambiguous in a thread you are scrolling
 * through, and "23 August 2026" beside every fortnight-old message is noise.
 *
 * This is why `formatMessageTime` no longer carries a date of its own: the day
 * is stated once, on the rule, instead of on every bubble underneath it.
 */
export function formatDayLabel(isoTimestamp: string): string {
	const date = new Date(isoTimestamp);
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	if (date.toDateString() === today.toDateString()) return "Today";
	if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

	const options: Intl.DateTimeFormatOptions =
		date.getFullYear() === today.getFullYear()
			? { day: "numeric", month: "long" }
			: { day: "numeric", month: "long", year: "numeric" };

	return date.toLocaleDateString(undefined, options);
}

/** Whether two timestamps fall on different calendar days in the reader's zone. */
export function isNewDay(isoTimestamp: string, previousIsoTimestamp: string | undefined): boolean {
	if (!previousIsoTimestamp) return true;

	return new Date(isoTimestamp).toDateString() !== new Date(previousIsoTimestamp).toDateString();
}
