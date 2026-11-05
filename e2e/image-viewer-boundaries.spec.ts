import sharp from "sharp";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

async function expectInsideViewport(page: Page, element: Locator): Promise<void> {
	await expect(element).toBeVisible();
	const bounds = await element.boundingBox();
	const viewport = page.viewportSize()!;
	expect(bounds).not.toBeNull();
	expect(bounds!.x).toBeGreaterThanOrEqual(-1);
	expect(bounds!.y).toBeGreaterThanOrEqual(-1);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
	expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
}

test("a narrow image viewer keeps long captions, album navigation and close reachable", async ({
	browser,
	browserName,
}) => {
	test.setTimeout(60_000);
	const context = await browser.newContext({
		viewport: { width: 320, height: 568 },
		hasTouch: true,
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	const peerContext = await browser.newContext({ reducedMotion: "reduce" });
	const peer = await peerContext.newPage();
	const otherUser = makeUser("ViewerPeer");
	try {
		await register(peer, otherUser);
		await register(page, makeUser("ViewerAuthor"));
		await startDirectChat(page, otherUser);
		const sizes = [
			{ width: 40, height: 1600 },
			{ width: 1600, height: 40 },
		];
		const files = await Promise.all(
			Array.from({ length: 10 }, async (_, index) => ({
				name: `extreme-${index}.png`,
				mimeType: "image/png",
				buffer: await sharp({ create: { ...sizes[index % 2]!, channels: 3, background: "#78848a" } })
					.png()
					.toBuffer(),
			})),
		);
		let releaseUpload!: () => void;
		const canStartUpload = new Promise<void>((resolve) => {
			releaseUpload = resolve;
		});
		await page.route("**/conversations/*/messages", async (route) => {
			if (route.request().method() === "POST") await canStartUpload;
			await route.continue();
		});
		await page.locator('input[type="file"][multiple]').setInputFiles(files);
		const caption = `A long caption ${"https://example.com/" + "long".repeat(90)}`;
		await sendMessage(page, caption);
		const opener = page.getByRole("button", { name: "Open album of 10 images and its caption" });
		await expect(opener).toBeVisible({ timeout: 15_000 });
		await opener.click();
		const dialog = page.getByRole("dialog", { name: "Image 1 of 10" });
		const close = dialog.getByRole("button", { name: "Close image preview" });
		await expectInsideViewport(page, close);
		await expectInsideViewport(page, dialog.getByText(caption, { exact: true }));
		await expect(close).toHaveJSProperty("offsetWidth", 44);
		await dialog.getByRole("button", { name: "Zoom in", exact: true }).tap();
		await dialog.getByRole("button", { name: "Reset zoom" }).tap();
		await dialog.locator("[data-lightbox-image-area] img").tap();
		expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
		await page.screenshot({ path: `.data/run/image-viewer-${browserName}.png` });
		await dialog.getByRole("button", { name: "View image 10 of 10" }).click();
		await expect(page.getByRole("dialog")).toHaveAccessibleName("Image 10 of 10");
		await page.getByRole("button", { name: "Next image", exact: true }).click();
		await expect(page.getByRole("dialog")).toHaveAccessibleName("Image 1 of 10");
		await page.getByRole("button", { name: "Rotate image clockwise" }).click();
		// A viewer opened on a local image must survive the upload replacing its
		// draft row with the server message, before orientation changes as well.
		const uploadResponse = page.waitForResponse(
			(response) =>
				response.request().method() === "POST" && /\/conversations\/[^/]+\/messages$/.test(response.url()),
		);
		releaseUpload();
		expect((await uploadResponse).status()).toBe(201);
		await expect(page.getByRole("button", { name: "Forward this message" })).toBeVisible();
		await page.setViewportSize({ width: 568, height: 320 });
		await expectInsideViewport(page, page.getByRole("button", { name: "Close image preview" }));
		await expect
			.poll(() => page.locator("[data-lightbox-image-area]").evaluate((element) => element.clientHeight))
			.toBeGreaterThan(20);
		await page.getByRole("button", { name: "Close image preview" }).click();
		await expect(opener).toBeFocused();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	} finally {
		await context.close();
		await peerContext.close();
	}
});
