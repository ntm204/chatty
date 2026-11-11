interface UnreadDividerProps {
	count: number;
}

export function UnreadDivider({ count }: UnreadDividerProps) {
	return (
		<div data-unread-divider className="my-4 flex scroll-mt-16 justify-center">
			<span className="eyebrow rounded-full bg-signal-soft px-3 py-1 text-signal">
				{count} new {count === 1 ? "message" : "messages"}
			</span>
		</div>
	);
}
