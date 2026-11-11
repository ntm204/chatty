import { EmptyState } from "@/components/empty-state";
import { MessageSkeleton } from "./message-skeleton";

interface EmptyThreadProps {
	isLoading: boolean;
}

/** A thread with nothing to show: bubble placeholders while it loads, then an invitation to say hello. */
export function EmptyThread({ isLoading }: EmptyThreadProps) {
	if (isLoading) return <MessageSkeleton />;

	return (
		<EmptyState
			title="No messages yet"
			description="Say hello — your first message starts the conversation."
			className="wallpaper-pill my-8 rounded-3xl py-5"
		/>
	);
}
