import { expect, test } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

test("bookmarks open archived originals, paginate, survive failed removal and retract live", async ({ browser }) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	const page = await context.newPage();
	const peer = makeUser("BookmarkPeer");
	await register(await peerContext.newPage(), peer);
	await register(page, makeUser("BookAuthor"));
	await startDirectChat(page, peer);
	await sendMessage(page, "My bookmarked original");
	await page.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Bookmark message", exact: true }).click();
	await expect(page.getByLabel("Message history").getByRole("status")).toContainText("Message bookmarked.");
	const ids = await page.evaluate(async () => {
		const headers = {
			Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
			"Content-Type": "application/json",
		};
		const conversations = await (await fetch("http://localhost:4100/conversations", { headers })).json();
		const conversationId = conversations.items[0].id;
		const messages = await (
			await fetch(`http://localhost:4100/conversations/${conversationId}/messages`, { headers })
		).json();
		const originalId = messages.find(
			(message: { content: string }) => message.content === "My bookmarked original",
		).id;
		for (let index = 0; index < 21; index++) {
			const response = await fetch(`http://localhost:4100/conversations/${conversationId}/messages`, {
				method: "POST",
				headers,
				body: JSON.stringify({ content: `Bookmarked extra ${index}` }),
			});
			if (!response.ok) throw new Error("Seed message failed");
			const message = await response.json();
			const saved = await fetch(
				`http://localhost:4100/conversations/${conversationId}/messages/${message.id}/star`,
				{ method: "PUT", headers },
			);
			if (!saved.ok) throw new Error("Bookmark seed failed");
		}
		const archived = await fetch(`http://localhost:4100/conversations/${conversationId}/archive`, {
			method: "PUT",
			headers,
			body: JSON.stringify({ archived: true }),
		});
		if (!archived.ok) throw new Error("Archive failed");
		return { conversationId, originalId };
	});
	await page.reload();
	await page.getByRole("button", { name: "Bookmarked messages", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Bookmarked messages", exact: true });
	await expect(dialog.getByRole("button", { name: "More bookmarks" })).toBeVisible();
	await dialog.getByRole("button", { name: "More bookmarks" }).click();
	await expect(dialog.getByText("My bookmarked original", { exact: true })).toBeVisible();
	await dialog.getByText("My bookmarked original", { exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect(page.locator(`#message-${ids.originalId}`)).toBeVisible();
	await page.getByRole("button", { name: "Bookmarked messages", exact: true }).click();
	await page.route("**/messages/*/star", async (route) => {
		if (route.request().method() === "DELETE")
			await route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ message: "Remove failed" }),
			});
		else await route.continue();
	});
	await dialog.getByRole("button", { name: "Remove bookmark", exact: true }).first().click();
	await expect(dialog.getByRole("alert")).toContainText("Remove failed");
	await expect(dialog.getByText("Bookmarked extra 20", { exact: true })).toBeVisible();
	await page.unroute("**/messages/*/star");
	await dialog.getByRole("button", { name: "Remove bookmark", exact: true }).first().click();
	await expect(dialog.getByText("Bookmarked extra 20", { exact: true })).toHaveCount(0);
	await page.evaluate(async ({ conversationId }) => {
		const headers = { Authorization: `Bearer ${localStorage.getItem("chatty:token")}` };
		const messages = await (
			await fetch(`http://localhost:4100/conversations/${conversationId}/messages`, { headers })
		).json();
		const target = messages.find((message: { content: string }) => message.content === "Bookmarked extra 19");
		const response = await fetch(`http://localhost:4100/conversations/${conversationId}/messages/${target.id}`, {
			method: "DELETE",
			headers,
		});
		if (!response.ok) throw new Error("Retract failed");
	}, ids);
	await expect(dialog.getByText("Bookmarked extra 19", { exact: true })).toHaveCount(0);
	await expect(dialog.getByText("Bookmarked extra 18", { exact: true })).toBeVisible();
	await context.close();
	await peerContext.close();
});
