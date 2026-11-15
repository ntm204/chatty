import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import { API_URL, makeUser, openConversationWith, register, startDirectChat } from "./helpers.js";

const PHOTO = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
	"base64",
);

test("a story reaches the people you chat with, and its replies land in a conversation", async ({ browser }) => {
	test.setTimeout(90_000);
	const authorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const friendContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
	const strangerContext = await browser.newContext();
	const author = await authorContext.newPage();
	const friend = await friendContext.newPage();
	const stranger = await strangerContext.newPage();
	const minh = makeUser("Minh");
	const an = makeUser("An");
	const chi = makeUser("Chi");
	await register(friend, an);
	await register(stranger, chi);
	await register(author, minh);
	await startDirectChat(author, an);
	await openConversationWith(friend, minh);

	// ── Post a text story, then a photo story ──
	await author.getByRole("button", { name: "New story" }).click();
	let composer = author.getByRole("dialog", { name: "New story" });
	await composer.getByRole("radio", { name: "Text" }).click();
	await composer.getByLabel("Story text").fill("Coffee at nine?");
	await composer.getByRole("radio", { name: "teal" }).click();
	await composer.getByRole("button", { name: "Share story" }).click();
	await expect(composer).toHaveCount(0);
	await expect(author.getByRole("button", { name: "Your story" })).toBeVisible();

	await author.getByRole("button", { name: "New story" }).click();
	composer = author.getByRole("dialog", { name: "New story" });
	await composer.getByLabel("Story photo").setInputFiles({ name: "view.png", mimeType: "image/png", buffer: PHOTO });
	await composer.getByLabel("Caption").fill("The view");
	await composer.getByRole("button", { name: "Share story" }).click();
	await expect(composer).toHaveCount(0);

	// ── The friend sees it live; a stranger never does ──
	const ring = friend.getByRole("button", { name: `${minh.displayName}'s story, new` });
	await expect(ring).toBeVisible();
	// Both stories must have reached the friend's row before playing it: the second
	// post's nudge is debounced, so it can trail the ring by a moment.
	await expect
		.poll(() =>
			friend.evaluate(async (apiUrl) => {
				const token = localStorage.getItem("chatty:token");
				const feed = await (
					await fetch(`${apiUrl}/stories`, { headers: { Authorization: `Bearer ${token}` } })
				).json();

				return feed.authors[0]?.stories.length ?? 0;
			}, API_URL),
		)
		.toBe(2);
	await friend.reload();
	await expect(ring).toBeVisible();
	await expect(stranger.getByRole("button", { name: new RegExp(`${minh.displayName}'s story`) })).toHaveCount(0);

	await ring.click();
	const viewer = friend.getByRole("dialog", { name: `Stories from ${minh.displayName}` });
	await expect(viewer.getByText("Coffee at nine?")).toBeVisible();
	await viewer.getByRole("button", { name: "Next story" }).click();
	await expect(viewer.getByAltText("The view")).toBeVisible();
	await expect(viewer.getByText("The view")).toBeVisible();
	await viewer.getByRole("button", { name: "Previous story" }).click();
	await viewer.getByLabel("Reply to story").fill("Yes please");
	await viewer.getByRole("button", { name: "Send reply" }).click();
	await expect(viewer.getByRole("status")).toHaveText(`Sent to ${minh.displayName}`);
	await friend.keyboard.press("Escape");
	await expect(viewer).toHaveCount(0);
	await expect(friend.getByRole("button", { name: `${minh.displayName}'s story` })).toBeVisible();

	// ── The reply is a direct message quoting the story ──
	const thread = author.getByLabel("Message history");
	await expect(thread.getByText("Yes please")).toBeVisible();
	await expect(thread.getByText("Replied to your story")).toBeVisible();

	// ── The author sees who viewed it, then deletes it ──
	await author.getByRole("button", { name: "Your story" }).click();
	const own = author.getByRole("dialog", { name: `Stories from ${minh.displayName}` });
	await own.getByRole("button", { name: "1", exact: true }).click();
	await expect(own.getByRole("heading", { name: "Viewers" })).toBeVisible();
	// The viewers sheet is the one list under its heading; the reply bar may name the same person.
	await expect(
		own.getByRole("heading", { name: "Viewers" }).locator("../..").getByText(an.displayName, { exact: true }),
	).toBeVisible();
	await own.getByRole("button", { name: "Close viewers" }).click();
	await own.getByRole("button", { name: "Delete story" }).click();
	await own.getByRole("button", { name: "Delete story" }).click();
	await expect(own).toHaveCount(0);
	await expect(author.getByRole("button", { name: "Your story" })).toHaveCount(0);
	await expect(friend.getByRole("button", { name: new RegExp(`${minh.displayName}'s story`) })).toHaveCount(0);
});

test("a video story is re-encoded, plays for the viewer, and keeps the chosen lifetime", async ({ browser }) => {
	test.setTimeout(90_000);
	const { spawnSync } = await import("node:child_process");
	// The same ffmpeg the server uses; specs compile to CommonJS, so resolve it from this file.
	const ffmpeg = createRequire(__filename)("ffmpeg-static") as string;
	const made = spawnSync(
		ffmpeg,
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=540x960:rate=30",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=330",
			"-t",
			"3",
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			// MP4 cannot be written to a pipe unindexed; a fragmented file is also a
			// fair stand-in for a phone clip whose index is not up front.
			"-movflags",
			"frag_keyframe+empty_moov",
			"-f",
			"mp4",
			"pipe:1",
		],
		{ maxBuffer: 20 * 1024 * 1024 },
	);
	expect(made.status).toBe(0);

	const authorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const friendContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
	const author = await authorContext.newPage();
	const friend = await friendContext.newPage();
	const minh = makeUser("Minh");
	const an = makeUser("An");
	await register(friend, an);
	await register(author, minh);
	await startDirectChat(author, an);
	await openConversationWith(friend, minh);

	await author.getByRole("button", { name: "New story" }).click();
	const composer = author.getByRole("dialog", { name: "New story" });
	await composer.getByRole("radio", { name: "Video" }).click();
	await composer
		.getByLabel("Story video")
		.setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: made.stdout });
	await expect(composer.getByLabel("Selected video")).toBeVisible();
	await composer.getByRole("radio", { name: "6 hours" }).click();
	await composer.getByRole("button", { name: "Share story" }).click();
	await expect(composer).toHaveCount(0, { timeout: 30_000 });

	const ring = friend.getByRole("button", { name: `${minh.displayName}'s story, new` });
	await expect(ring).toBeVisible();
	const lifetimeHours = await friend.evaluate(async (apiUrl) => {
		const token = localStorage.getItem("chatty:token");
		const feed = await (await fetch(`${apiUrl}/stories`, { headers: { Authorization: `Bearer ${token}` } })).json();
		const story = feed.authors[0].stories[0];

		return (Date.parse(story.expiresAt) - Date.parse(story.createdAt)) / 3_600_000;
	}, API_URL);
	expect(lifetimeHours).toBeCloseTo(6, 1);

	await ring.click();
	const video = friend.getByLabel(`Video story from ${minh.displayName}`);
	await expect(video).toBeVisible();
	// It really plays: time moves, which needs the H.264 file, Range support and the token route.
	await expect
		.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 10_000 })
		.toBeGreaterThan(0.3);
	expect(await video.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(540);
	await expect(friend.getByRole("button", { name: /Mute|Unmute/ })).toBeVisible();
});
