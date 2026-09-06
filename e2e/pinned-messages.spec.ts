import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("pinned photos and text navigate without moving the app shell", async ({ browser }) => {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const peerContext = await browser.newContext();
	const page = await context.newPage();
	const peer = await peerContext.newPage();
	const user = makeUser("PinReader");
	const other = makeUser("PinSender");
	await register(peer, other);
	await register(page, user);
	await startDirectChat(page, other);
	const input = page.getByRole("textbox", { name: "Message", exact: true });
	await page
		.getByRole("main")
		.locator('input[type="file"][multiple]')
		.setInputFiles({
			name: "pin.png",
			mimeType: "image/png",
			buffer: Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
				"base64",
			),
		});
	await sendMessage(page, "Photo caption, not a photo title");
	const photo = page.getByLabel("Message history").getByAltText("Photo caption, not a photo title");
	await expect(photo).toBeVisible();
	await expect
		.poll(() => photo.evaluate((element) => element.closest('[id^="message-"]')!.id))
		.not.toContain("draft");
	const photoId = await photo.evaluate((element) => element.closest('[id^="message-"]')!.id.slice(8));
	await page.evaluate(async () => {
		const headers = {
			Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
			"Content-Type": "application/json",
		};
		const data = await (await fetch("http://localhost:4100/conversations", { headers })).json();
		for (let index = 0; index < 85; index++) {
			const response = await fetch(`http://localhost:4100/conversations/${data.items[0].id}/messages`, {
				method: "POST",
				headers,
				body: JSON.stringify({ content: `History between pins ${index}` }),
			});
			if (!response.ok) throw new Error("Could not seed pin history");
		}
	});
	await sendMessage(page, "Last pinned note");
	await expect
		.poll(() =>
			page
				.getByLabel("Message history")
				.getByText("Last pinned note", { exact: true })
				.evaluate((element) => element.closest('[id^="message-"]')!.id),
		)
		.not.toContain("draft");
	const textId = await page
		.getByLabel("Message history")
		.getByText("Last pinned note", { exact: true })
		.evaluate((element) => element.closest('[id^="message-"]')!.id.slice(8));
	await page.evaluate(
		async ({ ids }) => {
			const headers = { Authorization: `Bearer ${localStorage.getItem("chatty:token")}` };
			const data = await (await fetch("http://localhost:4100/conversations", { headers })).json();
			for (const id of ids) {
				const response = await fetch(
					`http://localhost:4100/conversations/${data.items[0].id}/messages/${id}/pin`,
					{ method: "PUT", headers },
				);
				if (!response.ok) throw new Error(`Pin request failed: ${response.status} ${await response.text()}`);
			}
		},
		{ ids: [photoId, textId] },
	);
	// The badge above a pinned bubble was removed by design: pinned status is
	// only ever surfaced through the bar and its dropdown, never inline.
	await expect(page.locator(`#message-${photoId}`).getByText("Pinned", { exact: true })).toHaveCount(0);
	await expect(page.locator(`#message-${textId}`).getByText("Pinned", { exact: true })).toHaveCount(0);
	await expect(page.getByLabel("Show pinned messages")).toBeVisible();
	await page.reload();
	await openConversationWith(page, other);
	await expect(page.getByLabel("Show pinned messages")).toBeVisible();
	await expect(input).toBeVisible();
	const before = await input.boundingBox();
	await page.getByLabel("Show pinned messages").click();
	const dialog = page.getByRole("dialog", { name: "Pinned messages" });
	await expect(dialog.getByRole("button", { name: "Photo", exact: true })).toBeVisible();
	await expect(dialog.locator("img")).toBeVisible();
	expect((await input.boundingBox())!.y).toBeCloseTo(before!.y, 0);
	await page.screenshot({ path: "/tmp/chatty-pins-dialog.png" });
	await dialog.getByRole("button", { name: "Photo", exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect(photo).toBeInViewport();
	// The bar itself never remembers that pick: clicking it (without opening the
	// dropdown again) always jumps to the most recently pinned message instead.
	await page.getByRole("button", { name: "Last pinned note" }).click();
	await expect(page.getByLabel("Message history").getByText("Last pinned note", { exact: true })).toBeInViewport();
	expect((await input.boundingBox())!.y).toBeCloseTo(before!.y, 0);
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByLabel("Conversation storage and details").click();
	await page
		.getByRole("complementary", { name: "Conversation details" })
		.getByRole("button", { name: /Pinned messages/ })
		.click();
	await page
		.getByRole("complementary", { name: "Conversation details" })
		.getByRole("button", { name: "Photo", exact: true })
		.click();
	await expect(photo).toBeInViewport();
	await expect(input).toBeInViewport();
	await page.getByLabel("Show pinned messages").click();
	const pinsDialog = page.getByRole("dialog", { name: "Pinned messages" });
	await pinsDialog.getByLabel("More options for Photo", { exact: true }).click();
	// The dropdown is portalled to <body>, not a descendant of the dialog — so it
	// does not clip and does not force the dialog to resize. See conventions/frontend.md.
	await page.getByRole("menuitem", { name: "Unpin" }).click();
	await expect(pinsDialog.getByRole("button", { name: "Photo", exact: true })).toHaveCount(0);
	await page.getByLabel("Close pinned messages").click();
	await context.close();
	await peerContext.close();
});
