interface MessageActionFeedbackProps {
	isPending: boolean;
	error: string | null;
	notice: string | null;
}

export function MessageActionFeedback({ isPending, error, notice }: MessageActionFeedbackProps) {
	return (
		<>
			{isPending && (
				<p role="status" className="meta mt-1 text-ink-soft">
					Updating message…
				</p>
			)}
			{error && (
				<p role="alert" className="mt-1 max-w-sm text-xs text-signal">
					{error}
				</p>
			)}
			{notice && (
				<p role="status" className="meta mt-1 text-ink-soft">
					{notice}
				</p>
			)}
		</>
	);
}
