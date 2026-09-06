import type { ParticipantDTO } from "@chatty/shared-types";

/**
 * How this conversation labels one of its members, preferring a shared
 * nickname (see ADR 0022) over their real name. Falls back to `user.displayName`
 * when the person isn't (or is no longer) a participant here — a departed
 * author's message keeps whatever name it already carries.
 */
export function resolveDisplayName(participants: ParticipantDTO[], user: { id: string; displayName: string }): string {
	const participant = participants.find((candidate) => candidate.id === user.id);

	return participant?.nickname ?? user.displayName;
}
