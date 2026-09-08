import { expect, test } from "@playwright/test";
import { makeUser, register } from "./helpers.js";

test("invalid fields retain their error treatment while focused in either theme", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 390, height: 844 });
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme });
		await page.goto("/login");
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		const email = page.getByRole("textbox", { name: "Email", exact: true });
		await email.focus();
		await expect(email).toHaveAttribute("aria-invalid", "true");
		await expect
			.poll(() =>
				email.evaluate((element) => {
					const error = document.getElementById(element.getAttribute("aria-describedby")!)!;
					return getComputedStyle(element).borderColor === getComputedStyle(error).color;
				}),
			)
			.toBe(true);
		await expect(page.getByText("Email is required", { exact: true })).toHaveCSS("text-transform", "none");
		await page.screenshot({ path: `/tmp/chatty-polish-errors-${colorScheme}.png`, animations: "disabled" });
	}
});

test("the branded welcome leads to search and mobile settings keep their content reachable", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 1440, height: 900 });
	await register(page, makeUser("Studio"));
	await page.getByRole("button", { name: "Start a conversation" }).click();
	await expect(page.getByLabel("Find someone")).toBeFocused();
	await page.getByRole("button", { name: "Find your people" }).click();
	await expect(page.getByLabel("Find someone")).toBeFocused();
	await page.screenshot({ path: "/tmp/chatty-polish-welcome.png", animations: "disabled" });
	await page.getByLabel("Account settings").click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await page.screenshot({ path: "/tmp/chatty-polish-settings-desktop.png", animations: "disabled" });
	await page.setViewportSize({ width: 390, height: 640 });
	await page.getByRole("button", { name: "Appearance", exact: true }).click();
	await page.getByRole("radio", { name: /Dark/ }).click();
	await expect(page.getByRole("button", { name: "Close settings" })).toBeInViewport({ ratio: 1 });
	const dialog = page.getByRole("dialog");
	expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
	await page.screenshot({ path: "/tmp/chatty-polish-settings-phone.png", animations: "disabled" });
	await page.getByRole("button", { name: "Profile", exact: true }).click();
	await page.getByLabel("Display name", { exact: true }).fill("Studio, refined");
	await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
	await page.getByRole("button", { name: "Save changes" }).focus();
	await expect(page.getByRole("button", { name: "Save changes" })).toBeInViewport({ ratio: 1 });
});
