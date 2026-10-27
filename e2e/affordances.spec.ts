import { expect, test } from "@playwright/test";
import { makeUser, register, startDirectChat } from "./helpers.js";

/**
 * The affordances that only exist in a computed style.
 *
 * Tailwind v3's Preflight set `cursor: pointer` on every `<button>`; v4's does
 * not. The upgrade therefore gave the entire app an arrow cursor on everything
 * clickable, and nothing caught it: the markup is unchanged, every unit test
 * still clicks the button it means, and the rest of this suite drives elements
 * by role rather than by how they look under a mouse. A person using the app
 * reported it, which is the slowest feedback loop there is.
 *
 * The assertions are on `getComputedStyle`, and they are here rather than in a
 * unit test because jsdom applies no stylesheet — the same test in jsdom would
 * pass with the class missing, the CSS unbuilt, or Tailwind uninstalled.
 *
 * Every button is checked rather than a named few. A test naming three buttons
 * proves three buttons; the regression was global, and so is the guarantee.
 */
test.describe("affordances", () => {
	test("every enabled button says it is clickable", async ({ browser }) => {
		const mai = makeUser("Mai");
		const linh = makeUser("Linh");
		const maiContext = await browser.newContext();
		const linhContext = await browser.newContext();
		const maiPage = await maiContext.newPage();
		const linhPage = await linhContext.newPage();

		await register(linhPage, linh);
		await register(maiPage, mai);
		// A conversation on screen, so the composer and the message actions are
		// mounted too rather than only the empty state's handful of controls.
		await startDirectChat(maiPage, linh);

		const cursors = await maiPage.evaluate(() =>
			Array.from(document.querySelectorAll("button"))
				.filter((button) => !button.disabled && button.offsetParent !== null)
				.map((button) => ({
					name: button.getAttribute("aria-label") ?? button.textContent?.trim().slice(0, 30) ?? "",
					cursor: getComputedStyle(button).cursor,
				})),
		);

		expect(cursors.length).toBeGreaterThan(3);
		expect(cursors.filter((entry) => entry.cursor !== "pointer" && entry.cursor !== "zoom-in")).toEqual([]);
	});

	test("a disabled button still says it is not clickable", async ({ page }) => {
		const user = makeUser("Mai");
		await register(page, user);

		// `cursor-pointer` and `disabled:cursor-not-allowed` sit on the same
		// component, and a careless merge of the two would leave every dead button
		// claiming to be pressable. Save is disabled until something changes.
		await page.getByLabel("Account settings").click();
		const save = page.getByRole("button", { name: "Save changes" });
		await expect(save).toBeDisabled();
		await expect.poll(() => save.evaluate((element) => getComputedStyle(element).cursor)).toBe("not-allowed");
	});

	test("tabbing into the conversation search shows where focus went", async ({ browser }) => {
		const mai = makeUser("Mai");
		const linh = makeUser("Linh");
		const maiContext = await browser.newContext();
		const linhContext = await browser.newContext();
		const maiPage = await maiContext.newPage();
		const linhPage = await linhContext.newPage();

		await register(linhPage, linh);
		await register(maiPage, mai);
		await startDirectChat(maiPage, linh);

		await maiPage.getByRole("button", { name: "Search in conversation" }).click();
		const field = maiPage.getByRole("textbox", { name: "Search in conversation" });
		// Compared as painted pixels, not strings: the bar's colour-mix serialises as
		// oklab() and the text as rgb(), and engines differ in which they report.
		const toPixel = (colour: string) =>
			maiPage.evaluate((value) => {
				const context = document.createElement("canvas").getContext("2d")!;
				context.fillStyle = value;
				context.fillRect(0, 0, 1, 1);

				return Array.from(context.getImageData(0, 0, 1, 1).data).join(",");
			}, colour);
		const barColour = async () =>
			toPixel(await field.evaluate((element) => getComputedStyle(element.parentElement!).borderBottomColor));
		for (const theme of ["light", "dark"]) {
			await maiPage.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
			await expect(field).toBeFocused();
			const ink = await toPixel(await field.evaluate((element) => getComputedStyle(element).color));
			await expect.poll(barColour).toBe(ink);
			await field.press("Shift+Tab");
			await expect(field).not.toBeFocused();
			await expect.poll(barColour).not.toBe(ink);
			await maiPage.keyboard.press("Tab");
			await expect(field).toBeFocused();
			await expect.poll(barColour).toBe(ink);
		}
		await maiContext.close();
		await linhContext.close();
	});
});
