import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { E2E_DATABASE_URL } from "./database.js";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("an edit expiring while open keeps its text available to copy", async ({ browser, browserName }) => {
	test.setTimeout(60_000);
	const prisma = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
	// Only Chromium gates keyboard copy/paste behind these; WebKit rejects the names.
	const context = await browser.newContext({
		permissions: browserName === "chromium" ? ["clipboard-read", "clipboard-write"] : [],
	});
	const peerContext = await browser.newContext();
	try {
		const page = await context.newPage();
		const peerPage = await peerContext.newPage();
		const author = makeUser("ExpiryAuthor");
		const peer = makeUser("ExpiryReader");
		await register(peerPage, peer);
		await register(page, author);
		await startDirectChat(page, peer);
		const sentResponsePromise = page.waitForResponse(
			(response) => response.request().method() === "POST" && /\/messages$/.test(response.url()),
		);
		await sendMessage(page, "Keep the original message");
		const sent = await (await sentResponsePromise).json();
		await openConversationWith(peerPage, author);
		await expect(peerPage.getByLabel("Message history").getByText("Keep the original message")).toBeVisible();

		// Only this test's message is backdated in the disposable E2E database.
		// Browser and API clocks stay real so the server must reject the expired edit.
		const expiresAt = new Date(Date.now() + 20_000);
		await prisma.message.update({
			where: { id: sent.id },
			data: { createdAt: new Date(expiresAt.getTime() - 8 * 60 * 60 * 1000) },
		});
		await page.reload();
		const historyResponsePromise = page.waitForResponse(
			(response) => response.request().method() === "GET" && /\/messages(?:\?|$)/.test(response.url()),
		);
		await openConversationWith(page, peer);
		await historyResponsePromise;
		await page.getByLabel("Message actions").click();
		await page.getByRole("menuitem", { name: "Edit message", exact: true }).click();
		const editor = page.getByRole("textbox", { name: "Edit message", exact: true });
		const draft = "Đã chỉnh sửa\nKeep this second line for a new message";
		await editor.fill(draft);
		expect(Date.now()).toBeLessThan(expiresAt.getTime());
		await expect
			.poll(() => Date.now(), { timeout: 25_000, intervals: [250] })
			.toBeGreaterThanOrEqual(expiresAt.getTime());

		const editResponsePromise = page.waitForResponse(
			(response) => response.request().method() === "PATCH" && response.url().includes(`/messages/${sent.id}`),
		);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		expect((await editResponsePromise).status()).toBe(400);
		await expect(page.getByRole("alert")).toHaveText("Messages can only be edited for 8 hours");
		await expect(editor).toHaveValue(draft);
		await expect(editor).toBeEditable();
		await expect(peerPage.getByLabel("Message history").getByText("Keep the original message")).toBeVisible();
		expect((await prisma.message.findUniqueOrThrow({ where: { id: sent.id } })).content).toBe(
			"Keep the original message",
		);
		expect(await prisma.messageEdit.count({ where: { messageId: sent.id } })).toBe(0);

		await editor.focus();
		await editor.press("ControlOrMeta+A");
		await editor.press("ControlOrMeta+C");
		await page.getByRole("button", { name: "Cancel", exact: true }).click();
		const composer = page.getByRole("textbox", { name: "Message", exact: true });
		await composer.focus();
		await composer.press("ControlOrMeta+V");
		await expect(composer).toHaveValue(draft);
		await page.getByLabel("Message actions").click();
		await expect(page.getByRole("menuitem", { name: "Edit message", exact: true })).toHaveCount(0);
	} finally {
		await context.close();
		await peerContext.close();
		await prisma.$disconnect();
	}
});
