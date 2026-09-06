import { expect, test } from "@playwright/test";
import { makeUser, register } from "./helpers.js";

test.describe("account", () => {
	test("a renamed profile shows up for the person who renamed it", async ({ page }) => {
		const user = makeUser("Rio");
		await register(page, user);

		await page.getByLabel("Account settings").click();
		await page.getByLabel("Display name").fill("Rio Renamed");
		await page.getByRole("button", { name: "Save changes" }).click();
		await expect(page.getByText("Profile saved")).toBeVisible();

		await page.getByRole("button", { name: "Close settings" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		// Scoped to the sidebar, and that is the assertion rather than a way of
		// dodging a strict-mode violation: the dialog carries an account chip of
		// its own, so an unscoped match would pass on the name the form had just
		// echoed back. What is being proved is that the refreshed profile reached
		// the auth store the sidebar reads from, not merely that it was returned.
		await expect(page.getByRole("complementary").getByText("Rio Renamed")).toBeVisible();
	});

	test("settings open over the chat, and /profile still deep-links to them", async ({ page }) => {
		// The point of the dialog. A settings screen that replaced the page cost
		// you the conversation you were reading to change your own display name,
		// and the URL is kept so the link a colleague sends still works.
		const user = makeUser("Uma");
		await register(page, user);

		await page.getByLabel("Account settings").click();
		await expect(page).toHaveURL(/\/profile$/);
		await expect(page.getByRole("dialog")).toBeVisible();
		// The chat is still there underneath rather than unmounted.
		await expect(page.getByLabel("Find someone")).toBeVisible();

		expect(await page.getByRole("dialog").evaluate((element) => getComputedStyle(element).animationName)).toBe(
			"none",
		);
		// Back closes the dialog, because closing it is a navigation.
		await page.goBack();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		// And a cold load of the URL lands in the same place, chat included.
		await page.goto("/profile");
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect(page.getByLabel("Find someone")).toBeVisible({ timeout: 15_000 });

		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(page).toHaveURL(/\/chat$/);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.getByLabel("Account settings").click();
		expect(await page.getByRole("dialog").evaluate((element) => getComputedStyle(element).animationName)).toBe(
			"none",
		);
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	test("a changed password is the one that works afterwards", async ({ page }) => {
		const user = makeUser("Pia");
		await register(page, user);

		await page.getByLabel("Account settings").click();
		await page.getByRole("button", { name: "Password" }).click();
		await page.getByLabel("Current password").fill(user.password);
		await page.getByLabel("New password", { exact: true }).fill("BrandNewSecret456");
		await page.getByLabel("Confirm new password").fill("BrandNewSecret456");
		await page.getByRole("button", { name: "Change password" }).click();
		await expect(page.getByText(/password changed/i)).toBeVisible();

		await page.getByRole("button", { name: "Close settings" }).click();
		await page.getByLabel("Sign out").click();

		await page.getByLabel("Email").fill(user.email);
		await page.getByLabel("Password").fill("BrandNewSecret456");
		await page.getByRole("button", { name: "Sign in" }).click();

		// The search box, not the composer: a fresh sign-in lands on the chat screen
		// with no conversation selected, so there is nothing to type into yet.
		await expect(page.getByLabel("Find someone")).toBeVisible({ timeout: 15_000 });
	});
});

test.describe("forgotten password", () => {
	test("says the same thing whether or not the address has an account", async ({ page }) => {
		// The assertion worth having a browser for. The server answers 204 either
		// way; what a user actually sees is this screen, and if it differed between
		// a registered address and an unregistered one the endpoint's whole
		// enumeration defence would be undone in the UI.
		const user = makeUser("Fay");
		await register(page, user);
		await page.getByLabel("Sign out").click();

		await page.goto("/forgot-password");
		await page.getByLabel("Email").fill(user.email);
		await page.getByRole("button", { name: "Send reset link" }).click();
		const forRegistered = await page.getByText(/if an account exists/i).textContent();

		await page.goto("/forgot-password");
		await page.getByLabel("Email").fill("definitely-nobody@chatty.test");
		await page.getByRole("button", { name: "Send reset link" }).click();
		const forUnknown = await page.getByText(/if an account exists/i).textContent();

		// Same sentence, bar the address each one echoes back.
		expect(forRegistered?.replace(user.email, "")).toBe(forUnknown?.replace("definitely-nobody@chatty.test", ""));
	});

	test("refuses a made-up reset link", async ({ page }) => {
		await page.goto("/reset-password?token=not-a-real-token");

		await page.getByLabel("New password", { exact: true }).fill("BrandNewSecret456");
		await page.getByLabel("Confirm new password").fill("BrandNewSecret456");
		await page.getByRole("button", { name: "Set new password" }).click();

		await expect(page.getByRole("alert")).toContainText(/invalid or has expired/i);
	});

	test("has nothing to submit when the link has no token at all", async ({ page }) => {
		await page.goto("/reset-password");

		await expect(page.getByText(/missing its token/i)).toBeVisible();
		await expect(page.getByRole("button", { name: "Set new password" })).toHaveCount(0);
	});
});

/**
 * The one step these specs deliberately do not cover: redeeming a real link.
 *
 * The token is mailed and only its SHA-256 is stored, so there is no way to read
 * a usable one out of the database — which is the property that makes the design
 * worth having, and the reason a browser cannot walk the last step. The
 * redemption path (single use, expiry, session invalidation, identical errors for
 * spent/expired/imaginary) is covered by twelve tests in
 * apps/server/tests/password-reset.service.test.ts, which can read the mail
 * because it is the process that sent it.
 */
