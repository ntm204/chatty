import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";
import { expectMessageLocationCue } from "./message-navigation-assertions.js";

test("pinned photos and text navigate without moving the app shell", async ({ browser }, testInfo) => {
	test.setTimeout(60_000);
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		colorScheme: "dark",
		reducedMotion: "reduce",
	});
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
	expect((await page.locator(".pinned-messages-banner").boundingBox())!.height).toBeLessThanOrEqual(40);
	await page.reload();
	await openConversationWith(page, other);
	await expect(page.getByLabel("Show pinned messages")).toBeVisible();
	await expect(input).toBeVisible();
	const header = page.locator(".conversation-header");
	const historyViewport = page.getByLabel("Message history");
	expect((await historyViewport.boundingBox())!.y).toBeCloseTo((await header.boundingBox())!.y, 0);
	expect(await header.evaluate((element) => getComputedStyle(element).backdropFilter)).toContain("blur");
	await historyViewport.evaluate((element) => element.scrollBy(0, -90));
	await page.screenshot({ path: testInfo.outputPath("pins-blur.png") });
	await historyViewport.evaluate((element) => element.scrollTo(0, element.scrollHeight));
	const before = await input.boundingBox();
	const headerBefore = (await header.boundingBox())!;
	await page.getByLabel("Show pinned messages").click();
	const dialog = page.getByRole("dialog", { name: "Pinned messages" });
	await expect(dialog.getByRole("button", { name: "Photo", exact: true })).toBeVisible();
	await expect(dialog.locator("img")).toBeVisible();
	expect((await input.boundingBox())!.y).toBeCloseTo(before!.y, 0);
	await page.screenshot({ path: testInfo.outputPath("pins-dialog.png") });
	await dialog.getByRole("button", { name: "Photo", exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect(photo).toBeInViewport();
	const photoRow = page.locator(`#message-${photoId}`);
	const textRow = page.locator(`#message-${textId}`);
	await expectMessageLocationCue(photoRow);
	await expect(page.getByRole("button", { name: "Back to reply", exact: true })).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath("pin-location-photo-desktop-dark.png") });
	// The bar itself never remembers that pick: clicking it (without opening the
	// dropdown again) always jumps to the most recently pinned message instead.
	await page.getByRole("button", { name: "Last pinned note" }).click();
	await expect(page.getByLabel("Message history").getByText("Last pinned note", { exact: true })).toBeInViewport();
	await expectMessageLocationCue(textRow);
	// The photo may have left the loaded window entirely; what matters is that no
	// stale cue survives on it.
	await expect(page.locator(`#message-${photoId}[data-message-located="true"]`)).toHaveCount(0);
	await page.emulateMedia({ colorScheme: "light" });
	await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
	await page.screenshot({ path: testInfo.outputPath("pin-location-text-desktop-light.png") });
	await expect(textRow).not.toHaveAttribute("data-message-located", "true", { timeout: 5_000 });
	await page.getByRole("button", { name: "Last pinned note" }).click();
	await expectMessageLocationCue(textRow);
	expect((await input.boundingBox())!.y).toBeCloseTo(before!.y, 0);
	expect((await header.boundingBox())!.y).toBeCloseTo(headerBefore.y, 0);
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
	await page.setViewportSize({ width: 375, height: 812 });
	await page.emulateMedia({ colorScheme: "dark" });
	await page.getByLabel("Conversation storage and details").click();
	await page
		.getByRole("complementary", { name: "Conversation details" })
		.getByRole("button", { name: /Pinned messages/ })
		.click();
	await page
		.getByRole("dialog", { name: "Pinned messages" })
		.getByRole("button", { name: "Photo", exact: true })
		.click();
	await expect(photo).toBeInViewport();
	await expect(input).toBeInViewport();
	await expectMessageLocationCue(photoRow);
	await page.screenshot({ path: testInfo.outputPath("pin-location-photo-mobile-dark.png") });
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
