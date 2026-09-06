import { expect, test } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

test.describe("sidebar organisation", () => {
	test("archives a row behind the compact actions menu and restores it from Archived", async ({ browser }) => {
		const minhUser = makeUser("Minh");
		const anUser = makeUser("An");
		const minh = await browser.newContext();
		const an = await browser.newContext();
		const minhPage = await minh.newPage();
		const anPage = await an.newPage();

		await register(anPage, anUser);
		await register(minhPage, minhUser);
		await startDirectChat(minhPage, anUser);

		await minhPage.getByRole("button", { name: "Conversation actions" }).click();
		await minhPage.getByRole("menuitem", { name: "Archive" }).click();
		await expect(minhPage.getByRole("button", { name: new RegExp(anUser.displayName) })).not.toBeVisible();

		await minhPage.getByRole("button", { name: "Archived" }).click();
		await expect(minhPage.getByRole("button", { name: new RegExp(anUser.displayName) })).toBeVisible();

		await minh.close();
		await an.close();
	});

	test("keeps a muted message unread without putting it in the tab title", async ({ browser }) => {
		const listenerUser = makeUser("Listener");
		const senderUser = makeUser("Sender");
		const listener = await browser.newContext();
		const sender = await browser.newContext();
		const listenerPage = await listener.newPage();
		const senderPage = await sender.newPage();

		await register(listenerPage, listenerUser);
		await register(senderPage, senderUser);
		await startDirectChat(senderPage, listenerUser);
		await expect(listenerPage.getByRole("button", { name: new RegExp(senderUser.displayName) })).toBeVisible();

		await listenerPage.getByRole("button", { name: "Conversation actions" }).click();
		await listenerPage.getByRole("menuitem", { name: "Mute" }).click();
		await listenerPage.getByRole("menuitem", { name: "8 hours" }).click();
		await sendMessage(senderPage, "quiet but still unread");

		await expect(listenerPage.getByLabel("1 unread messages")).toBeVisible({ timeout: 15_000 });
		await expect(listenerPage).toHaveTitle("Chatty");
		const sidebar = listenerPage.locator("aside");
		await sidebar.getByRole("button", { name: new RegExp(senderUser.displayName) }).hover();
		await expect(listenerPage.getByLabel("1 unread messages")).toBeVisible();
		await listenerPage.screenshot({ path: "/tmp/chatty-sidebar-layout-light.png" });
		await listenerPage.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
		await listenerPage.setViewportSize({ width: 375, height: 760 });
		await expect(sidebar.getByText("quiet but still unread", { exact: true })).toBeVisible();
		await listenerPage.screenshot({ path: "/tmp/chatty-sidebar-layout-mobile-dark.png" });

		await listener.close();
		await sender.close();
	});
});
