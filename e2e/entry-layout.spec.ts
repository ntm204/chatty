import { expect, test } from "@playwright/test";
import { makeUser, register } from "./helpers.js";

// Screens once passed horizontal checks while the form sat below the fold and
// the welcome heading scrolled out of view. Check content bounds, not just CSS.
test("sign-in and registration fit ordinary laptop and phone viewports", async ({ page }) => {
	for (const viewport of [
		{ width: 1440, height: 800 },
		{ width: 1280, height: 650 },
		{ width: 390, height: 844 },
		{ width: 320, height: 568 },
	]) {
		await page.setViewportSize(viewport);
		for (const colorScheme of ["light", "dark"] as const) {
			await page.emulateMedia({ colorScheme });
			await page.goto("/login");
			await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
			await page.evaluate(() => document.fonts.ready);
			for (const isRegistering of [false, true]) {
				if (isRegistering) await page.getByRole("button", { name: "Get started", exact: true }).click();
				await expect(page.locator(".auth-form-card")).toBeInViewport({ ratio: 1 });
				await expect(page.locator(".auth-fields > button")).toBeInViewport({ ratio: 1 });
				const overflow = await page.evaluate(() => {
					const form = document.querySelector(".auth-form-side")!;

					return {
						pageX: document.documentElement.scrollWidth > innerWidth,
						pageY: document.documentElement.scrollHeight > innerHeight,
						formY: form.scrollHeight > form.clientHeight + 1,
					};
				});
				expect(
					overflow,
					`${viewport.width}×${viewport.height}, ${colorScheme}, register=${isRegistering}`,
				).toEqual({
					pageX: false,
					pageY: false,
					formY: false,
				});
			}
		}
	}
});

test("validation and the submit action stay reachable in a short viewport", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 420 });
	await page.goto("/login");
	await page.getByRole("button", { name: "Get started", exact: true }).click();
	await page.getByRole("button", { name: "Create account", exact: true }).click();
	await expect(page.getByLabel("Display name", { exact: true })).toHaveAttribute("aria-invalid", "true");
	await page.getByLabel("Display name", { exact: true }).fill("Layout check");
	await page.getByLabel("Password", { exact: true }).fill("password-for-layout-check");
	await page.keyboard.press("Tab");
	const submit = page.getByRole("button", { name: "Create account", exact: true });
	await expect(submit).toBeFocused();
	await expect(submit).toBeInViewport({ ratio: 1 });
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test("the chat welcome stays fully visible and does not scroll on short laptops", async ({ page }) => {
	await register(page, makeUser("Layout"));
	for (const viewport of [
		{ width: 1440, height: 800 },
		{ width: 1280, height: 650 },
		{ width: 1024, height: 480 },
	]) {
		await page.setViewportSize(viewport);
		for (const colorScheme of ["light", "dark"] as const) {
			await page.emulateMedia({ colorScheme });
			const welcome = page.getByRole("region", { name: "Welcome to your chats" });
			await expect(welcome.getByRole("heading")).toBeInViewport({ ratio: 1 });
			await expect(welcome.getByRole("button", { name: "Find your people" })).toBeInViewport({ ratio: 1 });
			expect(await welcome.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
			await welcome.hover();
			await page.mouse.wheel(0, 600);
			expect(await welcome.evaluate((element) => element.scrollTop)).toBe(0);
			expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
			await welcome.getByRole("button", { name: "Find your people" }).click();
			await expect(page.getByLabel("Find someone")).toBeFocused();
		}
	}
});
