import { expect, test } from "@playwright/test";
import { makeUser, register } from "./helpers.js";

/**
 * What only a browser can prove about the theme.
 *
 * The store is three functions and a `localStorage` key, and a unit test of it
 * would pass with the stylesheet missing, the attribute misspelled, or the
 * `<head>` script never loading. All three are the whole feature.
 *
 * The reload is the important half. `public/theme.js` exists solely so a dark
 * reader does not get a white flash on every navigation, and it is a separate
 * file rather than an inline script because the Content-Security-Policy sets
 * `script-src 'self'` — so it is also the piece most likely to break silently,
 * by 404ing or by being blocked, in a way nothing else here would notice.
 */
test.describe("appearance", () => {
	test("system tracks changes live and reduced motion retains selected state", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
		await register(page, makeUser("SystemTheme"));
		await page.getByLabel("Account settings").click();
		await page.getByRole("button", { name: "Appearance" }).click();
		await page.getByRole("radio", { name: /System/ }).click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await expect(page.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "true");
		await page.reload();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	});
	test("dark applies immediately and survives a reload", async ({ page }) => {
		const user = makeUser("Noor");
		await register(page, user);

		// Whatever the runner's OS prefers, "System" resolves to one of two
		// concrete values and the attribute is never absent.
		await expect(page.locator("html")).toHaveAttribute("data-theme", /^(light|dark)$/);

		await page.getByLabel("Account settings").click();
		await page.getByRole("button", { name: "Appearance" }).click();
		await page.getByRole("radio", { name: /Dark/ }).click();

		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		// The stylesheet, not just the attribute: the tokens have to have actually
		// swapped, which an attribute assertion alone would not show.
		const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

		await page.reload();

		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await expect
			.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
			.toBe(darkBackground);
	});

	test("light is a decision the system preference does not overrule", async ({ page }) => {
		const user = makeUser("Otis");
		await register(page, user);

		await page.emulateMedia({ colorScheme: "dark" });
		await page.getByLabel("Account settings").click();
		await page.getByRole("button", { name: "Appearance" }).click();
		await page.getByRole("radio", { name: /Light/ }).click();

		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

		// The OS says dark and the reader said light. The reader wins, on this load
		// and on the next one — which is the bug a `prefers-color-scheme` media
		// query alone would have.
		await page.reload();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
	});

	test("a chosen palette colours the signed-in app only; the sign-in screens keep the default", async ({ page }) => {
		const user = makeUser("PaletteReader");
		await register(page, user);
		await page.getByLabel("Account settings").click();
		await page.getByRole("button", { name: /Appearance/ }).click();
		await page.getByRole("radio", { name: /Clay/ }).click();
		await expect(page.locator("html")).toHaveAttribute("data-palette", "clay");

		await page.keyboard.press("Escape");
		await page.getByLabel("Sign out").click();
		await expect(page.getByLabel("Password")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("data-palette", "ink");
		// Also before the app loads: the pre-paint script sees no session.
		await page.reload();
		await expect(page.locator("html")).toHaveAttribute("data-palette", "ink");

		// The welcome plays on a fresh load; skip it, as the register helper does.
		await page
			.getByRole("button", { name: "Skip intro" })
			.evaluateAll((buttons) => (buttons[0] as HTMLButtonElement | undefined)?.click());
		await page.getByLabel("Email").fill(user.email);
		await page.getByLabel("Password").fill(user.password);
		await page.getByRole("button", { name: "Sign in" }).click();
		await expect(page.getByLabel("Find someone")).toBeVisible({ timeout: 15_000 });
		await expect(page.locator("html")).toHaveAttribute("data-palette", "clay");
	});
});
