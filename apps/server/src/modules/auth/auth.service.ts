import { createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
// A value import, not `import type`: `confirmEmailChange` matches on
// `Prisma.PrismaClientKnownRequestError` at runtime to turn a unique-violation
// into a 409 rather than a 500.
import { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import type { JwtPayload } from "../../lib/access-token.js";
import { ConflictError, UnauthorizedError, ValidationError } from "../../lib/errors.js";
import { buildEmailChangeUrl, buildPasswordResetUrl } from "../../lib/mailer.js";
import { enqueueMail } from "../../lib/outbox.js";
import { prisma } from "../../lib/prisma.js";
import { issueRefreshToken, revokeAllRefreshTokens, revokeRefreshToken, rotateRefreshToken } from "./auth.sessions.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import type {
	ChangePasswordInput,
	ConfirmEmailChangeInput,
	LoginInput,
	RegisterInput,
	RequestEmailChangeInput,
	RequestPasswordResetInput,
	ResetPasswordInput,
} from "./auth.schema.js";

/**
 * What `register` and `login` hand back internally. Not the shared `AuthResponse`
 * any more: `refreshToken` here is exactly what the controller needs to set the
 * `Set-Cookie` header, and it must never reach `res.json()` — see `AuthResponse`'s
 * own comment for why a response body is the wrong place for it.
 */
export interface AuthResult {
	token: string;
	refreshToken: string;
	user: { id: string; email: string; handle: string; displayName: string };
}

/**
 * Cost factor for bcrypt. Each +1 doubles the time to hash, which is the point:
 * slow hashing is what makes offline brute-forcing a stolen database impractical.
 * Do not drop below 10 — outside the test suite, which hashes hundreds of
 * throwaway passwords and only checks that hashing and comparing agree; at the
 * minimum cost (4) the suite no longer spends most of its time in bcrypt.
 */
const PASSWORD_HASH_ROUNDS = env.NODE_ENV === "test" ? 4 : 12;

/**
 * A valid bcrypt hash of a random throwaway string — no password can ever match it.
 *
 * `login` compares against this when the email does not exist, so that a request for
 * an unknown email takes the same ~300ms as one for a known email with a wrong
 * password. Without it, an attacker can tell registered emails apart from unregistered
 * ones just by timing the responses, which defeats the point of returning an identical
 * error message for both cases.
 */
const DUMMY_PASSWORD_HASH = "$2b$12$BdIK5mgDr8tlgbVgbzNmmuH05p8K0StmWZesMIqpepw.d2ZtK3hdi";

/**
 * The fields safe to return to a client. `passwordHash` is deliberately absent:
 * selecting it and deleting it later leaves it one careless `res.json(user)` away
 * from being leaked.
 */
const PUBLIC_USER_FIELDS = { id: true, email: true, handle: true, displayName: true } as const;

/**
 * How long an access token is good for.
 *
 * Fifteen minutes, down from seven days. The number is short because nothing
 * can revoke this token — it is a JWT, so it is valid because it says so, and
 * the only thing that limits the damage of a copied one is how soon it expires.
 * The session itself is the refresh token, which is a row and can be ended; see
 * `auth.sessions.ts`.
 *
 * Not shorter, because every expiry costs the client a round trip and the
 * socket a reconnect, and a minute-long token would spend more time refreshing
 * than working.
 */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Signs the access token. The payload shape is read by BOTH `requireAuth`
 * (HTTP) and the Socket.io handshake in `sockets/index.ts` — changing `sub`
 * here without changing those two breaks authentication on both transports.
 */
function signAccessToken(userId: string): string {
	const payload: JwtPayload = { sub: userId };

	return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

/**
 * Creates an account and returns a token for it.
 *
 * Note this endpoint necessarily reveals whether an email is already registered —
 * a user who cannot be told "that email is taken" cannot recover from the error.
 * That is an accepted trade-off, not an oversight. The mitigation is the volume
 * cap in middlewares/rate-limit.ts (applied in auth.routes.ts), not vaguer errors.
 * `login` has no such excuse and stays opaque.
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
	// Both uniques are checked in one query so the caller learns about a taken
	// handle and a taken email in the same round trip, rather than fixing one
	// and being told about the other.
	const conflicts = await prisma.user.findMany({
		where: { OR: [{ email: input.email }, { handle: input.handle }] },
		select: { email: true, handle: true },
	});

	if (conflicts.some((existing) => existing.email === input.email)) {
		throw new ConflictError("Email already registered");
	}

	if (conflicts.some((existing) => existing.handle === input.handle)) {
		throw new ConflictError("Handle already taken");
	}

	const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);

	const user = await prisma.user.create({
		data: {
			email: input.email,
			// Already lowercased by handleSchema; the database index is
			// case-sensitive, so an un-normalised value here would let "Minh" and
			// "minh" both exist.
			handle: input.handle,
			displayName: input.displayName,
			passwordHash,
		},
		select: PUBLIC_USER_FIELDS,
	});

	return { token: signAccessToken(user.id), refreshToken: await issueRefreshToken(user.id), user };
}

/**
 * Verifies credentials and returns a token.
 *
 * Both failure modes — unknown email, wrong password — produce the identical
 * error, and take the same amount of time (see DUMMY_PASSWORD_HASH). Telling
 * them apart is what lets an attacker enumerate which emails have accounts.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
	const user = await prisma.user.findUnique({
		where: { email: input.email },
		select: { ...PUBLIC_USER_FIELDS, passwordHash: true },
	});

	// Always run a comparison, even with no user, to keep the timing constant.
	const isPasswordCorrect = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

	if (!user || !isPasswordCorrect) throw new UnauthorizedError("Invalid email or password");

	// Built explicitly rather than by stripping `passwordHash` off `user`: an
	// allow-list cannot leak a field that gets added to the model later.
	return {
		token: signAccessToken(user.id),
		refreshToken: await issueRefreshToken(user.id),
		user: { id: user.id, email: user.email, handle: user.handle, displayName: user.displayName },
	};
}

/**
 * How long a reset link lives. Long enough to survive a slow inbox, short
 * enough that a link left in a mailbox is not a standing key to the account.
 */
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * The earliest a reset request may answer.
 *
 * An unknown email used to return after one lookup while a known one performed
 * three writes and sent mail. Status and copy were identical, but averaging
 * response times still answered the question the endpoint is meant to hide.
 * The rate limiter caps the cost of holding these requests open.
 */
const PASSWORD_RESET_RESPONSE_FLOOR_MS = 300;

/**
 * SHA-256, not bcrypt, and the difference is deliberate.
 *
 * bcrypt is slow on purpose because a password is low-entropy and guessable.
 * A mailed token is 32 bytes from `randomBytes` — guessing it is already out of
 * reach, so the hash only needs to stop a leaked database from handing over
 * working links. bcrypt would also silently truncate at 72 bytes.
 *
 * Shared by password reset and email change, because they are the same kind of
 * secret with the same threat model. Two copies would be two places to get the
 * algorithm right.
 */
function hashOneTimeToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/**
 * Throws unless `password` is this account's current one.
 *
 * Exported for the one operation that lives outside this module and still has to
 * ask — deleting the account, which belongs with the rest of `/users/me`. The
 * check has one home for the same reason hashing does: "how do we know it is
 * really them" is not a question two modules should answer separately.
 *
 * Constant-time comparison is bcrypt's own; there is no timing signal to protect
 * here anyway, since the caller has already proved they hold a token for this
 * exact account.
 */
export async function assertPasswordMatches(userId: string, password: string): Promise<void> {
	const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });

	// Reachable only if the account was deleted between the token being issued
	// and this request.
	if (!user) throw new UnauthorizedError("Invalid or expired token");

	const isCorrect = await bcrypt.compare(password, user.passwordHash);
	if (!isCorrect) throw new UnauthorizedError("Current password is incorrect");
}

async function waitForPasswordResetResponseFloor(startedAt: number): Promise<void> {
	const remainingMs = PASSWORD_RESET_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
	if (remainingMs > 0) await delay(remainingMs);
}

/**
 * Records the reset mail, in the transaction that mints the token.
 *
 * The transaction argument is the whole point. Delivery still must not sit on
 * the request path — a slow or failing provider only runs for a real account, so
 * awaiting it would turn latency or a 500 into an account-enumeration oracle —
 * but the old answer to that was `void promise.catch(log)`, which bought the
 * timing property by giving up on the mail entirely. A crash between the commit
 * and the send left a live token whose owner was never told, which reads to them
 * as a reset that silently did nothing.
 *
 * Writing the row here makes "this link is live" and "we owe this person the
 * link" one commit, and hands the sending to the outbox worker, which retries.
 * The request path gains one local INSERT and never waits on a network.
 */
async function enqueuePasswordResetMail(
	transaction: Prisma.TransactionClient,
	recipient: string,
	token: string,
): Promise<void> {
	await enqueueMail(transaction, {
		to: recipient,
		subject: "Reset your Chatty password",
		body: [
			"Someone asked to reset the password on your Chatty account.",
			"",
			`Open this link within the hour to choose a new one:`,
			buildPasswordResetUrl(token),
			"",
			"If it was not you, nothing has changed and you can ignore this.",
		].join("\n"),
	});
}

/**
 * Marks every token this user holds as spent, and pushes their live sockets off.
 *
 * The token check in `lib/access-token.ts` refuses anything issued before
 * `passwordChangedAt`, which covers every future request. It does not cover a
 * WebSocket that authenticated an hour ago and has been open ever since — that
 * connection is already past the gate, so it has to be closed explicitly.
 */
function endSessions(userId: string): void {
	getIO().in(userRoom(userId)).disconnectSockets(true);
}

/**
 * Replaces the signed-in user's password, given the current one.
 *
 * Lives in the auth module rather than with the rest of the profile, because
 * this is the only other place that may hash a password. `PASSWORD_HASH_ROUNDS`
 * and the bcrypt call have one home; a second copy in the users service is how
 * the cost factor ends up different in two places.
 *
 * Unlike `login`, the failure message here is specific. Vague errors exist to
 * stop an attacker learning which emails have accounts, and the caller has
 * already proved they hold this account's token — there is nothing left to
 * enumerate, and "incorrect" is what a user needs to know to try again.
 *
 * **Every session ends, including the caller's**, which is why a fresh token
 * comes back. `passwordChangedAt` moves, so every token issued before now is
 * refused on its next request, and live sockets are disconnected. The caller
 * would be signed out of the tab they are looking at if they were not handed a
 * replacement; every other device is not, which is the entire point.
 */
export async function changePassword(
	userId: string,
	input: ChangePasswordInput,
): Promise<{ token: string; refreshToken: string }> {
	const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });

	// Reachable only if the account was deleted between the token being issued
	// and this request.
	if (!user) throw new UnauthorizedError("Invalid or expired token");

	const isCurrentPasswordCorrect = await bcrypt.compare(input.currentPassword, user.passwordHash);
	if (!isCurrentPasswordCorrect) throw new UnauthorizedError("Current password is incorrect");

	// Checked against the stored hash rather than against `currentPassword`, so
	// it still holds if the two were sent with different surrounding whitespace.
	const isSamePassword = await bcrypt.compare(input.newPassword, user.passwordHash);
	if (isSamePassword) throw new ValidationError("New password must be different from the current one");

	const passwordHash = await bcrypt.hash(input.newPassword, PASSWORD_HASH_ROUNDS);
	// One transaction, because half of this is a security hole in each direction:
	// revoked sessions with the old password still working signs someone out for
	// nothing, and a changed password with live sessions leaves the person the
	// change was made *against* still signed in.
	await prisma.$transaction(async (transaction) => {
		await transaction.user.update({
			where: { id: userId },
			data: { passwordHash, passwordChangedAt: new Date() },
			select: { id: true },
		});
		// The access tokens are refused by `passwordChangedAt`; these are the rows
		// that would otherwise let every other device mint a fresh one.
		await revokeAllRefreshTokens(userId, transaction);
	});
	endSessions(userId);

	// Signed after `passwordChangedAt` was written, so its `iat` is not behind
	// the marker that would refuse it, and issued after the revocation so the
	// caller's replacement session is not one of the ones just ended.
	return { token: signAccessToken(userId), refreshToken: await issueRefreshToken(userId) };
}

/**
 * Exchanges a refresh token for a new access token and a replacement refresh
 * token.
 *
 * Unauthenticated, and it has to be: the whole reason this endpoint is called
 * is that the caller's access token has expired. The refresh token in the body
 * is the credential, and `rotateRefreshToken` is what checks it.
 *
 * The access token is signed *after* the rotation commits, so a refresh that
 * fails hands out nothing at all.
 */
export async function refreshSession(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
	const rotated = await rotateRefreshToken(refreshToken);

	return { token: signAccessToken(rotated.userId), refreshToken: rotated.refreshToken };
}

/**
 * Ends one session — the thing "sign out" could not do before.
 *
 * It cannot reach back for the access token that was issued alongside it, which
 * stays valid until it expires. That window is the reason `ACCESS_TOKEN_TTL_SECONDS`
 * is fifteen minutes and not seven days; what this closes is the ability to keep
 * minting new ones for the next month.
 */
export async function logout(refreshToken: string): Promise<void> {
	await revokeRefreshToken(refreshToken);
}

/**
 * Starts a reset: mints a one-time link and dispatches its mail.
 *
 * **Returns nothing, and returns it whether or not the address exists.** This
 * endpoint is unauthenticated and takes an email, so any difference in what it
 * says — or in how long it takes to say it — is a way to ask "does this person
 * have an account". `register` has to reveal that and is rate limited instead;
 * this one has no such excuse.
 *
 * Outstanding links are burned first. Without that, someone who requested a
 * reset while they briefly had access to a mailbox keeps a live link after the
 * real owner requests their own — two valid keys, one of them forgotten about.
 */
export async function requestPasswordReset(input: RequestPasswordResetInput): Promise<void> {
	const startedAt = Date.now();
	const token = randomBytes(32).toString("base64url");

	try {
		await prisma.$transaction(async (transaction) => {
			// The row lock serialises requests for the same account. Without it, two
			// requests can both burn the old set before either creates its replacement,
			// leaving two live links after both commits.
			const users = await transaction.$queryRaw<{ id: string; email: string }[]>`
				SELECT id, email
				FROM "User"
				WHERE email = ${input.email}
				FOR UPDATE
			`;
			const user = users[0];
			if (!user) return;

			await transaction.passwordResetToken.updateMany({
				where: { userId: user.id, usedAt: null },
				data: { usedAt: new Date() },
			});

			await transaction.passwordResetToken.create({
				data: {
					userId: user.id,
					tokenHash: hashOneTimeToken(token),
					expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
				},
				select: { id: true },
			});

			// Inside the transaction, deliberately — see the function's own comment.
			// If the token write above rolls back, so does the promise to mail it.
			await enqueuePasswordResetMail(transaction, user.email, token);
		});
	} finally {
		// Applied on success and failure so the fast path cannot identify an
		// unknown address. A future network mailer must keep its own latency below
		// this bound or move delivery behind a durable queue.
		await waitForPasswordResetResponseFloor(startedAt);
	}
}

/**
 * Finishes a reset: sets the new password and spends the link.
 *
 * Expired, already used, and never existed all produce the same error, because
 * the caller is not signed in and telling them apart would say something about
 * an account to someone who has not proved they own it.
 *
 * The write is one transaction. Split, a crash between them either sets a
 * password while leaving the link live, or spends a link without setting
 * anything — the first is a spare key, the second locks the person out.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
	const record = await prisma.passwordResetToken.findUnique({
		where: { tokenHash: hashOneTimeToken(input.token) },
		select: { id: true, userId: true, expiresAt: true, usedAt: true },
	});

	if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
		throw new ValidationError("That reset link is invalid or has expired");
	}

	const passwordHash = await bcrypt.hash(input.newPassword, PASSWORD_HASH_ROUNDS);
	await prisma.$transaction(async (transaction) => {
		const claimedAt = new Date();
		// Validation above gives a useful fast failure. This conditional write is
		// the authority: two requests may both pass that read, but only one can
		// change a still-unused, still-live row and continue to the password write.
		const claimed = await transaction.passwordResetToken.updateMany({
			where: { id: record.id, usedAt: null, expiresAt: { gt: claimedAt } },
			data: { usedAt: claimedAt },
		});
		if (claimed.count !== 1) {
			throw new ValidationError("That reset link is invalid or has expired");
		}

		await transaction.user.update({
			where: { id: record.userId },
			data: { passwordHash, passwordChangedAt: claimedAt },
			select: { id: true },
		});
		// A reset exists for "somebody else has my account", which is worth
		// nothing if the sessions they opened keep working. `passwordChangedAt`
		// stops their access tokens; this stops them minting new ones. In the same
		// transaction as the password itself, so a failure leaves neither done.
		await revokeAllRefreshTokens(record.userId, transaction);
	});

	// No token is returned. Whoever is at the keyboard has proved they can read
	// the mailbox, which is not the same as having been signed in — they sign in
	// with the new password like anyone else.
	endSessions(record.userId);
}

/**
 * How long a confirmation link lives. The same hour a reset link gets, for the
 * same reason: long enough for a slow inbox, short enough that a forgotten link
 * in a mailbox is not a standing offer to take the account somewhere else.
 */
const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

/**
 * Records both halves of an email change, in the transaction that mints the token.
 *
 * Two messages, and the second one is the point of the feature as much as the
 * first. Changing the address on an account is how an account is taken — the
 * next password reset goes to the new mailbox — so the old address is told it
 * happened while it is still the address that can do something about it. It is
 * sent even though the change has not taken effect yet, deliberately: a warning
 * that arrives only after the link is opened arrives after the door is closed.
 *
 * Both go in the caller's transaction, so a rolled-back token cannot leave a mail
 * promising a link that does not exist.
 */
async function enqueueEmailChangeMails(
	transaction: Prisma.TransactionClient,
	currentEmail: string,
	newEmail: string,
	token: string,
): Promise<void> {
	await enqueueMail(transaction, {
		to: newEmail,
		subject: "Confirm your new Chatty email address",
		body: [
			"Someone asked to move a Chatty account to this address.",
			"",
			"Open this link within the hour to confirm it:",
			buildEmailChangeUrl(token),
			"",
			"If it was not you, ignore this — nothing changes until the link is opened.",
		].join("\n"),
	});

	await enqueueMail(transaction, {
		to: currentEmail,
		subject: "Someone asked to change your Chatty email address",
		// The new address is quoted in full rather than masked. The person reading
		// this is the account's current owner, and the useful question — "is that
		// mine?" — cannot be answered from "n***@example.com".
		body: [
			`A request was made to change the email address on your Chatty account to ${newEmail}.`,
			"",
			"Nothing has changed yet: the new address has to confirm a link first.",
			"",
			"If this was not you, change your password now — whoever asked can read this account.",
		].join("\n"),
	});
}

/**
 * Starts an email change: mints a link to the new address and warns the old one.
 *
 * **Nothing about the account changes here**, and that is the whole design. The
 * new address is parked on a token row until somebody proves they can read it;
 * writing it to `User.email` now would hand the account's password-reset
 * delivery to an address that may have been a typo — or somebody else's.
 *
 * Outstanding links are burned first, the same as a password reset: two live
 * links to two different addresses is one more than anybody asked for.
 *
 * The "already registered" answer reveals that an address has an account. That
 * is the same disclosure `register` makes and it is unavoidable for the same
 * reason — a caller who cannot be told why it failed cannot fix it — but here it
 * costs less, because the caller is signed in and rate limited per user.
 */
export async function requestEmailChange(userId: string, input: RequestEmailChangeInput): Promise<void> {
	// Outside the transaction: bcrypt takes ~300ms, and holding a row lock for it
	// would serialise this account's requests behind a deliberately slow hash.
	await assertPasswordMatches(userId, input.currentPassword);

	const token = randomBytes(32).toString("base64url");

	await prisma.$transaction(async (transaction) => {
		// The same row lock `requestPasswordReset` takes, for the same race: two
		// requests can otherwise both burn the old set before either writes its
		// replacement, leaving two live links after both commits.
		const users = await transaction.$queryRaw<{ id: string; email: string }[]>`
			SELECT id, email
			FROM "User"
			WHERE id = ${userId}
			FOR UPDATE
		`;
		const user = users[0];
		if (!user) throw new UnauthorizedError("Invalid or expired token");

		if (user.email === input.newEmail) {
			throw new ValidationError("That is already the address on this account");
		}

		const owner = await transaction.user.findUnique({ where: { email: input.newEmail }, select: { id: true } });
		if (owner) throw new ConflictError("Email already registered");

		await transaction.emailChangeToken.updateMany({
			where: { userId, usedAt: null },
			data: { usedAt: new Date() },
		});

		await transaction.emailChangeToken.create({
			data: {
				userId,
				newEmail: input.newEmail,
				tokenHash: hashOneTimeToken(token),
				expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
			},
			select: { id: true },
		});

		await enqueueEmailChangeMails(transaction, user.email, input.newEmail, token);
	});
}

/**
 * Finishes an email change: the address on the account becomes the confirmed one.
 *
 * Unauthenticated, like the reset confirmation, and for the same practical
 * reason — the link is opened in whatever mailbox it was sent to, which is
 * frequently a phone that has never signed in. The token is the proof.
 *
 * The uniqueness of the new address is re-checked here rather than trusted from
 * the request, because the gap between the two steps is an hour wide: somebody
 * else can register that address in the meantime. The check is the database's
 * unique index, caught and turned into a 409 — a read-then-write would leave the
 * same race open, one query narrower.
 *
 * Sessions are deliberately left alone. This changes what you sign in *with*,
 * not whether the person signed in is still you; the password is untouched, and
 * the warning to the old address is what covers the case where it is not.
 */
export async function confirmEmailChange(input: ConfirmEmailChangeInput): Promise<void> {
	const record = await prisma.emailChangeToken.findUnique({
		where: { tokenHash: hashOneTimeToken(input.token) },
		select: { id: true, userId: true, newEmail: true, expiresAt: true, usedAt: true },
	});

	if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
		throw new ValidationError("That confirmation link is invalid or has expired");
	}

	try {
		await prisma.$transaction(async (transaction) => {
			const claimedAt = new Date();
			// The conditional write, not the read above, is the authority: two
			// requests may both pass that read and only one can change a
			// still-unused, still-live row.
			const claimed = await transaction.emailChangeToken.updateMany({
				where: { id: record.id, usedAt: null, expiresAt: { gt: claimedAt } },
				data: { usedAt: claimedAt },
			});
			if (claimed.count !== 1) {
				throw new ValidationError("That confirmation link is invalid or has expired");
			}

			await transaction.user.update({
				where: { id: record.userId },
				data: { email: record.newEmail },
				select: { id: true },
			});
		});
	} catch (error) {
		// P2002 is the unique violation on `User.email`: somebody registered the
		// address during the hour this link was live. A clean 409 rather than the
		// 500 an unhandled Prisma error would become — the link is spent either
		// way, and the person needs to be told to ask again from the other address.
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
			throw new ConflictError("Email already registered");
		}

		throw error;
	}
}
