import type { ParticipantDTO } from "@chatty/shared-types";

export function getMentionedUserIds(content: string, participants: ParticipantDTO[]): string[] {
	return participants
		.filter((participant) =>
			new RegExp(`(^|\\s)@${participant.handle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?=\\s|$)`, "iu").test(
				content,
			),
		)
		.map((participant) => participant.id);
}
