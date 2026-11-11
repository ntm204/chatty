import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it } from "vitest";
import { verifyAccessToken } from "../src/lib/access-token.js";
import { ConflictError, UnauthorizedError, ValidationError } from "../src/lib/errors.js";
import { changePassword, login } from "../src/modules/auth/auth.service.js";
import { prisma } from "../src/lib/prisma.js";
import { updateProfile } from "../src/modules/users/users.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

const PASSWORD = "SuperSecret123";

/**
 * Hashed once for the whole file, then reused by every fixture row.
 *
 * `register()` would be the obvious way to make a user, and it is the wrong one
 * here: it hashes at cost 12 (~300ms) per call, which is what pushed an earlier
 * suite past Vitest's 5s timeout and left abandoned queries racing the next
 * test's TRUNCATE — see the warning in tests/setup.ts. The tests below are about
 * profiles, not about registration, so the hash only has to be *a* valid one.
 */
const passwordHash = await bcrypt.hash(PASSWORD, 4);

let fakeIO: FakeIO;

// `changePassword` ends every session on the account, which means reaching for
// the socket server. getIO() throws when nothing has been installed.
beforeEach(() => {
	fakeIO = installFakeIO();
});

async function createUser(handle: string, displayName = "Minh"): Promise<string> {
	const user = await prisma.user.create({
		data: { email: `${handle}@chatty.test`, handle, displayName, passwordHash },
		select: { id: true },
	});

	return user.id;
}

describe("updateProfile", () => {
	it("changes the display name and leaves the handle alone", async () => {
		const userId = await createUser("minh_test", "Minh");

		const profile = await updateProfile(userId, { displayName: "Minh Nguyen" });

		expect(profile.displayName).toBe("Minh Nguyen");
		expect(profile.handle).toBe("minh_test");
	});

	it("changes the handle and leaves the display name alone", async () => {
		const userId = await createUser("minh_test", "Minh");

		const profile = await updateProfile(userId, { handle: "minh_nguyen" });

		expect(profile.handle).toBe("minh_nguyen");
		expect(profile.displayName).toBe("Minh");
	});

	it("changes both when both are sent", async () => {
		const userId = await createUser("minh_test", "Minh");

		const profile = await updateProfile(userId, { displayName: "Minh N", handle: "minh_n" });

		expect(profile).toMatchObject({ displayName: "Minh N", handle: "minh_n" });
	});

	it("rejects a handle somebody else already has", async () => {
		const minhId = await createUser("minh_test");
		await createUser("an_test", "An");

		await expect(updateProfile(minhId, { handle: "an_test" })).rejects.toBeInstanceOf(ConflictError);
	});

	it("accepts your own handle unchanged, because the form posts every field", async () => {
		// The edit form sends the handle whether or not it was touched, so this is
		// the ordinary case rather than an odd one — treating it as a conflict
		// would make saving a display name impossible.
		const userId = await createUser("minh_test", "Minh");

		const profile = await updateProfile(userId, { handle: "minh_test", displayName: "Minh Nguyen" });

		expect(profile).toMatchObject({ handle: "minh_test", displayName: "Minh Nguyen" });
	});

	it("leaves the other user's handle intact after a rejected claim", async () => {
		const minhId = await createUser("minh_test");
		const anId = await createUser("an_test", "An");

		await expect(updateProfile(minhId, { handle: "an_test" })).rejects.toBeInstanceOf(ConflictError);

		const an = await prisma.user.findUnique({ where: { id: anId }, select: { handle: true } });
		expect(an!.handle).toBe("an_test");
	});

	it("never returns the password hash", async () => {
		const userId = await createUser("minh_test");

		const profile = await updateProfile(userId, { displayName: "Minh Nguyen" });

		expect(profile).not.toHaveProperty("passwordHash");
	});
});

describe("changePassword", () => {
	it("lets the user sign in with the new password", async () => {
		// The only assertion that proves the write landed in a usable form —
		// checking the column changed would pass even if it held something bcrypt
		// could never match.
		const userId = await createUser("minh_test");

		await changePassword(userId, { currentPassword: PASSWORD, newPassword: "BrandNewSecret456" });

		const result = await login({ email: "minh_test@chatty.test", password: "BrandNewSecret456" });
		expect(result.user.id).toBe(userId);
	});

	it("stops the old password working", async () => {
		const userId = await createUser("minh_test");

		await changePassword(userId, { currentPassword: PASSWORD, newPassword: "BrandNewSecret456" });

		await expect(login({ email: "minh_test@chatty.test", password: PASSWORD })).rejects.toBeInstanceOf(
			UnauthorizedError,
		);
	});

	it("rejects a wrong current password", async () => {
		const userId = await createUser("minh_test");

		await expect(
			changePassword(userId, { currentPassword: "NotMyPassword", newPassword: "BrandNewSecret456" }),
		).rejects.toBeInstanceOf(UnauthorizedError);
	});

	it("changes nothing when the current password is wrong", async () => {
		const userId = await createUser("minh_test");

		await expect(
			changePassword(userId, { currentPassword: "NotMyPassword", newPassword: "BrandNewSecret456" }),
		).rejects.toBeInstanceOf(UnauthorizedError);

		// Still signable-in with the original: a failed attempt must not be a
		// half-applied one.
		const result = await login({ email: "minh_test@chatty.test", password: PASSWORD });
		expect(result.user.id).toBe(userId);
	});

	it("ends every session on the account", async () => {
		// The whole point of the feature. A password change that leaves other
		// devices signed in is useless in the case it is most often reached for.
		const userId = await createUser("minh_test");

		await changePassword(userId, { currentPassword: PASSWORD, newPassword: "BrandNewSecret456" });

		expect(fakeIO.disconnects).toContain(`user:${userId}`);
	});

	it("hands back a token so the caller is not signed out of their own tab", async () => {
		const userId = await createUser("minh_test");

		const { token } = await changePassword(userId, {
			currentPassword: PASSWORD,
			newPassword: "BrandNewSecret456",
		});

		expect(await verifyAccessToken(token)).toBe(userId);
	});

	it("refuses the token the request was made with", async () => {
		// Issued before the change, so it is exactly what must stop working.
		const userId = await createUser("minh_test");
		const { token: before } = await login({ email: "minh_test@chatty.test", password: PASSWORD });

		// A second of daylight, because `iat` is whole seconds and a token minted
		// inside the same second as the change is deliberately still accepted.
		await new Promise((resolve) => setTimeout(resolve, 1100));
		await changePassword(userId, { currentPassword: PASSWORD, newPassword: "BrandNewSecret456" });

		await expect(verifyAccessToken(before)).rejects.toBeInstanceOf(UnauthorizedError);
	});

	it("rejects reusing the password already set", async () => {
		const userId = await createUser("minh_test");

		await expect(
			changePassword(userId, { currentPassword: PASSWORD, newPassword: PASSWORD }),
		).rejects.toBeInstanceOf(ValidationError);
	});
});
