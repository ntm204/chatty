import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, startDirectChat } from "./helpers.js";

test("signing out removes private drafts before another participant uses the same browser", async ({ browser }) => {
	const writer = makeUser("PrivateWriter");
	const reader = makeUser("PrivateReader");
	const context = await browser.newContext({ reducedMotion: "reduce" });
	const peerContext = await browser.newContext({ reducedMotion: "reduce" });
	try {
		const page = await context.newPage();
		const peerPage = await peerContext.newPage();
		await register(peerPage, reader);
		await register(page, writer);
		await startDirectChat(page, reader);
		await page.getByLabel("Message", { exact: true }).fill("Private unsent words");
		await page.getByLabel("Sign out").click();
		await page.getByLabel("Email").fill(reader.email);
		await page.getByLabel("Password").fill(reader.password);
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		await openConversationWith(page, writer);
		await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
		await expect(page.getByText("Private unsent words")).toHaveCount(0);
		expect(
			await page.evaluate(() =>
				Object.keys(localStorage)
					.filter((key) => key.startsWith("chatty:user-draft:"))
					.map((key) => localStorage.getItem(key))
					.join(""),
			),
		).not.toContain("Private unsent words");
		const input = page.getByLabel("Message", { exact: true });
		await input.fill("First line");
		await input.press("Shift+Enter");
		await input.pressSequentially("Second line");
		await expect(input).toHaveValue("First line\nSecond line");
		await input.press("Enter");
		await expect(input).toHaveValue("");
		await page.setViewportSize({ width: 375, height: 760 });
		await input.fill(Array.from({ length: 20 }, () => "Long multiline draft").join("\n"));
		expect((await input.boundingBox())?.height).toBeLessThanOrEqual(160);
		await expect(page.getByRole("button", { name: "Send message" })).toBeInViewport();
	} finally {
		await context.close();
		await peerContext.close();
	}
});

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
