import type { ParticipantDTO } from "@chatty/shared-types";
import { Fragment } from "react";
import { cn } from "@/utils/cn";

const TOKEN_PATTERN = /(https?:\/\/[^\s<]+|@[a-z0-9_.-]+)/giu;
const TRAILING_PUNCTUATION = /[),.!?:;]+$/u;

interface MessageTextProps {
	content: string;
	mentionedUserIds?: string[];
	participants?: ParticipantDTO[];
	className?: string;
}

/** Cosmetic linkification only; the vault's durable URL extraction stays server-side. */
export function MessageText({ content, mentionedUserIds = [], participants = [], className }: MessageTextProps) {
	const mentionedHandles = new Map(
		participants
			.filter((participant) => mentionedUserIds.includes(participant.id))
			.map((participant) => [participant.handle.toLowerCase(), participant]),
	);
	const mentionedParticipants = mentionedUserIds.flatMap((userId) => {
		const participant = participants.find((candidate) => candidate.id === userId);

		return participant ? [participant] : [];
	});
	const renderedMentionIds = new Set<string>();
	const pieces = content.split(TOKEN_PATTERN);

	return (
		<p className={className}>
			{pieces.map((piece, index) => {
				if (/^https?:\/\//iu.test(piece)) {
					const punctuation = piece.match(TRAILING_PUNCTUATION)?.[0] ?? "";
					const url = punctuation ? piece.slice(0, -punctuation.length) : piece;

					return (
						<Fragment key={`${index}-${piece}`}>
							<a
								href={url}
								target="_blank"
								rel="noopener noreferrer nofollow"
								className="wrap-anywhere underline underline-offset-2"
							>
								{url}
							</a>
							{punctuation}
						</Fragment>
					);
				}

				const participant = piece.startsWith("@")
					? (mentionedHandles.get(piece.slice(1).toLowerCase()) ??
						mentionedParticipants.find((candidate) => !renderedMentionIds.has(candidate.id)))
					: undefined;
				if (participant) {
					renderedMentionIds.add(participant.id);

					return (
						<span
							key={`${index}-${piece}`}
							className={cn("rounded-badge px-0.5 font-semibold", "text-signal")}
						>
							@{participant.handle}
						</span>
					);
				}

				return <Fragment key={`${index}-${piece}`}>{piece}</Fragment>;
			})}
		</p>
	);
}
