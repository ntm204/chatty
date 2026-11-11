import { readFile, rm } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { saveAvatar } from "../src/lib/avatar-storage.js";
import { NotFoundError, ValidationError } from "../src/lib/errors.js";
import { register } from "../src/modules/auth/auth.service.js";
import { clearAvatar, getAvatarFilePath, getUserById, setAvatar } from "../src/modules/users/users.service.js";

/** Matches UPLOAD_DIR in vitest.config.ts — the whole tree is removed at the end. */
// This worker's own upload directory — see tests/setup.ts.
const UPLOAD_DIR = process.env.UPLOAD_DIR!;

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

async function createUser(name: string): Promise<string> {
	const { user } = await register({
		email: `${name}@chatty.test`,
		password: "SuperSecret123",
		handle: `${name}_test`,
		displayName: name,
	});

	return user.id;
}

/** A real, decodable image — the service re-encodes, so a fake buffer would not survive. */
function makeImage(width: number, height: number, format: "jpeg" | "png" = "jpeg"): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 120, b: 200 } } })
		[format]()
		.toBuffer();
}

describe("avatars", () => {
	it("has no avatar url before anything is uploaded", async () => {
		const userId = await createUser("minh");

		expect((await getUserById(userId)).avatarUrl).toBeNull();
	});

	it("returns a versioned absolute url after an upload", async () => {
		const userId = await createUser("minh");

		const user = await setAvatar(userId, await makeImage(400, 300));

		expect(user.avatarUrl).toMatch(new RegExp(`^http://api\\.test/users/${userId}/avatar\\?v=\\d+$`));
	});

	it("changes the url when the picture is replaced", async () => {
		const userId = await createUser("minh");

		const first = await setAvatar(userId, await makeImage(400, 300));
		// The version comes from a millisecond timestamp, so two uploads inside the
		// same millisecond would produce the same URL and a stale cached image.
		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = await setAvatar(userId, await makeImage(200, 200));

		expect(second.avatarUrl).not.toBe(first.avatarUrl);
	});

	it("re-encodes any input to a square webp", async () => {
		const userId = await createUser("minh");

		await setAvatar(userId, await makeImage(800, 400, "png"));
		const stored = await sharp(await readFile(await getAvatarFilePath(userId))).metadata();

		// The format is the security control, not a preference: nothing of the
		// uploaded file's own format survives to be served back from this origin.
		expect(stored.format).toBe("webp");
		expect(stored.width).toBe(stored.height);
	});

	it("rejects a file that is not a decodable image", async () => {
		const userId = await createUser("minh");

		await expect(setAvatar(userId, Buffer.from("this is a text file, not a png"))).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("leaves no avatar behind when the upload was rejected", async () => {
		const userId = await createUser("minh");

		await expect(setAvatar(userId, Buffer.from("nope"))).rejects.toThrow();

		expect((await getUserById(userId)).avatarUrl).toBeNull();
	});

	it("clears the avatar", async () => {
		const userId = await createUser("minh");
		await setAvatar(userId, await makeImage(400, 300));

		const user = await clearAvatar(userId);

		expect(user.avatarUrl).toBeNull();
		await expect(getAvatarFilePath(userId)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("serves nothing for a user who never uploaded one", async () => {
		const userId = await createUser("minh");

		await expect(getAvatarFilePath(userId)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("serves nothing for a user id that does not exist", async () => {
		// Same error as "no avatar set", so the endpoint cannot be used to test
		// whether an account exists.
		await expect(getAvatarFilePath("cm0000000000000000000000")).rejects.toBeInstanceOf(NotFoundError);
	});

	it("refuses a key that would escape the upload directory", async () => {
		// The id reaches this through a route param and is joined into a path.
		await expect(saveAvatar("../../etc/passwd", await makeImage(64, 64))).rejects.toBeInstanceOf(ValidationError);
	});
});
