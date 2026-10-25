import { expect, test } from "@playwright/test";
import { makeUser, register } from "./helpers.js";

test("profile validation and a failed save preserve the edits and allow a deliberate retry", async ({ page }) => {
	await register(page, makeUser("ProfileFix"));
	await page.getByLabel("Account settings").click();
	const dialog = page.getByRole("dialog");
	const name = dialog.getByLabel("Display name", { exact: true });
	const handle = dialog.getByLabel("Handle", { exact: true });
	const originalHandle = await handle.inputValue();
	await name.fill("");
	await handle.fill("!");
	await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(name).toBeFocused();
	await expect(name).toHaveAttribute("aria-invalid", "true");
	await name.fill("My updated name");
	await expect(name).not.toHaveAttribute("aria-invalid", "true");
	await expect(handle).toHaveAttribute("aria-invalid", "true");
	await handle.fill(originalHandle);

	let releaseSave!: () => void;
	const saveGate = new Promise<void>((resolve) => {
		releaseSave = resolve;
	});
	let saveCount = 0;
	await page.route("**/users/me", async (route) => {
		if (route.request().method() !== "PATCH") return route.continue();
		saveCount++;
		await saveGate;
		await route.fulfill({
			status: 503,
			contentType: "application/json",
			body: JSON.stringify({ error: "Please try saving again." }),
		});
	});
	await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect.poll(() => saveCount).toBe(1);
	await expect(name).toBeDisabled();
	await expect(handle).toBeDisabled();
	await expect(dialog.getByRole("checkbox", { name: /Send read receipts/ })).toBeDisabled();
	await expect(dialog.getByRole("radio", { name: "Everyone" })).toBeDisabled();
	await expect(dialog.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
	releaseSave();
	await expect(dialog.getByRole("alert")).toBeVisible();
	await expect(name).toBeEnabled();
	await expect(name).toHaveValue("My updated name");
	await expect(dialog.getByText("Profile saved", { exact: true })).toHaveCount(0);
	await page.unroute("**/users/me");
	await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(dialog.getByRole("status")).toHaveText("Profile saved");
	await dialog.getByRole("button", { name: "Close settings", exact: true }).click();
	await expect(page.getByRole("complementary").getByText("My updated name", { exact: true })).toBeVisible();
});
