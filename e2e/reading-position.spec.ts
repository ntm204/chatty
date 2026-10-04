import { expect, test, type Locator, type Page } from "@playwright/test";
import { makeUser, openConversationWith, register, startDirectChat } from "./helpers.js";

/** Seed real rows over HTTP into the sender's only conversation. */
async function seedHistory(page: Page, count: number): Promise<void> {
	await page.evaluate(
		async ({ apiUrl, count: messageCount }) => {
			const token = localStorage.getItem("chatty:token");
			const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
			const response = await fetch(`${apiUrl}/conversations`, { headers });
			const conversations = (await response.json()) as { items: { id: string }[] };
			const conversationId = conversations.items[0]?.id;
			if (!conversationId) throw new Error("The reading-position conversation was not created");
			for (let index = 0; index < messageCount; index += 1) {
				const sent = await fetch(`${apiUrl}/conversations/${conversationId}/messages`, {
					method: "POST",
					headers,
					body: JSON.stringify({ content: `Reading line ${index + 1}` }),
				});
				if (!sent.ok) throw new Error(`Could not create reading line ${index + 1}: ${sent.status}`);
			}
		},
		{ apiUrl: process.env.E2E_API_URL ?? "http://localhost:4100", count },
	);
}

/** The row's distance from the top of the message viewport, once scrolling has settled. */
async function settledRowTop(history: Locator, row: Locator): Promise<number> {
	await history.evaluate(
		(element) =>
			new Promise<void>((resolve) => {
				let previousTop = element.scrollTop;
				let stillFrames = 0;
				function check() {
					stillFrames = Math.abs(element.scrollTop - previousTop) < 0.5 ? stillFrames + 1 : 0;
					previousTop = element.scrollTop;
					if (stillFrames >= 6) resolve();
					else requestAnimationFrame(check);
				}
				requestAnimationFrame(check);
			}),
	);
	const [viewport, box] = await Promise.all([history.boundingBox(), row.boundingBox()]);
	if (!viewport || !box) throw new Error("The reading row is not rendered");

	return box.y - viewport.y;
}

test("keeps the reading row across thread switches and while the composer grows", async ({ browser }) => {
	const readerUser = makeUser("PosReader");
	const firstUser = makeUser("PosFirst");
	const secondUser = makeUser("PosSecond");
	const viewport = { width: 1280, height: 760 };
	const reader = await browser.newContext({ viewport });
	const first = await browser.newContext({ viewport });
	const second = await browser.newContext({ viewport });

	try {
		const readerPage = await reader.newPage();
		const firstPage = await first.newPage();
		const secondPage = await second.newPage();
		await register(readerPage, readerUser);
		await register(firstPage, firstUser);
		await register(secondPage, secondUser);
		await startDirectChat(firstPage, readerUser);
		await expect(firstPage.getByRole("main").getByRole("heading", { name: readerUser.displayName })).toBeVisible();
		await seedHistory(firstPage, 40);
		await startDirectChat(secondPage, readerUser);
		await expect(secondPage.getByRole("main").getByRole("heading", { name: readerUser.displayName })).toBeVisible();
		await seedHistory(secondPage, 3);

		await openConversationWith(readerPage, firstUser);
		const history = readerPage.getByRole("region", { name: "Message history" });
		await expect(history.getByText("Reading line 40", { exact: true })).toBeInViewport();

		// Read somewhere in the middle, with a real wheel so the app sees a reader.
		const reading = history.getByText("Reading line 20", { exact: true });
		await history.hover();
		for (let step = 0; (await settledRowTop(history, reading)) < 200; step += 1) {
			if (step > 40) throw new Error("Could not scroll the reading row into the middle");
			await readerPage.mouse.wheel(0, -240);
		}
		const readingTop = await settledRowTop(history, reading);

		// Another thread opens at its own latest message.
		await openConversationWith(readerPage, secondUser);
		await expect(history.getByText("Reading line 3", { exact: true })).toBeInViewport();

		// Coming back restores the same row at the same height.
		await openConversationWith(readerPage, firstUser);
		await expect(reading).toBeInViewport();
		expect(Math.abs((await settledRowTop(history, reading)) - readingTop)).toBeLessThanOrEqual(2);

		// A taller composer shrinks the viewport from below; the row above stays put.
		const composer = readerPage.getByRole("textbox", { name: "Message", exact: true });
		const composerHeight = (await composer.boundingBox())?.height ?? 0;
		await composer.click();
		for (let line = 0; line < 4; line += 1) await composer.press("Shift+Enter");
		await composer.type("draft");
		await expect.poll(async () => (await composer.boundingBox())?.height ?? 0).toBeGreaterThan(composerHeight);
		expect(Math.abs((await settledRowTop(history, reading)) - readingTop)).toBeLessThanOrEqual(2);

		// Leaving from the bottom reopens at the latest message rather than the old row.
		await readerPage.getByRole("button", { name: "Jump to latest messages" }).click();
		await expect(history.getByText("Reading line 40", { exact: true })).toBeInViewport();
		await openConversationWith(readerPage, secondUser);
		await openConversationWith(readerPage, firstUser);
		await expect(history.getByText("Reading line 40", { exact: true })).toBeInViewport();
		await expect(readerPage.getByRole("button", { name: "Jump to latest messages" })).toBeHidden();
	} finally {
		await Promise.all([reader.close(), first.close(), second.close()]);
	}
});
