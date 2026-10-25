import { expect, test } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

test("bookmarks open archived originals, paginate, survive failed removal and retract live", async ({ browser }) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	const page = await context.newPage();
	const peer = makeUser("BookmarkPeer");
	await register(await peerContext.newPage(), peer);
	await register(page, makeUser("BookAuthor"));
	await page.getByRole("button", { name: "Bookmarked messages", exact: true }).click();
	const emptyBookmarks = page.getByRole("dialog", { name: "Bookmarked messages" });
	await expect(emptyBookmarks.getByText("No bookmarks yet.", { exact: true })).toBeVisible();
	await expect(emptyBookmarks.getByRole("heading", { name: "Bookmarks", exact: true })).toBeVisible();
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
	await page.screenshot({ path: "/tmp/chatty-lean-bookmarks.png" });
	await page.getByRole("button", { name: "Close bookmarks" }).click();
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
	const secondTab = await context.newPage();
	await secondTab.goto("/");
	await secondTab.getByRole("button", { name: "Bookmarked messages", exact: true }).click();
	const secondDialog = secondTab.getByRole("dialog", { name: "Bookmarked messages", exact: true });
	await expect(secondDialog.getByText("Bookmarked extra 20", { exact: true })).toBeVisible();
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
	await expect(secondDialog.getByText("Bookmarked extra 20", { exact: true })).toHaveCount(0);
	await expect(secondDialog.getByText("Bookmarked extra 19", { exact: true })).toBeVisible();
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

test("the thread menu, other tabs and the bookmarks list agree about one bookmark", async ({ browser }) => {
	test.setTimeout(60_000);
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	const page = await context.newPage();
	const peer = makeUser("AgreePeer");
	await register(await peerContext.newPage(), peer);
	await register(page, makeUser("AgreeAuthor"));
	await startDirectChat(page, peer);
	await sendMessage(page, "One bookmark, every surface");
	const otherTab = await context.newPage();
	await otherTab.goto("/");
	await otherTab.getByRole("button", { name: new RegExp(peer.displayName) }).click();
	await expect(otherTab.getByLabel("Message history").getByText("One bookmark, every surface")).toBeVisible();

	async function openMenu(target: typeof page) {
		await target.getByLabel("Message history").getByText("One bookmark, every surface").hover();
		await target.getByLabel("Message actions").click();
	}

	await openMenu(page);
	await page.getByRole("menuitem", { name: "Bookmark message", exact: true }).click();
	await expect(page.getByLabel("Message history").getByRole("status")).toContainText("Message bookmarked.");
	await openMenu(otherTab);
	await expect(otherTab.getByRole("menuitem", { name: "Remove bookmark", exact: true })).toBeVisible();
	await otherTab.keyboard.press("Escape");

	// A failed removal keeps the bookmark and says so, rather than flipping the label.
	await page.route("**/messages/*/star", (route) =>
		route.request().method() === "DELETE"
			? route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Remove failed"}' })
			: route.continue(),
	);
	await openMenu(page);
	await page.getByRole("menuitem", { name: "Remove bookmark", exact: true }).click();
	await expect(
		page.getByLabel("Message history").getByText(/Could not confirm removing the bookmark/u),
	).toBeVisible();
	await openMenu(page);
	await expect(page.getByRole("menuitem", { name: "Remove bookmark", exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.unroute("**/messages/*/star");

	// Removing from the bookmarks list resets the thread menu in both tabs, and survives a reload.
	await otherTab.getByRole("button", { name: "Bookmarked messages", exact: true }).click();
	const dialog = otherTab.getByRole("dialog", { name: "Bookmarked messages", exact: true });
	await dialog.getByRole("button", { name: "Remove bookmark", exact: true }).click();
	await expect(dialog.getByText("No bookmarks yet.", { exact: true })).toBeVisible();
	await openMenu(page);
	await expect(page.getByRole("menuitem", { name: "Bookmark message", exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.reload();
	await page.getByRole("button", { name: new RegExp(peer.displayName) }).click();
	await openMenu(page);
	await expect(page.getByRole("menuitem", { name: "Bookmark message", exact: true })).toBeVisible();

	await context.close();
	await peerContext.close();
});
