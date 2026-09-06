interface UnreadDividerProps {
	count: number;
}

export function UnreadDivider({ count }: UnreadDividerProps) {
	return (
		<div className="my-4 flex justify-center">
			<span className="eyebrow rounded-full bg-signal-soft px-3 py-1 text-signal">
				{count} new {count === 1 ? "message" : "messages"}
			</span>
		</div>
	);
}
