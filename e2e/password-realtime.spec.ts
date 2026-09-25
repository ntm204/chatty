import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("changing a password keeps the open thread connected in both directions", async ({ browser }) => {
	const authorContext = await browser.newContext();
	const peerContext = await browser.newContext();
	try {
		const page = await authorContext.newPage();
		const peerPage = await peerContext.newPage();
		const author = makeUser("NewSecret");
		const peer = makeUser("LivePeer");
		await register(page, author);
		await register(peerPage, peer);
		await startDirectChat(page, peer);
		await openConversationWith(peerPage, author);
		await sendMessage(peerPage, "Before password change");
		await expect(page.getByLabel("Message history").getByText("Before password change")).toBeVisible();
		await page.getByLabel("Account settings").click();
		await page.getByRole("button", { name: "Password", exact: true }).click();
		await page.getByLabel("Current password").fill(author.password);
		await page.getByLabel("New password", { exact: true }).fill("ReplacementSecret456");
		await page.getByLabel("Confirm new password").fill("ReplacementSecret456");
		await page.getByRole("button", { name: "Change password" }).click();
		await expect(page.getByText(/Password changed\./)).toBeVisible();
		await page.getByRole("button", { name: "Close settings" }).click();
		await sendMessage(peerPage, "After password change");
		await expect(page.getByLabel("Message history").getByText("After password change")).toBeVisible();
		await sendMessage(page, "Reply with the replacement session");
		await expect(
			peerPage.getByLabel("Message history").getByText("Reply with the replacement session"),
		).toBeVisible();
	} finally {
		await authorContext.close();
		await peerContext.close();
	}
});
