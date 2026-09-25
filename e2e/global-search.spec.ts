import { expect, test } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

test("global search opens a message in an archived conversation outside the loaded sidebar", async ({ browser }) => {
	const writer = makeUser("SearchWriter");
	const peer = makeUser("SearchPeer");
	const context = await browser.newContext({ reducedMotion: "reduce" });
	const otherContext = await browser.newContext({ reducedMotion: "reduce" });
	try {
		const page = await context.newPage();
		const other = await otherContext.newPage();
		await register(other, peer);
		await register(page, writer);
		await startDirectChat(page, peer);
		await sendMessage(page, "Tài liệu chuyến đi Đà Nẵng");
		await expect(page.getByRole("main").getByText("Tài liệu chuyến đi Đà Nẵng")).toBeVisible();
		const token = await page.evaluate(() => localStorage.getItem("chatty:token"));
		const headers = { Authorization: `Bearer ${token}` };
		const response = await page.request.get("http://localhost:4100/conversations", { headers });
		const { items } = (await response.json()) as { items: { id: string }[] };
		for (let index = 0; index < 23; index += 1) {
			const seeded = await page.request.post(`http://localhost:4100/conversations/${items[0]!.id}/messages`, {
				headers,
				data: { content: `Da Nang note ${index + 1}` },
			});
			expect(seeded.ok()).toBe(true);
		}
		const archive = await page.request.put(`http://localhost:4100/conversations/${items[0]!.id}/archive`, {
			headers,
			data: { archived: true },
		});
		expect(archive.ok()).toBe(true);
		await page.reload();
		await expect(
			page.getByRole("complementary").getByRole("button", { name: new RegExp(peer.displayName) }),
		).toHaveCount(0);
		await page.getByRole("button", { name: "Search all messages", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "Search all messages" });
		await expect(dialog).toBeVisible();
		await page.screenshot({ path: "/tmp/chatty-compact-search.png" });
		await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
		await page.screenshot({ path: "/tmp/chatty-compact-search-dark.png" });
		await dialog.getByRole("textbox", { name: "Search all messages" }).fill("da nang");
		await expect(dialog.locator("ul > li")).toHaveCount(20);
		await context.setOffline(true);
		await dialog.getByRole("button", { name: "More results" }).click();
		await expect(dialog.getByRole("alert")).toContainText("Connect to load more");
		await expect(dialog.locator("ul > li")).toHaveCount(20);
		await context.setOffline(false);
		await dialog.getByRole("button", { name: "Try again" }).click();
		await expect(dialog.locator("ul > li")).toHaveCount(24);
		const result = dialog.getByRole("button", { name: /Tài liệu chuyến đi Đà Nẵng/u });
		await result.scrollIntoViewIfNeeded();
		await expect(result.locator("mark")).toHaveText("Đà Nẵng");
		await page.screenshot({ path: "/tmp/chatty-search-highlight.png" });
		const scrollTop = await dialog.locator("ul").evaluate((list) => list.parentElement!.scrollTop);
		expect(scrollTop).toBeGreaterThan(100);
		await result.click();
		await expect(dialog).toHaveCount(0);
		await expect(page.getByRole("main").getByText("Tài liệu chuyến đi Đà Nẵng")).toBeVisible();
		await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Back to search results" }).click();
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole("textbox", { name: "Search all messages" })).toHaveValue("da nang");
		await expect(dialog.getByRole("button", { name: /Tài liệu chuyến đi Đà Nẵng/u })).toBeVisible();
		await expect
			.poll(() => dialog.locator("ul").evaluate((list) => list.parentElement!.scrollTop))
			.toBeCloseTo(scrollTop, 0);
		await dialog.getByRole("button", { name: "Close message search" }).click();
		await page.getByRole("button", { name: "Saved messages", exact: true }).click();
		await expect(page.getByRole("main").getByText("Your personal storage", { exact: true })).toBeVisible();
		await sendMessage(page, "Personal note from the compact Saved shortcut");
		await expect(
			page.getByRole("main").getByText("Personal note from the compact Saved shortcut", { exact: true }),
		).toBeVisible();
		await page.screenshot({ path: "/tmp/chatty-compact-sidebar-dark.png" });
	} finally {
		await context.close();
		await otherContext.close();
	}
});
