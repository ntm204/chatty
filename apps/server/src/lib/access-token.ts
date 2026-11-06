import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ATTACHMENT_TOKEN_TYPE } from "./attachment-token.js";
import { UnauthorizedError } from "./errors.js";
import { prisma } from "./prisma.js";

/**
 * The single place an access token is checked.
 *
 * There are two transports — `requireAuth` for HTTP and the handshake in
 * `sockets/index.ts` — and until this file existed each verified the token
 * itself. The comments in both said "keep these in sync", and they had already
 * drifted: phase 4 added a guard against attachment tokens to the HTTP path and
 * not to the socket, so a capability token for an image could open a WebSocket
 * as a "user" whose id was an attachment id. One function cannot drift from
 * itself.
 */

export interface JwtPayload {
	sub: string; // user id
	/** Seconds since the epoch, added by `jwt.sign`. */
	iat?: number;
	/** Seconds since the epoch, added by `jwt.sign` from `expiresIn`. */
	exp?: number;
	/** Present only on attachment tokens — see lib/attachment-token.ts. */
	typ?: string;
}

/**
 * Returns the user id a token proves, or throws.
 *
 * Asynchronous because of the last check: a token issued before its owner last
 * changed their password is refused, and only the database knows when that was.
 * That costs one indexed primary-key lookup per authenticated request, which is
 * the price of a password change actually ending the sessions it should. Every
 * authenticated route in this app already queries at least once.
 */
export async function verifyAccessToken(token: string): Promise<string> {
	let payload: JwtPayload;
	try {
		payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
	} catch {
		throw new UnauthorizedError("Invalid or expired token");
	}

	// Attachment URLs carry a token signed with the same secret whose `sub` is an
	// attachment id. Without this it would authenticate as a user who does not
	// exist, and every query downstream would run for them.
	if (payload.typ === ATTACHMENT_TOKEN_TYPE) {
		throw new UnauthorizedError("Invalid or expired token");
	}

	const user = await prisma.user.findUnique({
		where: { id: payload.sub },
		select: { passwordChangedAt: true },
	});

	// The row can be gone even though the signature is good — the account was
	// deleted after the token was issued.
	if (!user) throw new UnauthorizedError("Invalid or expired token");

	if (user.passwordChangedAt && isIssuedBefore(payload.iat, user.passwordChangedAt)) {
		throw new UnauthorizedError("Invalid or expired token");
	}

	return payload.sub;
}

/**
 * Whether a token predates the password change that should have ended it.
 *
 * `iat` is whole seconds; `passwordChangedAt` has milliseconds. Comparing them
 * directly would reject the token handed back by the very request that changed
 * the password — issued at second N, against a change at N.4 seconds. Truncating
 * the change to its second fixes that, at the cost of a token issued earlier in
 * the same second surviving. One second is a smaller problem than signing a user
 * out of the tab they are looking at.
 */
function isIssuedBefore(issuedAtSeconds: number | undefined, passwordChangedAt: Date): boolean {
	// A token with no `iat` cannot be placed in time, so it cannot be shown to be
	// current either. Nothing this app signs omits it.
	if (issuedAtSeconds === undefined) return true;

	return issuedAtSeconds < Math.floor(passwordChangedAt.getTime() / 1000);
}
