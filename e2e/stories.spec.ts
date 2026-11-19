import { expect, test } from "@playwright/test";
import { API_URL, befriend, makeUser, openConversationWith, register, startDirectChat } from "./helpers.js";

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
	// A note goes to friends by default, as on Facebook.
	await befriend(author, friend, an);

	// ── Post a note, then a new one that replaces it (one note per person) ──
	await author.getByRole("button", { name: "New note" }).click();
	let composer = author.getByRole("dialog", { name: "New note" });
	await composer.getByLabel("Note text").fill("Coffee at nine?");
	await composer.getByRole("button", { name: "Share" }).click();
	await expect(composer).toHaveCount(0);
	const mine = author.getByRole("button", { name: "Your note" });
	await expect(mine).toContainText("Coffee at nine?");

	await mine.click();
	await author.getByRole("dialog", { name: "Your note" }).getByRole("button", { name: "Leave a new note" }).click();
	composer = author.getByRole("dialog", { name: "New note" });
	await expect(composer.getByText(/It replaces your current note/)).toBeVisible();
	await composer.getByLabel("Note text").fill("Ai đi cà phê không?");
	await composer.getByRole("button", { name: "Share" }).click();
	await expect(composer).toHaveCount(0);
	await expect(mine).toContainText("Ai đi cà phê không?");

	// ── The friend sees only the newest note, live; a stranger never does ──
	const tile = friend.getByRole("button", { name: `${minh.displayName}'s note` });
	await expect(tile).toContainText("Ai đi cà phê không?");
	await expect
		.poll(() =>
			friend.evaluate(async (apiUrl) => {
				const token = localStorage.getItem("chatty:token");
				const feed = await (
					await fetch(`${apiUrl}/stories`, { headers: { Authorization: `Bearer ${token}` } })
				).json();
				const notes = feed.authors[0]?.stories ?? [];

				return notes.length === 1
					? `${notes[0].text}:${Math.round((Date.parse(notes[0].expiresAt) - Date.parse(notes[0].createdAt)) / 3_600_000)}h`
					: String(notes.length);
			}, API_URL),
		)
		.toBe("Ai đi cà phê không?:24h");
	await expect(stranger.getByRole("button", { name: new RegExp(`${minh.displayName}'s note`) })).toHaveCount(0);

	// ── A heart, then a reply that lands in the chat ──
	await tile.click();
	const sheet = friend.getByRole("dialog", { name: `${minh.displayName}'s note` });
	await sheet.getByRole("button", { name: "Like note" }).click();
	await expect(sheet.getByRole("button", { name: "Unlike note" })).toHaveAttribute("aria-pressed", "true");
	await sheet.getByLabel("Reply to note").fill("Có nha");
	await sheet.getByRole("button", { name: "Send reply" }).click();
	await expect(sheet.getByRole("status")).toHaveText(`Sent to ${minh.displayName}`);
	await friend.keyboard.press("Escape");
	await expect(sheet).toHaveCount(0);

	const thread = author.getByLabel("Message history");
	await expect(thread.getByText("Có nha")).toBeVisible();
	await expect(thread.getByText("Replied to your note")).toBeVisible();

	// ── The author sees who liked it, then deletes it ──
	await mine.click();
	const own = author.getByRole("dialog", { name: "Your note" });
	await expect(own.getByText("Liked by 1")).toBeVisible();
	await expect(own.getByText(an.displayName, { exact: true })).toBeVisible();
	await own.getByRole("button", { name: "Delete note" }).click();
	await author.getByRole("dialog", { name: "Delete note?" }).getByRole("button", { name: "Delete note" }).click();
	await expect(own).toHaveCount(0);
	await expect(author.getByRole("button", { name: "New note" })).toBeVisible();
	await expect(friend.getByRole("button", { name: new RegExp(`${minh.displayName}'s note`) })).toHaveCount(0);
});
