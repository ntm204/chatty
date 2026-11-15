import type { CurrentUserDTO, UserDTO } from "@chatty/shared-types";
import { deleteAvatar, findAvatarPath, saveAvatar } from "../../lib/avatar-storage.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { getIO, getOptionalIO, userRoom } from "../../lib/socket-bus.js";
import { assertPasswordMatches } from "../auth/auth.service.js";
import {
	announceDepartures,
	clearSharedReadMarkers,
	removeUserFromEveryGroup,
} from "../conversations/conversations.service.js";
import { toMessageTimer } from "../conversations/conversations.mapper.js";
import { toUserDTO, userSelect } from "./users.mapper.js";
import type { DeleteAccountInput, SearchUsersQuery, UpdateProfileInput } from "./users.schema.js";

/**
 * Loads the signed-in user's own profile.
 *
 * Returns the DTO shape explicitly rather than the Prisma row: `createdAt` is a
 * `Date` in the database and an ISO string on the wire, so mapping it here makes
 * the compiler check the contract in packages/shared-types instead of leaving it
 * to whatever `res.json()` happens to serialize.
 */
export async function getUserById(userId: string): Promise<CurrentUserDTO> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		// `passwordHash` is never selected — see docs/conventions/backend.md.
		// `email` and `readReceiptsEnabled` are added on top of the shared
		// projection rather than being part of it: this is the one response allowed
		// to carry them, and keeping them out of `userSelect` is what stops them
		// riding along on somebody else's profile.
		select: {
			...userSelect,
			email: true,
			readReceiptsEnabled: true,
			presenceVisibility: true,
			defaultMessageTimerSeconds: true,
			allowMessageForwarding: true,
			typingIndicatorsEnabled: true,
		},
	});

	// findUnique + explicit throw, not findUniqueOrThrow: the latter raises a
	// Prisma error the error middleware would turn into a 500, not a 404.
	if (!user) throw new NotFoundError("User not found");

	return {
		...toUserDTO(user, true),
		email: user.email,
		readReceiptsEnabled: user.readReceiptsEnabled,
		presenceVisibility: user.presenceVisibility.toLowerCase() as CurrentUserDTO["presenceVisibility"],
		defaultMessageTimerSeconds: toMessageTimer(user.defaultMessageTimerSeconds),
		allowMessageForwarding: user.allowMessageForwarding,
		typingIndicatorsEnabled: user.typingIndicatorsEnabled,
	};
}

/**
 * Changes the signed-in user's own display name, handle, or both.
 *
 * Only the fields that were sent are written. Prisma would read an `undefined`
 * in `data` as "leave this column alone", but `exactOptionalPropertyTypes`
 * refuses to let one be written there at all, so each field is spread in only
 * when it is present — same effect, and the compiler stays able to tell a
 * missing key from a cleared one.
 *
 * The handle uniqueness check is read-then-write, the same shape `register`
 * uses, and carries the same small race: two people claiming one handle in the
 * same instant both pass the read. The database's unique index is what actually
 * prevents it, and the loser gets a 500 rather than a 409. Worth a better error
 * one day; not worth a transaction for a name nobody is racing for.
 */
export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<CurrentUserDTO> {
	if (input.handle !== undefined) {
		const owner = await prisma.user.findUnique({ where: { handle: input.handle }, select: { id: true } });

		// Re-submitting your own handle is a no-op, not a conflict — the edit form
		// posts every field it shows, so this is the common case rather than a
		// strange one.
		if (owner && owner.id !== userId) throw new ConflictError("Handle already taken");
	}

	await prisma.user.update({
		where: { id: userId },
		data: {
			...(input.displayName !== undefined && { displayName: input.displayName }),
			...(input.handle !== undefined && { handle: input.handle }),
			...(input.readReceiptsEnabled !== undefined && { readReceiptsEnabled: input.readReceiptsEnabled }),
			...(input.allowMessageForwarding !== undefined && { allowMessageForwarding: input.allowMessageForwarding }),
			...(input.typingIndicatorsEnabled !== undefined && {
				typingIndicatorsEnabled: input.typingIndicatorsEnabled,
			}),
			...(input.defaultMessageTimerSeconds !== undefined && {
				defaultMessageTimerSeconds: input.defaultMessageTimerSeconds,
			}),
			...(input.presenceVisibility !== undefined && {
				presenceVisibility: input.presenceVisibility.toUpperCase() as "EVERYONE" | "CONTACTS" | "NOBODY",
			}),
		},
		select: { id: true },
	});

	// Turning them off withdraws the receipts already given, rather than only
	// stopping new ones: a setting that leaves yesterday's "Seen" on somebody's
	// screen has not done what its label says. Turning them back **on** restores
	// nothing — the markers are gone, and they catch up when this user next reads
	// something, which is what keeps the toggle from being a retroactive reveal.
	if (input.readReceiptsEnabled === false) await clearSharedReadMarkers(userId);

	// Messages already on other people's screens carry the old answer in
	// `isForwardable`; tell every conversation so "Forward" appears or goes now,
	// not at their next reload. Best effort: the server refuses the forward anyway.
	if (input.allowMessageForwarding !== undefined) {
		const memberships = await prisma.conversationParticipant.findMany({
			where: { userId },
			select: { conversationId: true },
		});
		const rooms = memberships.map((membership) => membership.conversationId);
		if (rooms.length > 0) {
			getOptionalIO()
				?.to(rooms)
				.emit("user:forwarding-changed", { userId, allowMessageForwarding: input.allowMessageForwarding });
		}
	}

	// Re-read rather than mapping the update's own result, so there is exactly one
	// place that knows how a row becomes a CurrentUserDTO.
	return getUserById(userId);
}

/**
 * Finds people to start a conversation with.
 *
 * Matches on handle and email as well as display name — you generally know a
 * colleague's handle or email, not how they spelled their name — but returns
 * `UserDTO`, which has no email field. So an exact address finds the right
 * person, while searching common letters cannot be used to harvest addresses.
 *
 * The handle *is* returned, and that is the point: display names are not
 * unique, so without it two people called "Minh" are indistinguishable in the
 * results and you cannot tell which one to message.
 */
export async function searchUsers(currentUserId: string, query: SearchUsersQuery): Promise<UserDTO[]> {
	const users = await prisma.user.findMany({
		where: {
			id: { not: currentUserId },
			// Both directions. This relation filter deliberately lives in the
			// database: loading every blocked id first turns a large account into an
			// unbounded read and a potentially enormous `NOT IN` parameter list.
			NOT: {
				OR: [
					{ blocksMade: { some: { blockedId: currentUserId } } },
					{ blocksReceived: { some: { blockerId: currentUserId } } },
				],
			},
			OR: [
				{ handle: { contains: query.query, mode: "insensitive" } },
				{ displayName: { contains: query.query, mode: "insensitive" } },
				{ email: { contains: query.query, mode: "insensitive" } },
			],
		},
		orderBy: { handle: "asc" },
		take: query.limit,
		select: userSelect,
	});

	return users.map((user) => toUserDTO(user));
}

/**
 * Replaces the signed-in user's avatar and returns their refreshed profile.
 *
 * The file is written before the timestamp is stored, and the order matters: a
 * timestamp with no file behind it produces a URL that 404s for everyone,
 * whereas a file with no timestamp is invisible and gets overwritten by the
 * next upload. Failing towards the harmless one is worth the orphan.
 */
export async function setAvatar(userId: string, upload: Buffer): Promise<CurrentUserDTO> {
	await saveAvatar(userId, upload);
	await prisma.user.update({ where: { id: userId }, data: { avatarUpdatedAt: new Date() }, select: { id: true } });

	return getUserById(userId);
}

/** Drops the signed-in user's avatar, falling them back to generated initials. */
export async function clearAvatar(userId: string): Promise<CurrentUserDTO> {
	await prisma.user.update({ where: { id: userId }, data: { avatarUpdatedAt: null }, select: { id: true } });
	await deleteAvatar(userId);

	return getUserById(userId);
}

/**
 * Path of the file to serve for `GET /users/:id/avatar`.
 *
 * Returns a path rather than bytes so the controller can hand it to
 * `res.sendFile`, which sets the caching and range headers an image response
 * wants — reading it into a Buffer here would mean re-implementing those.
 *
 * Checks the database first: a file left behind by a failed `clearAvatar` must
 * not keep being served after the user asked for it to be gone.
 */
export async function getAvatarFilePath(userId: string): Promise<string> {
	const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUpdatedAt: true } });
	if (!user?.avatarUpdatedAt) throw new NotFoundError("No avatar set");

	const filePath = await findAvatarPath(userId);
	if (!filePath) throw new NotFoundError("No avatar set");

	return filePath;
}

/**
 * Deletes the signed-in user's account, for good.
 *
 * **What goes:** the user row, and with it — by cascade — their participant rows,
 * their password reset tokens and their pending email changes. Their avatar file
 * goes too, which closes the "avatar files are not cleaned up" gap: nothing used
 * to delete a user, so nothing had ever been the right place to delete the file.
 *
 * **What stays, and why it is not an oversight:** their messages. The rows are
 * kept with `authorId` set to null — the foreign key is `ON DELETE SET NULL`
 * specifically so this cannot cascade — because deleting them would empty other
 * people's conversations of half a discussion, and because hard-deleting message
 * rows breaks read markers and paging cursors for everyone else in the thread.
 * That is the same argument phase 8 made for tombstoning a deleted message, and
 * it does not get weaker when the account rather than the message is what went.
 *
 * The name goes with the account. The client renders an authorless USER message
 * as "Deleted account", rather than keeping a snapshot of who wrote it: holding
 * on to the name of somebody who just asked to be erased is the opposite of what
 * they asked for. It is a decision rather than a default — the alternative, an
 * author name copied onto the message at write time, is a real design that other
 * apps choose — and this is where it is recorded.
 *
 * Attachments on those messages stay for the same reason the text does. Account
 * deletion therefore does **not** close the orphaned-attachment gap; that one is
 * about files whose upload failed, and it needs a sweep of the upload directory.
 *
 * Every group they were in learns about it, gets a new owner if it needs one, and
 * says so in its log — see `removeUserFromEveryGroup`. One transaction, so a
 * crash cannot leave somebody half-departed.
 */
export async function deleteAccount(userId: string, input: DeleteAccountInput): Promise<void> {
	await assertPasswordMatches(userId, input.currentPassword);

	const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
	if (!user) throw new UnauthorizedError("Invalid or expired token");

	const departures = await prisma.$transaction(async (transaction) => {
		// Before the delete, while the participant rows and the name still exist.
		const effects = await removeUserFromEveryGroup(transaction, userId, user.displayName);

		await transaction.user.delete({ where: { id: userId }, select: { id: true } });

		return effects;
	});

	// Everything below is after the commit and cannot be rolled back, so nothing
	// below may fail the request.

	// Disconnect before the broadcasts: the departure lines are about this person
	// and are sent to rooms their sockets are still in until this runs. Their
	// token stops working on its next request anyway — `requireAuth` reads the
	// user row — but an open socket is already past that gate.
	getIO().in(userRoom(userId)).disconnectSockets(true);

	announceDepartures(departures);

	// Logged rather than thrown. The account *is* deleted, and failing the request
	// now would tell the caller otherwise — the same call the message delete makes
	// about an attachment file it could not unlink.
	await deleteAvatar(userId).catch((error: unknown) => {
		logger.error({ err: error, userId }, "failed to remove avatar file for a deleted account");
	});
}
