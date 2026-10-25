import { expect, test } from "@playwright/test";
import { makeUser, register, startDirectChat } from "./helpers.js";

/**
 * What only a browser can say about paging the sidebar.
 *
 * The server's half is unit-tested — cursors, ties, the pinned block — but two
 * things live entirely in the client and would pass a green service suite while
 * being broken on screen: that scrolling actually fetches the next page, and
 * that a message arriving for a conversation **below the loaded window** still
 * lifts that conversation to the top. The second is the case paging created:
 * before it, the list held everything and there was always a row to patch.
 */
test.describe("conversation paging", () => {
	test("scrolling the sidebar loads conversations past the first page", async ({ browser }) => {
		const mai = makeUser("Mai");
		const context = await browser.newContext({ viewport: { width: 1280, height: 700 } });
		const page = await context.newPage();
		await register(page, mai);

		// Comfortably past one page of thirty, created through the API so the test
		// is about the sidebar rather than about clicking a dialog thirty-five
		// times.
		const created = await page.evaluate(async (apiUrl) => {
			const token = localStorage.getItem("chatty:token");
			const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
			const ids: string[] = [];
			for (let index = 0; index < 35; index += 1) {
				const suffix = `${Date.now().toString(36)}${index}`;
				const registered = await (
					await fetch(`${apiUrl}/auth/register`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							email: `p${suffix}@test.com`,
							handle: `p${suffix}`,
							displayName: `Peer ${index}`,
							password: "SuperSecret123",
						}),
					})
				).json();
				const conversation = await (
					await fetch(`${apiUrl}/conversations`, {
						method: "POST",
						headers,
						body: JSON.stringify({ participantIds: [registered.user.id] }),
					})
				).json();
				ids.push(conversation.id);
			}

			return ids;
		}, process.env.E2E_API_URL ?? "http://localhost:4100");

		expect(created).toHaveLength(35);
		await page.reload();

		const rows = page.getByRole("listitem");
		// The first page is bounded — the whole point of the item. Reload first paints
		// nothing, then the cached sidebar (all 35), then the server's first page, so
		// wait for a non-empty count that holds still before reading it.
		await expect
			.poll(
				async () => {
					const before = await rows.count();
					await page.waitForTimeout(700);

					return before === (await rows.count()) ? before : -1;
				},
				{ timeout: 15_000 },
			)
			.toBeGreaterThan(0);
		const firstPageCount = await rows.count();
		expect(firstPageCount).toBeLessThan(35);

		// A real wheel over the list, as a reader would. Anchoring on the last row
		// raced the next page replacing it once loading starts before the end.
		await page.getByRole("list").first().hover();
		await page.mouse.wheel(0, 4000);

		await expect.poll(() => rows.count(), { timeout: 15_000 }).toBeGreaterThan(firstPageCount);
	});

	test("a message lifts a conversation the sidebar had not paged to", async ({ browser }) => {
		const mai = makeUser("Mai");
		const linh = makeUser("Linh");
		const maiContext = await browser.newContext();
		const linhContext = await browser.newContext();
		const maiPage = await maiContext.newPage();
		const linhPage = await linhContext.newPage();

		await register(linhPage, linh);
		await register(maiPage, mai);
		await startDirectChat(linhPage, mai);
		await linhPage.getByRole("textbox", { name: "Message" }).fill("first");
		await linhPage.keyboard.press("Enter");

		// Mai now has a conversation with Linh, then buries it under newer ones.
		await maiPage.evaluate(async (apiUrl) => {
			const token = localStorage.getItem("chatty:token");
			const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
			for (let index = 0; index < 32; index += 1) {
				const suffix = `${Date.now().toString(36)}b${index}`;
				const registered = await (
					await fetch(`${apiUrl}/auth/register`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							email: `f${suffix}@test.com`,
							handle: `f${suffix}`,
							displayName: `Filler ${index}`,
							password: "SuperSecret123",
						}),
					})
				).json();
				await fetch(`${apiUrl}/conversations`, {
					method: "POST",
					headers,
					body: JSON.stringify({ participantIds: [registered.user.id] }),
				});
			}
		}, process.env.E2E_API_URL ?? "http://localhost:4100");

		await maiPage.reload();
		// Off the first page: the conversation with Linh is the oldest of the lot.
		await expect(maiPage.getByRole("listitem").filter({ hasText: linh.displayName })).toHaveCount(0, {
			timeout: 15_000,
		});

		await linhPage.getByRole("textbox", { name: "Message" }).fill("still here");
		await linhPage.keyboard.press("Enter");

		// The row is fetched on its own and lifted, rather than the sidebar
		// re-listing and losing wherever the reader had scrolled to.
		await expect(maiPage.getByRole("listitem").filter({ hasText: linh.displayName }).first()).toBeVisible({
			timeout: 15_000,
		});
	});
});
