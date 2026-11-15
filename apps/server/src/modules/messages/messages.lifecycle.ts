/**
 * When a message stops existing: the rules shared by sending, reading and the
 * expiry sweep. See ADR 0023.
 */
import { PROTECTED_MESSAGE_LIFETIME_SECONDS } from "@chatty/shared-types";
import type { Prisma } from "@prisma/client";

/**
 * Leaves out messages whose `expiresAt` has passed.
 *
 * Every read path applies this rather than trusting the sweep, because the sweep
 * runs on a timer: without it a message would outlive its promised lifetime by
 * up to one sweep interval, in a history page or a search result, which is the
 * exact moment somebody relying on it would notice.
 */
export function unexpiredMessageWhere(now = new Date()): Prisma.MessageWhereInput {
	return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

export function hasExpired(expiresAt: Date | null, now = new Date()): boolean {
	return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

/**
 * The instant a message being written now will disappear, or null to keep it.
 *
 * The conversation's timer and a protected message's own lifetime both apply,
 * and the sooner wins: protecting a message can only make it last less long
 * than the chat would have kept it, never longer.
 */
export function computeExpiresAt(createdAt: Date, timerSeconds: number | null, isProtected: boolean): Date | null {
	const lifetimes = [
		...(timerSeconds === null ? [] : [timerSeconds]),
		...(isProtected ? [PROTECTED_MESSAGE_LIFETIME_SECONDS] : []),
	];
	if (lifetimes.length === 0) return null;

	return new Date(createdAt.getTime() + Math.min(...lifetimes) * 1000);
}
