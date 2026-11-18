/** "On" or "Off", the way a privacy row states a switch. */
export function onOffLabel(isOn: boolean): string {
	return isOn ? "On" : "Off";
}

/** "None", "1 person", "3 people" — or nothing while the count is unknown, rather than a wrong number. */
export function peopleCountLabel(count: number | null): string | undefined {
	if (count === null) return undefined;

	return count === 0 ? "None" : `${count} ${count === 1 ? "person" : "people"}`;
}
