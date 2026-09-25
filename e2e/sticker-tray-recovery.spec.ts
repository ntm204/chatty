import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, startDirectChat } from "./helpers.js";

test("a failed sticker send keeps the tray, and separate removal never deletes the sent copy", async ({ browser }) => {
	const sender = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
	const recipient = await browser.newContext();
	const page = await sender.newPage();
	const peerPage = await recipient.newPage();
	const author = makeUser("StickerAuthor");
	const peer = makeUser("StickerPeer");
	try {
		await register(peerPage, peer);
		await register(page, author);
		await startDirectChat(page, peer);
		await openConversationWith(peerPage, author);
		await page.getByRole("button", { name: "Add an attachment" }).click();
		await page.getByRole("menuitem", { name: "Sticker", exact: true }).click();
		let tray = page.getByRole("dialog", { name: "Stickers" });
		await expect(tray.getByText(/No stickers yet/)).toBeVisible();
		await tray.locator('input[type="file"]').setInputFiles({
			name: "sticker.png",
			mimeType: "image/png",
			buffer: Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
				"base64",
			),
		});
		await expect(tray.getByRole("button", { name: "Send this sticker" })).toBeVisible();
		await page.route("**/conversations/*/messages", async (route) => {
			if (route.request().method() === "POST")
				await route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({ message: "Sticker send interrupted" }),
				});
			else await route.continue();
		});
		await tray.getByRole("button", { name: "Send this sticker" }).tap();
		await expect(tray.getByRole("alert")).toContainText("Sticker send interrupted");
		await page.unroute("**/conversations/*/messages");
		await tray.getByRole("button", { name: "Send this sticker" }).tap();
		await expect(tray).toHaveCount(0);
		await expect(messages(peerPage).locator("img")).toHaveCount(1);
		await page.getByRole("button", { name: "Add an attachment" }).click();
		await page.getByRole("menuitem", { name: "Sticker", exact: true }).click();
		tray = page.getByRole("dialog", { name: "Stickers" });
		const send = tray.getByRole("button", { name: "Send this sticker" });
		const remove = tray.getByRole("button", { name: "Remove this sticker" });
		await expect(remove).toBeVisible();
		await tray.evaluate(async (element) => {
			await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
		});
		const sendBox = (await send.boundingBox())!;
		const removeBox = (await remove.boundingBox())!;
		expect(removeBox.y).toBeGreaterThanOrEqual(sendBox.y + sendBox.height);
		expect(removeBox.height).toBeGreaterThanOrEqual(36);
		await remove.tap();
		await expect(tray.getByText(/No stickers yet/)).toBeVisible();
		await expect(messages(peerPage).locator("img")).toHaveCount(1);
	} finally {
		await sender.close();
		await recipient.close();
	}
});
