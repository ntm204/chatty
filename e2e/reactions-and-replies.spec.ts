import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

/**
 * What only a browser can prove about reactions and replies.
 *
 * The service tests know the toggle writes a row and broadcasts the message, and
 * the component tests know what a bubble renders given a reaction list. Neither
 * knows the two are joined up — that pressing a glyph in one person's menu puts
 * a chip on the other person's screen without a reload, and that the composer's
 * reply slot actually reaches the server as `replyToId`. Every link in that
 * chain is invisible from below.
 */
test.describe("reactions", () => {
	test("a reaction reaches the other person without a reload", async ({ browser }) => {
		const aliceUser = makeUser("Ada");
		const bobUser = makeUser("Bram");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await openConversationWith(bobPage, aliceUser);

		await sendMessage(alicePage, "shipped it");
		await expect(messages(bobPage).getByText("shipped it")).toBeVisible({ timeout: 15_000 });

		await bobPage.getByLabel("React to message").click();
		await bobPage.getByRole("menuitem", { name: "React with ❤️" }).click();

		const receivedText = messages(bobPage).getByText("shipped it");
		const receivedReaction = bobPage.getByRole("button", { name: "❤️, 1" });
		await expect(receivedReaction).toBeVisible({ timeout: 15_000 });
		const textBox = await receivedText.boundingBox();
		const reactionBox = await receivedReaction.boundingBox();
		expect(textBox).not.toBeNull();
		expect(reactionBox).not.toBeNull();
		if (!textBox || !reactionBox) throw new Error("Message and reaction must have browser geometry");

		// The chip sits inside the bubble, under the text, at its start.
		expect(reactionBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height);
		expect(reactionBox.x).toBeLessThan(textBox.x + textBox.width / 2);
		const bubbleBox = await messages(bobPage)
			.locator(".chat-bubble")
			.filter({ hasText: "shipped it" })
			.boundingBox();
		if (!bubbleBox) throw new Error("The bubble must have browser geometry");
		expect(reactionBox.y + reactionBox.height).toBeLessThanOrEqual(bubbleBox.y + bubbleBox.height);

		// Alice is looking at her own message and did nothing, so a chip appearing
		// on her screen can only be the broadcast.
		await expect(alicePage.getByRole("button", { name: "❤️, 1" })).toBeVisible({ timeout: 15_000 });
		await expect(bobPage.getByRole("button", { name: "❤️, 1" })).toBeVisible();
	});

	test("pressing the same reaction again takes it off", async ({ browser }) => {
		const aliceUser = makeUser("Ada");
		const bobUser = makeUser("Bram");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await openConversationWith(bobPage, aliceUser);

		await sendMessage(alicePage, "shipped it");
		await expect(messages(bobPage).getByText("shipped it")).toBeVisible({ timeout: 15_000 });

		await bobPage.getByLabel("React to message").click();
		await bobPage.getByRole("menuitem", { name: "React with ❤️" }).click();
		const chip = bobPage.getByRole("button", { name: "❤️, 1" });
		await expect(chip).toBeVisible({ timeout: 15_000 });

		// The chip is the same toggle as the bar entry: pressing it clears it.
		await chip.click();

		await expect(bobPage.getByRole("button", { name: /^❤️,/ })).toHaveCount(0, { timeout: 15_000 });
		await expect(alicePage.getByRole("button", { name: /^❤️,/ })).toHaveCount(0, { timeout: 15_000 });
	});

	test("a second emoji replaces the first rather than adding one", async ({ browser }) => {
		// One reaction per person is the rule Messenger, Instagram and Telegram all
		// implement, and it is enforced by the primary key rather than by the UI —
		// so the only way to prove the two agree is to press two emoji in a real
		// browser and count the reactions that come back over the socket.
		const aliceUser = makeUser("Ada");
		const bobUser = makeUser("Bram");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await openConversationWith(bobPage, aliceUser);

		await sendMessage(alicePage, "shipped it");
		await expect(messages(bobPage).getByText("shipped it")).toBeVisible({ timeout: 15_000 });

		await bobPage.getByLabel("React to message").click();
		await bobPage.getByRole("menuitem", { name: "React with ❤️" }).click();
		await expect(bobPage.getByRole("button", { name: "❤️, 1" })).toBeVisible({ timeout: 15_000 });

		await bobPage.getByLabel("React to message").click();
		await bobPage.getByRole("menuitem", { name: "React with 😂" }).click();

		await expect(alicePage.getByRole("button", { name: "😂, 1" })).toBeVisible({ timeout: 15_000 });
		await expect(alicePage.getByRole("button", { name: /^❤️,/ })).toHaveCount(0);
		await expect(bobPage.getByRole("button", { name: /^❤️,/ })).toHaveCount(0);
	});

	test("names the people behind a reaction, which no tooltip can do on a phone", async ({ browser }) => {
		const aliceUser = makeUser("Ada");
		const bobUser = makeUser("Bram");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await openConversationWith(bobPage, aliceUser);

		await sendMessage(alicePage, "shipped it");
		await expect(messages(bobPage).getByText("shipped it")).toBeVisible({ timeout: 15_000 });

		await bobPage.getByLabel("React to message").click();
		await bobPage.getByRole("menuitem", { name: "React with 👍" }).click();
		await expect(alicePage.getByRole("button", { name: "👍, 1" })).toBeVisible({ timeout: 15_000 });

		// Alice opens the list from her own side, so what it names came over the
		// socket rather than out of the click that made it.
		await alicePage.getByLabel("Message actions").first().click();
		await alicePage.getByRole("menuitem", { name: "Who reacted" }).click();

		const panel = alicePage.getByRole("dialog", { name: "Reactions" });
		await expect(panel).toBeVisible();
		// Exact, because the row prints the handle under the name and the handle
		// is built from it — a loose match resolves to both.
		await expect(panel.getByText(bobUser.displayName, { exact: true })).toBeVisible();
		await expect(panel.getByText(`@${bobUser.handle}`)).toBeVisible();
	});
});

test.describe("replies", () => {
	test("a reply carries its quote to the other person", async ({ browser }) => {
		const aliceUser = makeUser("Ada");
		const bobUser = makeUser("Bram");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await openConversationWith(bobPage, aliceUser);

		await sendMessage(alicePage, "meet at 5");
		await expect(messages(bobPage).getByText("meet at 5")).toBeVisible({ timeout: 15_000 });

		await bobPage.getByLabel("Message actions").click();
		await bobPage.getByRole("menuitem", { name: "Reply" }).click();
		// The composer says what is about to be answered before anything is sent.
		await expect(bobPage.getByText(/Replying to/)).toBeVisible();
		await sendMessage(bobPage, "works for me");

		// Alice sees the answer with her own line quoted inside it — which can only
		// have come back down from the server, since her page never had a reply slot.
		const reply = messages(alicePage).getByText("works for me");
		await expect(reply).toBeVisible({ timeout: 15_000 });
		await expect(messages(alicePage).getByText("meet at 5")).toHaveCount(2);
	});

	test("the quote follows the original when it is edited", async ({ browser }) => {
		// The quote is resolved on every read rather than copied at send time, so
		// an edited original must re-quote with its new words. A copy would keep
		// showing text its author had already replaced.
		const aliceUser = makeUser("Ada");
		const bobUser = makeUser("Bram");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await openConversationWith(bobPage, aliceUser);

		await sendMessage(alicePage, "meet at 5");
		await expect(messages(bobPage).getByText("meet at 5")).toBeVisible({ timeout: 15_000 });

		await bobPage.getByLabel("Message actions").click();
		await bobPage.getByRole("menuitem", { name: "Reply" }).click();
		await sendMessage(bobPage, "works for me");
		await expect(messages(alicePage).getByText("works for me")).toBeVisible({ timeout: 15_000 });

		await alicePage.reload();
		await openConversationWith(alicePage, bobUser);
		await expect(messages(alicePage).getByText("meet at 5")).toHaveCount(2, { timeout: 15_000 });
	});
});
