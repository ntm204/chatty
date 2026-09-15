import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("a failed local save is visible and the message survives until a successful retry", async ({ browser }) => {
	const context = await browser.newContext();
	await context.addInitScript(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
			if (this.name === "outbox") throw new DOMException("Quota exceeded", "QuotaExceededError");

			return put.apply(this, args);
		};
	});
	const page = await context.newPage();
	const peer = await browser.newContext();
	const peerPage = await peer.newPage();
	const peerUser = makeUser("QuotaPeer");
	await register(peerPage, peerUser);
	await register(page, makeUser("QuotaSender"));
	await startDirectChat(page, peerUser);
	await page.route("**/conversations/*/messages", async (route) => {
		if (route.request().method() === "POST") await route.abort("failed");
		else await route.continue();
	});
	await sendMessage(page, "survives storage failure");
	await expect(
		page.getByText("Some unsent messages could not be saved on this device.", { exact: false }),
	).toBeVisible();
	await expect(page.getByText("Not sent", { exact: true })).toBeVisible();
	await page.unroute("**/conversations/*/messages");
	await page.getByRole("button", { name: "Try again", exact: true }).click();
	await expect(
		page.getByText("Some unsent messages could not be saved on this device.", { exact: false }),
	).toBeHidden();
	await expect(messages(page).getByText("survives storage failure")).toHaveCount(1);
	await context.close();
	await peer.close();
});

test("retrying a file after the server committed but its response was lost does not send it twice", async ({
	browser,
}) => {
	const sender = await browser.newContext();
	const peer = await browser.newContext();
	const page = await sender.newPage();
	const peerPage = await peer.newPage();
	const senderUser = makeUser("FileRetry");
	const peerUser = makeUser("FilePeer");
	await register(peerPage, peerUser);
	await register(page, senderUser);
	await startDirectChat(page, peerUser);
	await openConversationWith(peerPage, senderUser);
	let hasLostResponse = false;
	await page.route("**/conversations/*/messages", async (route) => {
		if (route.request().method() === "POST" && !hasLostResponse) {
			hasLostResponse = true;
			const response = await route.fetch();
			expect(response.ok()).toBe(true);
			await route.abort("failed");

			return;
		}
		await route.continue();
	});
	await page
		.getByRole("main")
		.locator('input[type="file"]:not([multiple])')
		.setInputFiles({
			name: "retry-report.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("A report that must arrive once"),
		});
	await expect(page.getByRole("button", { name: "Retry file upload" })).toBeVisible();
	await expect(messages(peerPage).getByText("retry-report.txt", { exact: true })).toHaveCount(1);
	await page.getByRole("button", { name: "Retry file upload" }).click();
	await expect(page.getByRole("button", { name: "Retry file upload" })).toBeHidden();
	await peerPage.reload();
	await openConversationWith(peerPage, senderUser);
	await expect(messages(peerPage).getByText("retry-report.txt", { exact: true })).toHaveCount(1);
	await sender.close();
	await peer.close();
});
