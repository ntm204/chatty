import { expect, test } from "@playwright/test";
import { makeUser, messages, register, sendMessage, startDirectChat } from "./helpers.js";

/**
 * Previewing a chat exists so a message can be read without telling the sender:
 * opening the chat marks it read, previewing it must not. Only a browser with
 * both people in it can prove the sender's "Seen" stayed put.
 */
test("a previewed chat stays unread for the sender until it is opened", async ({ browser }) => {
	const readerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const senderContext = await browser.newContext();
	const reader = await readerContext.newPage();
	const sender = await senderContext.newPage();
	const readerUser = makeUser("PreviewReader");
	const senderUser = makeUser("PreviewSender");
	await register(reader, readerUser);
	await register(sender, senderUser);
	await startDirectChat(sender, readerUser);
	await sendMessage(sender, "Read this whenever");
	await expect(sender.getByText(/^Sent /)).toBeVisible({ timeout: 15_000 });

	// Desktop: right-click the row.
	const row = reader.locator("li").filter({ hasText: senderUser.displayName });
	await expect(row).toBeVisible({ timeout: 15_000 });
	await row.getByRole("button").first().click({ button: "right" });
	const preview = reader.getByRole("dialog", { name: `Preview of ${senderUser.displayName}` });
	await expect(preview.getByText("Read this whenever", { exact: false })).toBeVisible();
	await expect(preview.getByText("Preview · not marked as read")).toBeVisible();

	// The sender's tick does not move while the reader reads.
	await reader.waitForTimeout(1500);
	await expect(sender.getByText(/^Sent /)).toBeVisible();
	await expect(sender.getByText(/^Seen /)).toHaveCount(0);
	await reader.keyboard.press("Escape");
	await expect(preview).toHaveCount(0);

	// Phone: hold the row.
	const phoneContext = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
		storageState: await readerContext.storageState(),
	});
	const phone = await phoneContext.newPage();
	await phone.goto("/chat");
	const phoneRow = phone.getByRole("button", { name: new RegExp(senderUser.displayName) }).first();
	await expect(phoneRow).toBeVisible({ timeout: 15_000 });
	const box = (await phoneRow.boundingBox())!;
	const point = { clientX: box.x + 40, clientY: box.y + box.height / 2, pointerType: "touch", isPrimary: true };
	await phoneRow.dispatchEvent("pointerdown", point);
	await phone.waitForTimeout(600);
	await phoneRow.dispatchEvent("pointerup", point);
	const sheet = phone.getByRole("dialog", { name: `Preview of ${senderUser.displayName}` });
	await expect(sheet).toBeVisible();
	await expect(phone).toHaveURL(/\/chat\/?$/);
	await phone.keyboard.press("Escape");
	await expect(sender.getByText(/^Seen /)).toHaveCount(0);
	await phoneContext.close();

	// Opening it is what tells the sender.
	// The row's "…" menu offers the same preview.
	await row.hover();
	await row.getByRole("button", { name: "Conversation actions" }).click();
	await reader.getByRole("menuitem", { name: "Preview" }).click();
	await preview.getByRole("button", { name: "Open chat" }).click();
	await expect(messages(reader).getByText("Read this whenever")).toBeVisible();
	await expect(sender.getByText(/^Seen /)).toBeVisible({ timeout: 15_000 });

	await readerContext.close();
	await senderContext.close();
});
