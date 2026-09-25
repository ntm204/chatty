import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("sidebar distinguishes loading, failure, retry and empty without disabling navigation", async ({ page }) => {
	await register(page, makeUser("SidebarRetry"));
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(/\/conversations(?:\?.*)?$/, async (route) => {
		if (route.request().method() !== "GET") return route.continue();
		await held;
		await route.fulfill({
			status: 503,
			contentType: "application/json",
			body: JSON.stringify({ message: "Unavailable" }),
		});
	});
	await page.reload();
	await expect(page.getByText("Loading conversations…")).toBeVisible();
	release();
	await expect(page.getByRole("alert")).toContainText("Could not refresh conversations");
	await expect(page.getByLabel("Find someone")).toBeEnabled();
	await page.unroute(/\/conversations(?:\?.*)?$/);
	await page.getByRole("button", { name: "Retry conversations" }).click();
	await expect(page.getByText("No conversations here.", { exact: false })).toBeVisible();
});

test("touch reactions converge after concurrent changes and a delayed HTTP response", async ({ browser }) => {
	const context = await browser.newContext({
		viewport: { width: 375, height: 760 },
		hasTouch: true,
		reducedMotion: "reduce",
	});
	const peerContext = await browser.newContext({ reducedMotion: "reduce" });
	let release!: () => void;
	try {
		const page = await context.newPage();
		const peerPage = await peerContext.newPage();
		const writer = makeUser("ReactWriter");
		const peer = makeUser("ReactionPeer");
		await register(peerPage, peer);
		await register(page, writer);
		await startDirectChat(page, peer);
		await openConversationWith(peerPage, writer);
		await sendMessage(page, "Concurrent reactions");
		await expect(messages(peerPage).getByText("Concurrent reactions", { exact: true })).toBeVisible();
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route("**/messages/*/reactions", async (route) => {
			const response = await route.fetch();
			await held;
			await route.fulfill({ response });
		});
		await messages(page).getByText("Concurrent reactions", { exact: true }).tap();
		await page.getByLabel("React to message").tap();
		await page.getByRole("menuitem", { name: "React with ❤️" }).tap();
		await expect(peerPage.getByRole("button", { name: "❤️, 1" })).toBeVisible();
		await peerPage.getByLabel("React to message").click();
		await peerPage.getByRole("menuitem", { name: "React with ❤️" }).click();
		await expect(page.getByRole("button", { name: "❤️, 2" })).toHaveAttribute("aria-pressed", "true");
		release();
		await expect(page.getByRole("button", { name: "❤️, 2" })).toBeEnabled();
		await messages(page).getByText("Concurrent reactions", { exact: true }).tap();
		await page.getByLabel("Message actions").tap();
		await page.getByRole("menuitem", { name: "Who reacted" }).tap();
		const dialog = page.getByRole("dialog", { name: "Reactions" });
		await expect(dialog.getByText(peer.displayName, { exact: true })).toBeVisible();
		await expect(dialog.getByText("You", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Close reactions" }).tap();
		await page.reload();
		await openConversationWith(page, peer);
		await expect(page.getByRole("button", { name: "❤️, 2" })).toHaveAttribute("aria-pressed", "true");
	} finally {
		release?.();
		await context.close();
		await peerContext.close();
	}
});

test("mobile search keeps long Unicode and markup-like text inside the result with live edits", async ({ browser }) => {
	const context = await browser.newContext({ viewport: { width: 375, height: 760 }, reducedMotion: "reduce" });
	const peerContext = await browser.newContext();
	try {
		const page = await context.newPage();
		const peer = { ...makeUser("LongPeer"), displayName: "Nguyễn Ánh ".repeat(5).trim() };
		await register(await peerContext.newPage(), peer);
		await register(page, makeUser("LongWriter"));
		await startDirectChat(page, peer);
		await Promise.all([
			page.waitForResponse(
				(response) =>
					response.url().endsWith("/messages") &&
					response.request().method() === "POST" &&
					response.status() === 201,
			),
			sendMessage(page, 'Needle <img src=x onerror="alert(1)"> ' + "ĐườngDẫnRấtDài".repeat(40)),
		]);
		const token = await page.evaluate(() => localStorage.getItem("chatty:token"));
		const headers = { Authorization: `Bearer ${token}` };
		const list = await (await page.request.get("http://localhost:4100/conversations", { headers })).json();
		const conversationId = list.items[0].id;
		const rows = await (
			await page.request.get(`http://localhost:4100/conversations/${conversationId}/messages`, { headers })
		).json();
		await page.getByRole("button", { name: "Back to conversations" }).click();
		const sidebar = page.getByRole("complementary");
		await expect(sidebar.getByRole("button", { name: new RegExp(peer.displayName) })).toBeVisible();
		expect(await sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
		await page.screenshot({ path: "/tmp/chatty-40-mobile-sidebar.png" });
		await page.getByRole("button", { name: "Search all messages", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "Search all messages" });
		await dialog.getByRole("textbox").fill("needle");
		const result = dialog.locator("li").first();
		await expect(result).toContainText('<img src=x onerror="alert(1)">');
		await expect(result.locator("img")).toHaveCount(0);
		expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
		await page.screenshot({ path: "/tmp/chatty-40-mobile-search.png" });
		const edited = await page.request.patch(
			`http://localhost:4100/conversations/${conversationId}/messages/${rows[0].id}`,
			{ headers, data: { content: "Needle updated safely" } },
		);
		expect(edited.ok()).toBe(true);
		await expect(result).toContainText("Needle updated safely");
		const removed = await page.request.delete(
			`http://localhost:4100/conversations/${conversationId}/messages/${rows[0].id}`,
			{ headers },
		);
		expect(removed.ok()).toBe(true);
		await expect(dialog.locator("li")).toHaveCount(0);
	} finally {
		await context.close();
		await peerContext.close();
	}
});
