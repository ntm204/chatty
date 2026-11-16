import { expect, test } from "@playwright/test";
import { API_URL, makeUser, openConversationWith, register, startDirectChat } from "./helpers.js";

test("a note reaches the people you chat with, and its replies land in a conversation", async ({ browser }) => {
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

	// ── Post a note, then a second one for six hours ──
	await author.getByRole("button", { name: "New note" }).click();
	let composer = author.getByRole("dialog", { name: "New note" });
	await composer.getByLabel("Note text").fill("Coffee at nine?");
	await composer.getByRole("button", { name: "Share note" }).click();
	await expect(composer).toHaveCount(0);
	await expect(author.getByRole("button", { name: "Your note" })).toBeVisible();

	await author.getByRole("button", { name: "New note" }).click();
	composer = author.getByRole("dialog", { name: "New note" });
	await composer.getByLabel("Note text").fill("The view from here");
	await composer.getByRole("radio", { name: "6 hours" }).click();
	await composer.getByRole("button", { name: "Share note" }).click();
	await expect(composer).toHaveCount(0);

	// ── The friend sees it live; a stranger never does ──
	const ring = friend.getByRole("button", { name: `${minh.displayName}'s note, new` });
	await expect(ring).toBeVisible();
	// Both notes must have reached the friend's row before playing it: the second
	// post's nudge is debounced, so it can trail the ring by a moment.
	await expect
		.poll(() =>
			friend.evaluate(async (apiUrl) => {
				const token = localStorage.getItem("chatty:token");
				const feed = await (
					await fetch(`${apiUrl}/stories`, { headers: { Authorization: `Bearer ${token}` } })
				).json();

				const stories = feed.authors[0]?.stories ?? [];
				const last = stories[1];

				return last
					? `${stories.length}:${Math.round((Date.parse(last.expiresAt) - Date.parse(last.createdAt)) / 3_600_000)}h`
					: "";
			}, API_URL),
		)
		.toBe("2:6h");
	await friend.reload();
	await expect(ring).toBeVisible();
	await expect(stranger.getByRole("button", { name: new RegExp(`${minh.displayName}'s note`) })).toHaveCount(0);

	await ring.click();
	const viewer = friend.getByRole("dialog", { name: `Notes from ${minh.displayName}` });
	await expect(viewer.getByText("Coffee at nine?")).toBeVisible();
	await viewer.getByRole("button", { name: "Next note" }).click();
	await expect(viewer.getByText("The view from here")).toBeVisible();
	await viewer.getByRole("button", { name: "Previous note" }).click();
	await viewer.getByLabel("Reply to note").fill("Yes please");
	await viewer.getByRole("button", { name: "Send reply" }).click();
	await expect(viewer.getByRole("status")).toHaveText(`Sent to ${minh.displayName}`);
	await friend.keyboard.press("Escape");
	await expect(viewer).toHaveCount(0);
	await expect(friend.getByRole("button", { name: `${minh.displayName}'s note` })).toBeVisible();

	// ── The reply is a direct message quoting the note ──
	const thread = author.getByLabel("Message history");
	await expect(thread.getByText("Yes please")).toBeVisible();
	await expect(thread.getByText("Replied to your note")).toBeVisible();

	// ── The author sees who viewed it, then deletes it ──
	await author.getByRole("button", { name: "Your note" }).click();
	const own = author.getByRole("dialog", { name: `Notes from ${minh.displayName}` });
	await own.getByRole("button", { name: "1", exact: true }).click();
	await expect(own.getByRole("heading", { name: "Viewers" })).toBeVisible();
	// The viewers sheet is the one list under its heading; the reply bar may name the same person.
	await expect(
		own.getByRole("heading", { name: "Viewers" }).locator("../..").getByText(an.displayName, { exact: true }),
	).toBeVisible();
	await own.getByRole("button", { name: "Close viewers" }).click();
	await own.getByRole("button", { name: "Delete note" }).click();
	await own.getByRole("button", { name: "Delete note" }).click();
	await expect(own).toHaveCount(0);
	await expect(author.getByRole("button", { name: "Your note" })).toHaveCount(0);
	await expect(friend.getByRole("button", { name: new RegExp(`${minh.displayName}'s note`) })).toHaveCount(0);
});
