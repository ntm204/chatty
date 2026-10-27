import { expect, test } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

/**
 * XP-56: actions only the server can perform say so while offline, keep what was
 * typed, and change nothing that a reload would later contradict.
 */
test("offline server-only actions report, keep input and leave no false state", async ({ browser }) => {
	test.setTimeout(90_000);
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const peer = makeUser("OfflinePeer");
	await register(await (await browser.newContext()).newPage(), peer);
	const page = await context.newPage();
	const me = makeUser("OfflineMe");
	await register(page, me);
	await startDirectChat(page, peer);
	await sendMessage(page, "Offline action target");
	await expect(page.locator("aside").getByText("Offline action target")).toBeVisible({ timeout: 15_000 });

	// Settings is a lazy chunk. The built app's service worker caches it (see
	// production-media.spec); this dev server does not, so load it once online.
	await page.getByLabel("Account settings").click();
	await expect(page.getByLabel("Display name")).toBeVisible();
	await page.getByRole("button", { name: "Close settings" }).click();

	await context.setOffline(true);

	// A conversation setting: an actionable message, and the row is not shown as muted.
	await page.locator("aside li").first().hover();
	await page.getByRole("button", { name: "Conversation actions" }).first().click();
	await page.getByRole("menuitem", { name: "Mute" }).click();
	await page.getByRole("menuitem", { name: "8 hours" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "You're offline" }).first()).toBeVisible();
	await expect(page.getByRole("img", { name: "Muted", exact: true })).toHaveCount(0);

	// People search names the reason in sentence case instead of an empty result.
	await page.getByLabel("Find someone").fill("somebody");
	await page.getByLabel("Find someone").press("Enter");
	await expect(page.getByRole("alert").filter({ hasText: "Connect to find people." })).toBeVisible();
	await page.getByLabel("Find someone").fill("");

	// Message search does not pretend to search history it cannot reach.
	await page.getByRole("button", { name: "Search all messages" }).click();
	await page.keyboard.type("Offline");
	await expect(page.getByRole("alert").filter({ hasText: "Connect to search messages" })).toBeVisible();
	await page.keyboard.press("Escape");

	// A profile edit keeps the typed value and reports, rather than saving locally.
	await page.getByLabel("Account settings").click();
	const displayName = page.getByLabel("Display name");
	await displayName.fill("Renamed while offline");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByRole("dialog").getByRole("alert")).toContainText("You're offline");
	await expect(displayName).toHaveValue("Renamed while offline");
	await page.getByRole("button", { name: "Close settings" }).click();

	// Back online, a reload shows nothing that the offline attempts claimed.
	await context.setOffline(false);
	await page.goto("/chat");
	await expect(page.locator("aside").getByText("Offline action target")).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole("img", { name: "Muted", exact: true })).toHaveCount(0);
	await expect(page.locator("aside .sidebar-account")).toContainText(me.displayName);
	await expect(page.locator("aside .sidebar-account")).not.toContainText("Renamed while offline");
});
