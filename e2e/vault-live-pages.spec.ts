import { expect, test } from "@playwright/test";
import { makeUser, register, startDirectChat } from "./helpers.js";

test("vault retains loaded link pages and reading position across live retraction and category return", async ({
	browser,
}) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	const page = await context.newPage();
	const peer = makeUser("VaultPages");
	await register(await peerContext.newPage(), peer);
	await register(page, makeUser("VaultReader"));
	await startDirectChat(page, peer);
	const seeded = await page.evaluate(async () => {
		const headers = {
			Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
			"Content-Type": "application/json",
		};
		const conversations = await (await fetch("http://localhost:4100/conversations", { headers })).json();
		const conversationId = conversations.items[0].id as string;
		let newestId = "";
		for (let index = 0; index < 45; index++) {
			const response = await fetch(`http://localhost:4100/conversations/${conversationId}/messages`, {
				method: "POST",
				headers,
				body: JSON.stringify({ content: `https://example.com/vault-page-${index}` }),
			});
			if (!response.ok) throw new Error("Seed link failed");
			newestId = (await response.json()).id;
		}
		return { conversationId, newestId };
	});
	await page.getByRole("button", { name: "Conversation storage and details" }).click();
	const vault = page.getByRole("complementary", { name: "Conversation details" });
	await vault.getByRole("button", { name: "Media, files and links" }).click();
	await vault.getByRole("button", { name: "Links, 45" }).click();
	await vault.getByText("https://example.com/vault-page-44", { exact: true }).evaluate((element) => {
		let parent = element.parentElement;
		while (parent && getComputedStyle(parent).overflowY !== "auto") parent = parent.parentElement;
		if (!parent) throw new Error("Vault scroll container missing");
		parent.scrollTop = parent.scrollHeight;
	});
	const oldest = vault.getByText("https://example.com/vault-page-0", { exact: true });
	await expect(oldest).toHaveCount(1);
	await oldest.evaluate((element) => {
		let parent = element.parentElement;
		while (parent && getComputedStyle(parent).overflowY !== "auto") parent = parent.parentElement;
		if (!parent) throw new Error("Vault scroll container missing");
		parent.scrollTop = 500;
	});
	const readingLink = vault.getByText("https://example.com/vault-page-38", { exact: true });
	const readingTop = (await readingLink.boundingBox())!.y;
	await page.evaluate(async ({ conversationId, newestId }) => {
		const response = await fetch(`http://localhost:4100/conversations/${conversationId}/messages/${newestId}`, {
			method: "DELETE",
			headers: { Authorization: `Bearer ${localStorage.getItem("chatty:token")}` },
		});
		if (!response.ok) throw new Error("Retract link failed");
	}, seeded);
	await expect(vault.getByText("https://example.com/vault-page-44", { exact: true })).toHaveCount(0);
	await expect(vault.getByText("Loading more…", { exact: true })).toHaveCount(0);
	await expect(oldest).toHaveCount(1);
	await expect.poll(async () => Math.abs((await readingLink.boundingBox())!.y - readingTop)).toBeLessThan(2);
	await vault.getByRole("tab", { name: "Media", exact: true }).click();
	await vault.getByRole("tab", { name: "Links", exact: true }).click();
	await expect(oldest).toHaveCount(1);
	await expect.poll(async () => Math.abs((await readingLink.boundingBox())!.y - readingTop)).toBeLessThan(2);
	await vault.getByRole("button", { name: "Back to conversation details" }).click();
	await expect(vault.getByRole("button", { name: "Links, 44" })).toBeVisible();
	await context.close();
	await peerContext.close();
});
