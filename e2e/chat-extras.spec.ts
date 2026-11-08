import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

/** Built-in stickers, chat folders and selecting several messages, end to end. */
test("built-in stickers, chat folders and multi-select work against the real server", async ({ browser }) => {
	const meContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const peerContext = await browser.newContext();
	const page = await meContext.newPage();
	const peerPage = await peerContext.newPage();
	const me = makeUser("ExtrasMe");
	const peer = makeUser("ExtrasPeer");
	await register(peerPage, peer);
	await register(page, me);
	await startDirectChat(page, peer);
	await openConversationWith(peerPage, me);

	// A built-in animated sticker arrives on the other side, drawn, not as text.
	await page.getByRole("button", { name: "Add an attachment" }).click();
	await page.getByRole("menuitem", { name: "Sticker", exact: true }).click();
	await page.getByRole("button", { name: "Send the Party sticker" }).click();
	await expect(messages(peerPage).locator(".chatty-sticker")).toBeVisible({ timeout: 15_000 });

	// Folders: a direct chat is under Direct, not under Groups.
	await page.getByRole("tab", { name: "Groups" }).click();
	await expect(page.getByText("No groups yet.")).toBeVisible();
	await page.getByRole("tab", { name: "Direct" }).click();
	await expect(page.getByRole("button", { name: new RegExp(peer.displayName) }).first()).toBeVisible();
	await page.getByRole("tab", { name: "All" }).click();

	// Multi-select: pick two messages and delete them for yourself.
	await sendMessage(page, "first to go");
	await sendMessage(page, "second to go");
	await expect(page.getByText(/^(Sent|Seen) /)).toBeVisible({ timeout: 15_000 });
	const firstRow = page.locator("[data-message-interaction-row]").filter({ hasText: "first to go" });
	await firstRow.hover();
	await firstRow.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Select" }).click();
	await page.locator("[data-message-interaction-row]").filter({ hasText: "second to go" }).click();
	const bar = page.getByRole("toolbar", { name: "Selected messages" });
	await expect(bar.getByText("2 selected")).toBeVisible();
	await bar.getByRole("button", { name: "Delete for me" }).click();
	await expect(bar).toHaveCount(0);
	await expect(messages(page).getByText("first to go")).toHaveCount(0);
	await expect(messages(page).getByText("second to go")).toHaveCount(0);
	// Only hidden for me: the other side still has them.
	await expect(messages(peerPage).getByText("second to go")).toBeVisible();

	await meContext.close();
	await peerContext.close();
});
