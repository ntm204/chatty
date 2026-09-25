import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("reply context returns to the reader's anchor across unloaded history", async ({ browser }) => {
	const context = await browser.newContext({ reducedMotion: "reduce" });
	const peerContext = await browser.newContext({ reducedMotion: "reduce" });
	try {
		const page = await context.newPage();
		const peer = makeUser("AnchorPeer");
		await register(await peerContext.newPage(), peer);
		await register(page, makeUser("AnchorAuthor"));
		await startDirectChat(page, peer);
		await Promise.all([
			page.waitForResponse(
				(response) =>
					response.url().endsWith("/messages") &&
					response.request().method() === "POST" &&
					response.status() === 201,
			),
			sendMessage(page, "Original context"),
		]);
		await expect(page.getByLabel("Message history")).toContainText("Original context");
		const replyId = await page.evaluate(async () => {
			const headers = {
				Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
				"Content-Type": "application/json",
			};
			const conversations = await (await fetch("http://localhost:4100/conversations", { headers })).json();
			const id = conversations.items[0].id;
			const messages = await (
				await fetch(`http://localhost:4100/conversations/${id}/messages`, { headers })
			).json();
			for (let index = 0; index < 65; index++) {
				const response = await fetch(`http://localhost:4100/conversations/${id}/messages`, {
					method: "POST",
					headers,
					body: JSON.stringify({ content: `History line ${index}` }),
				});
				if (!response.ok) throw new Error("Could not seed history");
			}
			const response = await fetch(`http://localhost:4100/conversations/${id}/messages`, {
				method: "POST",
				headers,
				body: JSON.stringify({ content: "Reply from today", replyToId: messages[0].id }),
			});
			if (!response.ok) throw new Error("Could not seed reply");
			return (await response.json()).id as string;
		});
		await page.reload();
		await openConversationWith(page, peer);
		const reply = page.locator(`#message-${replyId}`);
		await expect(reply).toBeVisible();
		const anchor = await page.getByLabel("Message history").evaluate((container) => {
			const viewport = container.getBoundingClientRect();
			const element = Array.from(container.querySelectorAll<HTMLElement>('[id^="message-"]')).find(
				(row) => row.getBoundingClientRect().bottom > viewport.top,
			)!;
			return { id: element.id, offset: element.getBoundingClientRect().top - viewport.top };
		});
		await reply.getByRole("button", { name: /original/i }).click();
		await expect(page.getByRole("button", { name: "Back to reading position" })).toBeVisible();
		await page.getByRole("button", { name: "Back to reading position" }).click();
		await expect(page.getByRole("button", { name: "Back to reading position" })).toHaveCount(0);
		await expect
			.poll(() =>
				page
					.locator(`#${anchor.id}`)
					.evaluate(
						(element) =>
							element.getBoundingClientRect().top -
							element.closest('[aria-label="Message history"]')!.getBoundingClientRect().top,
					),
			)
			.toBeCloseTo(anchor.offset, 0);
	} finally {
		await context.close();
		await peerContext.close();
	}
});
