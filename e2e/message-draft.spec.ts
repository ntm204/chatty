import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, startDirectChat } from "./helpers.js";

test("keeps separate composer drafts across switching, mobile back and reload", async ({ browser }) => {
	const writer = makeUser("DraftWriter");
	const firstPeer = makeUser("DraftFirst");
	const secondPeer = makeUser("DraftSecond");
	const writerContext = await browser.newContext();
	const peerContext = await browser.newContext();
	try {
		const page = await writerContext.newPage();
		const peerPage = await peerContext.newPage();
		await register(peerPage, firstPeer);
		await peerContext.clearCookies();
		await peerPage.evaluate(() => localStorage.clear());
		await register(peerPage, secondPeer);
		await register(page, writer);
		await startDirectChat(page, firstPeer);
		const input = page.getByLabel("Message", { exact: true });
		await input.fill("Nháp dành cho người thứ nhất");
		await expect(page.locator("aside").getByText("Draft:", { exact: true })).toBeVisible();
		await expect(page.locator("aside").getByText("Nháp dành cho người thứ nhất", { exact: true })).toBeVisible();
		await startDirectChat(page, secondPeer);
		await expect(input).toHaveValue("");
		await input.fill("Nháp người thứ hai");
		await expect(page.locator("aside").getByText("Draft:", { exact: true })).toHaveCount(2);
		await page.screenshot({ path: "/tmp/chatty-sidebar-drafts.png" });
		await openConversationWith(page, firstPeer);
		await expect(input).toHaveValue("Nháp dành cho người thứ nhất");
		await page.reload();
		await expect(page.locator("aside").getByText("Draft:", { exact: true })).toHaveCount(2);
		await openConversationWith(page, firstPeer);
		await expect(input).toHaveValue("Nháp dành cho người thứ nhất");
		await page.setViewportSize({ width: 375, height: 760 });
		await input.fill("Rời chat ngay sau khi gõ");
		await page.getByRole("button", { name: "Back to conversations" }).click();
		await openConversationWith(page, firstPeer);
		await expect(input).toHaveValue("Rời chat ngay sau khi gõ");
		await page.getByRole("button", { name: "Back to conversations" }).click();
		await openConversationWith(page, secondPeer);
		await expect(input).toHaveValue("Nháp người thứ hai");
		await input.fill("");
		await page.getByRole("button", { name: "Back to conversations" }).click();
		await expect(page.locator("aside").getByText("Draft:", { exact: true })).toHaveCount(1);
		await openConversationWith(page, firstPeer);
		await expect(input).toHaveValue("Rời chat ngay sau khi gõ");
		await input.press("Enter");
		await expect(page.getByRole("main").getByText("Rời chat ngay sau khi gõ", { exact: true })).toBeVisible();
		await expect(input).toHaveValue("");
		await page.getByRole("button", { name: "Back to conversations" }).click();
		await expect(page.locator("aside").getByText("Draft:", { exact: true })).toHaveCount(0);
	} finally {
		await writerContext.close();
		await peerContext.close();
	}
});
