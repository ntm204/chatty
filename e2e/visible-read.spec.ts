import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("an incoming message stays unread while the reader is scrolled up", async ({ browser }) => {
	const sender = await browser.newContext();
	const reader = await browser.newContext({ viewport: { width: 1100, height: 650 } });
	const senderPage = await sender.newPage();
	const readerPage = await reader.newPage();
	const senderUser = makeUser("ReadSender");
	const readerUser = makeUser("ReadViewer");
	await register(readerPage, readerUser);
	await register(senderPage, senderUser);
	await startDirectChat(senderPage, readerUser);
	await expect(senderPage.getByRole("main").getByRole("heading", { name: readerUser.displayName })).toBeVisible();
	const conversationId = await senderPage.evaluate(async () => {
		const headers = {
			Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
			"Content-Type": "application/json",
		};
		const response = await fetch("http://localhost:4100/conversations", { headers });
		const data = (await response.json()) as { items: { id: string }[] };
		const id = data.items[0]!.id;
		for (let index = 0; index < 35; index += 1) {
			const sent = await fetch(`http://localhost:4100/conversations/${id}/messages`, {
				method: "POST",
				headers,
				body: JSON.stringify({ content: `Visible history ${index + 1}` }),
			});
			if (!sent.ok) throw new Error(`Seeding failed: ${sent.status}`);
		}

		return id;
	});
	await openConversationWith(readerPage, senderUser);
	const history = readerPage.getByRole("region", { name: "Message history" });
	async function unreadCount(): Promise<number> {
		return readerPage.evaluate(async (id) => {
			const response = await fetch(`http://localhost:4100/conversations/${id}`, {
				headers: { Authorization: `Bearer ${localStorage.getItem("chatty:token")}` },
			});
			const conversation = (await response.json()) as { unreadCount: number };

			return conversation.unreadCount;
		}, conversationId);
	}
	await expect.poll(unreadCount).toBe(0);
	await history.evaluate((element) => {
		element.scrollTop = 0;
		element.dispatchEvent(new Event("scroll"));
	});
	await expect(readerPage.getByRole("button", { name: "Jump to latest messages" })).toBeVisible();
	await sendMessage(senderPage, "Do not read this below the viewport");
	await expect(messages(readerPage).getByText("Do not read this below the viewport")).toBeAttached();
	await expect(messages(readerPage).getByText("Do not read this below the viewport")).not.toBeInViewport();
	// Sample across frames and HTTP round trips so an eager read request cannot hide behind a transient badge.
	for (let sample = 0; sample < 5; sample += 1) {
		await readerPage.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
		);
		expect(await unreadCount()).toBe(1);
	}
	await readerPage.getByRole("button", { name: "Jump to latest messages" }).click();
	await expect.poll(unreadCount).toBe(0);
	await sender.close();
	await reader.close();
});
