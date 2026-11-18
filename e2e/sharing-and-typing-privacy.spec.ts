import { expect, test, type Page } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

async function openPrivacy(page: Page) {
	await page.getByLabel("Account settings").click();
	const settings = page.getByRole("dialog");
	await settings.getByRole("button", { name: "Privacy" }).click();

	return settings;
}

test("turning off forwarding and typing applies to both people at once", async ({ browser }) => {
	test.setTimeout(60_000);
	const minhContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const anContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
	const minhPage = await minhContext.newPage();
	const anPage = await anContext.newPage();
	const minh = makeUser("Minh");
	const an = makeUser("An");
	await register(anPage, an);
	await register(minhPage, minh);
	await startDirectChat(minhPage, an);
	await openConversationWith(anPage, minh);
	await sendMessage(minhPage, "Written before the change");
	const theirMessage = anPage.getByLabel("Message history").getByText("Written before the change");
	await expect(theirMessage).toBeVisible();

	// Before: An can forward Minh's message.
	await theirMessage.hover();
	await anPage.getByRole("button", { name: "Message actions" }).first().click();
	await expect(anPage.getByRole("menuitem", { name: "Forward" })).toBeVisible();
	await anPage.keyboard.press("Escape");

	// Minh turns forwarding off; it covers the message already sent.
	const settings = await openPrivacy(minhPage);
	await settings.getByRole("button", { name: /^Forwarding/ }).click();
	await settings.getByRole("switch", { name: "Allow forwarding" }).click();
	await expect(settings.getByRole("switch", { name: "Allow forwarding" })).toHaveAttribute("aria-checked", "false");
	await settings.getByRole("button", { name: "Back to privacy" }).click();
	await expect(settings.getByRole("button", { name: "Forwarding, Off" })).toBeVisible();
	await settings.getByRole("button", { name: /^Typing indicator/ }).click();
	await settings.getByRole("switch", { name: "Typing indicator" }).click();
	await expect(settings.getByRole("switch", { name: "Typing indicator" })).toHaveAttribute("aria-checked", "false");
	await minhPage.getByRole("button", { name: "Close settings" }).click();
	await minhPage.getByLabel("Conversation storage and details").click();
	await minhPage.getByRole("button", { name: "Privacy & support" }).click();

	// No reload: the change reaches the message already on An's screen live.
	await theirMessage.hover();
	await anPage.getByRole("button", { name: "Message actions" }).first().click();
	await expect(anPage.getByRole("menu")).toBeVisible();
	await expect(anPage.getByRole("menuitem", { name: "Forward" })).toHaveCount(0);
	await anPage.keyboard.press("Escape");

	// Typing is hidden both ways while Minh's is off.
	await minhPage.getByLabel("Message", { exact: true }).pressSequentially("typing quietly", { delay: 30 });
	await expect(anPage.getByText(`${minh.displayName} is typing…`)).toHaveCount(0);
	await anPage.getByLabel("Message", { exact: true }).pressSequentially("typing openly", { delay: 30 });
	await anPage.waitForTimeout(1_000);
	await expect(minhPage.getByText(`${an.displayName} is typing…`)).toHaveCount(0);

	// The chat-wide switch: An turns forwarding off for everyone's messages here.
	await anPage.getByLabel("Message", { exact: true }).fill("");
	await anPage.getByLabel("Message", { exact: true }).fill("An's own words");
	await anPage.getByLabel("Message", { exact: true }).press("Enter");
	await anPage.getByLabel("Conversation storage and details").click();
	await anPage.getByRole("button", { name: "Privacy & support" }).click();
	await anPage.getByRole("switch", { name: "Allow forwarding in this chat" }).click();
	for (const page of [anPage, minhPage]) {
		await expect(
			page.getByLabel("Message history").getByText(`${an.displayName} turned off forwarding in this chat`),
		).toBeVisible();
	}
	const ownWords = minhPage.getByLabel("Message history").getByText("An's own words");
	await ownWords.hover();
	await minhPage.getByRole("button", { name: "Message actions" }).last().click();
	await expect(minhPage.getByRole("menu")).toBeVisible();
	await expect(minhPage.getByRole("menuitem", { name: "Forward" })).toHaveCount(0);
});
