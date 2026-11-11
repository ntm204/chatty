import { expect, test } from "@playwright/test";
import { API_URL, makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("a long unread run offers a jump to its first message, once", async ({ browser }) => {
	const writer = makeUser("UnreadWriter");
	const reader = makeUser("UnreadReader");
	const writerContext = await browser.newContext({ reducedMotion: "reduce" });
	const readerContext = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 720 } });
	try {
		const writerPage = await writerContext.newPage();
		const readerPage = await readerContext.newPage();
		await register(readerPage, reader);
		await register(writerPage, writer);
		await startDirectChat(writerPage, reader);
		await sendMessage(writerPage, "First of many");
		const token = await writerPage.evaluate(() => localStorage.getItem("chatty:token"));
		const headers = { Authorization: `Bearer ${token}` };
		const { items } = (await (await writerPage.request.get(`${API_URL}/conversations`, { headers })).json()) as {
			items: { id: string }[];
		};
		for (let index = 1; index <= 24; index += 1) {
			const sent = await writerPage.request.post(`${API_URL}/conversations/${items[0]!.id}/messages`, {
				headers,
				data: { content: `Catch-up line ${index}` },
			});
			expect(sent.ok()).toBe(true);
		}

		await readerPage.reload();
		await openConversationWith(readerPage, writer);
		const jump = readerPage.getByRole("button", { name: "Jump to 25 new messages" });
		await expect(jump).toBeVisible();
		await jump.click();
		await expect(readerPage.locator("[data-unread-divider]")).toBeInViewport();
		await expect(jump).toHaveCount(0);

		// Seen once is enough: scrolling back to the bottom does not bring the offer back.
		await readerPage
			.getByLabel("Message history")
			.evaluate((history) => (history.scrollTop = history.scrollHeight));
		await expect(
			readerPage.getByLabel("Message history").getByText("Catch-up line 24", { exact: true }),
		).toBeInViewport();
		await expect(jump).toHaveCount(0);
	} finally {
		await writerContext.close();
		await readerContext.close();
	}
});
