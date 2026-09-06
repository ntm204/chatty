import { formatDayLabel } from "../utils";

interface DaySeparatorProps {
	/** The timestamp of the first message of the day this rule opens. */
	isoTimestamp: string;
}

/** The centered pill that names the day the messages under it were sent. */
export function DaySeparator({ isoTimestamp }: DaySeparatorProps) {
	return (
		<div className="flex justify-center pt-7 first:pt-0">
			<span className="eyebrow rounded-full bg-paper-sunken px-3 py-1 text-ink-faint">
				{formatDayLabel(isoTimestamp)}
			</span>
		</div>
	);
}
