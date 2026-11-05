import { expect, test, type Locator, type Page } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

async function expectUsableComposer(page: Page): Promise<void> {
	await expect
		.poll(() =>
			page.locator(".message-composer").evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				const viewport = window.visualViewport;
				const top = viewport?.offsetTop ?? 0;
				const bottom = top + (viewport?.height ?? window.innerHeight);

				return bounds.top >= top && bounds.bottom <= bottom + 1 && bounds.width <= window.innerWidth;
			}),
		)
		.toBe(true);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
		.toBeLessThanOrEqual(0);
}

async function expectTouchTarget(control: Locator): Promise<void> {
	await expect(control).toBeVisible();
	const bounds = (await control.boundingBox())!;
	expect(bounds.width).toBeGreaterThanOrEqual(44);
	expect(bounds.height).toBeGreaterThanOrEqual(44);
}

test("a multiline reply with photos stays usable in short, landscape and enlarged mobile layouts", async ({
	browser,
}) => {
	const peer = makeUser("MobilePeer");
	await register(await (await browser.newContext()).newPage(), peer);
	const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
	const page = await context.newPage();
	await register(page, makeUser("MobileWriter"));
	await startDirectChat(page, peer);
	await sendMessage(page, "A message to answer");
	const row = page.locator("[data-message-interaction-row]").filter({ hasText: "A message to answer" });
	const messageActions = row.getByRole("button", { name: "Message actions", exact: true });
	// The optimistic row has no actions and is replaced on acknowledgement.
	// Wait for that replacement before a touch grants this row focus.
	await expect(messageActions).toBeAttached();
	await row.getByText("A message to answer", { exact: true }).tap();
	await expect(row).toBeFocused();
	await messageActions.tap();
	await page.getByRole("menuitem", { name: "Reply", exact: true }).tap();
	await expect(page.getByRole("button", { name: "Cancel reply", exact: true })).toBeVisible();

	const field = page.getByRole("textbox", { name: "Message", exact: true });
	const draft = "Tiếng Việt nhiều dòng\n".repeat(12).trim();
	const emptyHeight = (await field.boundingBox())!.height;
	await field.fill(draft);
	await expect.poll(async () => (await field.boundingBox())!.height).toBeGreaterThan(emptyHeight);
	const png = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
		"base64",
	);
	await page.locator('main input[type="file"][multiple]').setInputFiles([
		{ name: "first.png", mimeType: "image/png", buffer: png },
		{ name: "second.png", mimeType: "image/png", buffer: png },
	]);
	await expect(page.getByAltText(/Attached image preview/)).toHaveCount(2);
	for (const viewport of [
		{ width: 375, height: 812 },
		{ width: 375, height: 360 },
		{ width: 667, height: 320 },
	]) {
		await page.setViewportSize(viewport);
		await expectUsableComposer(page);
		await expect(field).toHaveValue(draft);
		await expectTouchTarget(page.getByRole("button", { name: "Send message", exact: true }));
		await expectTouchTarget(page.getByRole("button", { name: "Insert an emoji", exact: true }));
		await expectTouchTarget(page.getByRole("button", { name: "Add an attachment", exact: true }));
		await expectTouchTarget(page.getByRole("button", { name: "Cancel reply", exact: true }));
		await expectTouchTarget(page.getByRole("button", { name: "Remove attached image 1", exact: true }));
		await expect.poll(() => field.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
	}
	await page.setViewportSize({ width: 375, height: 667 });
	await page.evaluate(() => (document.documentElement.style.fontSize = "24px"));
	await expectUsableComposer(page);
	await page.getByRole("button", { name: "Remove attached image 1", exact: true }).tap();
	await expect(page.getByAltText(/Attached image preview/)).toHaveCount(1);
	await expect(field).toHaveValue(draft);
	await expect(page.getByRole("button", { name: "Cancel reply", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Cancel reply", exact: true }).tap();
	await expect(field).toHaveValue(draft);
	await expect(page.getByAltText(/Attached image preview/)).toHaveCount(1);
});

test("an overlaid keyboard follows the visual viewport without shrinking the app during pinch zoom", async ({
	browser,
}) => {
	const peer = makeUser("KeyboardPeer");
	await register(await (await browser.newContext()).newPage(), peer);
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
	const page = await context.newPage();
	await register(page, makeUser("KeyWriter"));
	await startDirectChat(page, peer);
	const field = page.getByRole("textbox", { name: "Message", exact: true });
	await field.fill("Draft stays through keyboard changes");
	await field.focus();
	// Browser automation cannot open a real OS keyboard. Keep the layout viewport
	// tall and reproduce only its observable VisualViewport resize and pan events.
	await page.evaluate(() => {
		const viewport = window.visualViewport!;
		Object.defineProperties(viewport, {
			height: { configurable: true, value: 340 },
			offsetTop: { configurable: true, value: 36 },
		});
		viewport.dispatchEvent(new Event("resize"));
		viewport.dispatchEvent(new Event("scroll"));
	});
	await expectUsableComposer(page);
	await expect.poll(async () => (await page.locator(".chat-shell").boundingBox())!.height).toBe(340);
	await expect(field).toHaveValue("Draft stays through keyboard changes");
	await page.evaluate(() => {
		const viewport = window.visualViewport!;
		Object.defineProperties(viewport, {
			height: { configurable: true, value: 170 },
			scale: { configurable: true, value: 2 },
		});
		viewport.dispatchEvent(new Event("resize"));
	});
	await expect.poll(async () => (await page.locator(".chat-shell").boundingBox())!.height).toBe(340);
	await page.evaluate(() => {
		const viewport = window.visualViewport!;
		Object.defineProperties(viewport, {
			height: { configurable: true, value: 844 },
			offsetTop: { configurable: true, value: 0 },
			scale: { configurable: true, value: 1 },
		});
		viewport.dispatchEvent(new Event("resize"));
	});
	await expectUsableComposer(page);
	await expect.poll(async () => (await page.locator(".chat-shell").boundingBox())!.height).toBe(844);
	await expect(field).toHaveValue("Draft stays through keyboard changes");
});
