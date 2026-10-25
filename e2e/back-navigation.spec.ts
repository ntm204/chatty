import { expect, test } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

/**
 * XP-47: each open thread is a URL, Back closes the top layer before it leaves
 * a thread, and reload or a pasted link opens the same place.
 */
test.describe("back and position", () => {
	test("desktop: reload, layers, settings and a dead link all return somewhere sensible", async ({ browser }) => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		const page = await context.newPage();
		const peer = makeUser("BackPeer");
		await register(await (await browser.newContext()).newPage(), peer);
		await register(page, makeUser("BackAuthor"));
		await startDirectChat(page, peer);
		await sendMessage(page, "kept across reload");
		// Confirmed by the server (the sidebar preview comes from it) before reloading.
		await expect(page.locator("aside").getByText("kept across reload")).toBeVisible({ timeout: 15_000 });
		await expect(page).toHaveURL(/\/chat\/[\w-]+$/u);
		const threadUrl = page.url();

		await page.reload();
		await expect(page.getByRole("main").getByText("kept across reload")).toBeVisible({ timeout: 15_000 });

		// Details panel: Back closes it and keeps the thread.
		await page.getByRole("button", { name: "Conversation storage and details" }).click();
		const details = page.getByRole("complementary", { name: "Conversation details" });
		await expect(details).toBeVisible();
		await page.goBack();
		await expect(details).toHaveCount(0);
		await expect(page).toHaveURL(threadUrl);

		// Message search across conversations: Back closes it.
		await page.getByRole("button", { name: "Search all messages" }).click();
		await expect(
			page
				.getByRole("searchbox", { name: "Search all messages" })
				.or(page.getByRole("textbox", { name: "Search all messages" })),
		).toBeVisible();
		await page.goBack();
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(page).toHaveURL(threadUrl);

		// Settings closes back onto the same thread, by button and by Back.
		await page.getByLabel("Account settings").click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.getByRole("button", { name: "Close settings" }).click();
		await expect(page).toHaveURL(threadUrl);
		await expect(page.getByRole("main").getByText("kept across reload")).toBeVisible();
		await page.getByLabel("Account settings").click();
		await page.goBack();
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(page).toHaveURL(threadUrl);

		// Back leaves the thread for the list, inside the app; Forward returns.
		await page.goBack();
		await expect(page).toHaveURL(/\/chat$/u);
		await expect(page.getByRole("region", { name: "Welcome to your chats" })).toBeVisible();
		await page.goForward();
		await expect(page.getByRole("main").getByText("kept across reload")).toBeVisible();

		// A link to a conversation this account cannot open lands on the list with a reason.
		await page.goto("/chat/00000000-0000-4000-8000-000000000000");
		await expect(page).toHaveURL(/\/chat$/u, { timeout: 15_000 });
		await expect(page.getByRole("alert")).toContainText("That conversation isn’t available");

		await context.close();
	});

	test("phone: list → thread → details, then Back one layer at a time", async ({ browser }) => {
		const context = await browser.newContext({
			viewport: { width: 390, height: 760 },
			hasTouch: true,
			isMobile: true,
		});
		const page = await context.newPage();
		const peer = makeUser("PhonePeer");
		await register(await (await browser.newContext()).newPage(), peer);
		await register(page, makeUser("PhoneAuthor"));
		await startDirectChat(page, peer);
		await sendMessage(page, "phone thread");
		await page.getByRole("button", { name: "Back to conversations" }).click();
		const row = page.getByRole("button", { name: new RegExp(peer.displayName) });
		await expect(row).toBeVisible();
		await expect(page).toHaveURL(/\/chat$/u);

		await row.click();
		await expect(page.getByRole("main").getByText("phone thread")).toBeVisible();
		await page.getByRole("button", { name: "Conversation storage and details" }).click();
		await expect(page.getByRole("complementary", { name: "Conversation details" })).toBeVisible();

		await page.goBack();
		await expect(page.getByRole("complementary", { name: "Conversation details" })).toHaveCount(0);
		await expect(page.getByRole("main").getByText("phone thread")).toBeVisible();

		await page.goBack();
		await expect(row).toBeVisible();
		await expect(page).toHaveURL(/\/chat$/u);

		// The thread's own back arrow does not stack a new list entry on top.
		await row.click();
		await page.getByRole("button", { name: "Back to conversations" }).click();
		await expect(row).toBeVisible();
		await page.goForward();
		await expect(page.getByRole("main").getByText("phone thread")).toBeVisible();

		await context.close();
	});
});
