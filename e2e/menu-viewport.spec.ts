import { expect, test, type Locator, type Page } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

/** XP-13: a menu opened from any edge stays whole inside the viewport. */
async function expectInside(page: Page, label: string, menu: Locator) {
	await expect(menu).toBeVisible();
	const box = (await menu.boundingBox())!;
	const view = page.viewportSize()!;
	expect(
		box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height,
		`${label}: ${JSON.stringify(box)} in ${view.width}x${view.height}`,
	).toBe(true);
	await page.keyboard.press("Escape");
}

test("message, reaction and sidebar menus stay inside the viewport at every edge", async ({ browser }) => {
	test.setTimeout(180_000);
	const peer = makeUser("MenuPeer");
	await register(await (await browser.newContext()).newPage(), peer);
	for (const viewport of [
		{ width: 1280, height: 800 },
		{ width: 1024, height: 560 },
	]) {
		const page = await (await browser.newContext({ viewport })).newPage();
		await register(page, makeUser("MenuMe"));
		await startDirectChat(page, peer);
		for (let i = 0; i < 14; i++) await sendMessage(page, `Line ${i} ${"lorem ipsum ".repeat(i % 3 === 0 ? 8 : 1)}`);
		const history = page.getByLabel("Message history");
		await expect(history.getByText(/^Line 13/u)).toBeVisible({ timeout: 15_000 });

		const last = history.getByText(/^Line 13/u);
		await last.hover();
		await page.getByLabel("Message actions").last().click();
		await expectInside(page, `${viewport.width} bottom message actions`, page.getByRole("menu").last());
		await last.hover();
		await page.getByLabel("React to message").last().click();
		await expectInside(page, `${viewport.width} bottom reactions`, page.getByRole("menu").last());

		const top = history.locator("[id^='message-']").first();
		await history.evaluate((element) => {
			element.scrollTop = 0;
		});
		await top.hover();
		await top.getByLabel("Message actions").click();
		await expectInside(page, `${viewport.width} top message actions`, page.getByRole("menu").last());

		const row = page.locator("aside li").first();
		await row.hover();
		await page.getByRole("button", { name: "Conversation actions" }).first().click();
		await expectInside(page, `${viewport.width} sidebar row actions`, page.getByRole("menu").last());
	}
});
