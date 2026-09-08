import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, startDirectChat } from "./helpers.js";

test("row actions dismiss naturally and chat themes preview, sync and persist", async ({ browser }) => {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const peerContext = await browser.newContext();
	const page = await context.newPage();
	const peer = await peerContext.newPage();
	const user = makeUser("ThemeReader");
	const other = makeUser("ThemePeer");
	await register(peer, other);
	await register(page, user);
	await startDirectChat(page, other);
	await openConversationWith(peer, user);

	const actions = page.getByRole("button", { name: "Conversation actions" });
	await page.getByRole("textbox", { name: "Message", exact: true }).hover();
	await expect(actions).toHaveCSS("opacity", "0");
	await page.locator(".conversation-row").focus();
	await page.keyboard.press("Tab");
	await expect(actions).toBeFocused();
	await expect(actions).toHaveCSS("opacity", "1");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("menu")).toBeVisible();
	await actions.click();
	await expect(page.getByRole("menu")).toHaveCount(0);
	await actions.click();
	await page.keyboard.press("Escape");
	await expect(actions).toBeFocused();
	await actions.click();
	await page.getByRole("menuitem").last().focus();
	await page.keyboard.press("Tab");
	await expect(page.getByRole("menu")).toHaveCount(0);

	const history = page.getByLabel("Message history");
	const initialBackground = await history.evaluate((element) => getComputedStyle(element).backgroundImage);
	await page.getByLabel("Conversation storage and details").click();
	await page.getByRole("button", { name: /Theme: Default/ }).click();
	const dialog = page.getByRole("dialog", { name: "Chat theme" });
	await dialog.getByRole("button", { name: "Iris", exact: true }).click();
	await expect(page.getByRole("region", { name: "Conversation", exact: true })).toHaveAttribute(
		"data-conversation-theme",
		"default",
	);
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await page.getByRole("button", { name: /Theme: Default/ }).click();
	await expect(dialog.getByRole("button", { name: "Default theme" })).toHaveAttribute("aria-pressed", "true");
	await dialog.getByRole("button", { name: "Iris", exact: true }).click();
	await page.screenshot({ path: "/tmp/chatty-theme-picker-light.png" });
	await dialog.getByRole("button", { name: "Apply theme" }).click();
	await expect(dialog).toHaveCount(0);
	for (const participant of [page, peer]) {
		await expect(participant.getByRole("region", { name: "Conversation", exact: true })).toHaveAttribute(
			"data-conversation-theme",
			"iris",
		);
	}
	expect(await history.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe(initialBackground);
	await page.reload();
	await openConversationWith(page, other);
	await expect(page.getByRole("region", { name: "Conversation", exact: true })).toHaveAttribute(
		"data-conversation-theme",
		"iris",
	);
	await page.emulateMedia({ colorScheme: "dark" });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByLabel("Conversation storage and details").click();
	await page.getByRole("button", { name: /Theme: Iris/ }).click();
	await expect(dialog.getByRole("button", { name: "Apply theme" })).toBeInViewport({ ratio: 1 });
	await expect(dialog.getByRole("button", { name: "Fern", exact: true })).toBeInViewport({ ratio: 1 });
	await page.screenshot({ path: "/tmp/chatty-theme-picker-phone-dark.png" });
	await dialog.getByRole("button", { name: "Default theme" }).click();
	await dialog.getByRole("button", { name: "Apply theme" }).click();
	await expect(peer.getByRole("region", { name: "Conversation", exact: true })).toHaveAttribute(
		"data-conversation-theme",
		"default",
	);
	await context.close();
	await peerContext.close();
});
