import { expect, test } from "@playwright/test";
import { API_URL, makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("restores an unloaded reply, retains it through lookup failure and sends only after resolution", async ({
	browser,
}) => {
	const context = await browser.newContext({ reducedMotion: "reduce" });
	const peerContext = await browser.newContext({ reducedMotion: "reduce" });
	try {
		const page = await context.newPage();
		const peer = makeUser("ReplyPeer");
		await register(await peerContext.newPage(), peer);
		await register(page, makeUser("ReplyWriter"));
		await startDirectChat(page, peer);
		await sendMessage(page, "Older reply target");
		await expect(page.getByLabel("Message history")).toContainText("Older reply target");
		await page.getByLabel("Message actions").first().click();
		await page.getByRole("menuitem", { name: "Reply", exact: true }).click();
		await page.getByLabel("Message", { exact: true }).fill("Nháp reply được giữ nguyên");
		await expect
			.poll(() =>
				page.evaluate(() =>
					Object.keys(localStorage).some(
						(key) =>
							key.startsWith("chatty:user-draft:") && JSON.parse(localStorage.getItem(key)!).replyToId,
					),
				),
			)
			.toBe(true);
		const target = await page.evaluate(async (apiUrl) => {
			const headers = {
				Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
				"Content-Type": "application/json",
			};
			const list = await (await fetch(`${apiUrl}/conversations`, { headers })).json();
			const conversationId = list.items[0].id as string;
			const messages = await (
				await fetch(`${apiUrl}/conversations/${conversationId}/messages`, { headers })
			).json();
			for (let index = 0; index < 55; index++) {
				const response = await fetch(`${apiUrl}/conversations/${conversationId}/messages`, {
					method: "POST",
					headers,
					body: JSON.stringify({ content: `Newer context ${index}` }),
				});
				if (!response.ok) throw new Error("Failed to seed reply history");
			}

			return { conversationId, messageId: messages[0].id as string };
		}, API_URL);
		await page.route("**/messages/*/context?*", (route) =>
			route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ message: "Temporarily unavailable" }),
			}),
		);
		await page.reload();
		await openConversationWith(page, peer);
		await expect(page.getByRole("button", { name: "Retry reply" })).toBeVisible();
		await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Nháp reply được giữ nguyên");
		await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
		await page.getByLabel("Message", { exact: true }).press("Enter");
		await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Nháp reply được giữ nguyên");
		await page.unroute("**/messages/*/context?*");
		await page.getByRole("button", { name: "Retry reply" }).click();
		await expect(page.locator(".message-composer")).toContainText("Older reply target");
		await expect(page.locator(`#message-${target.messageId}`)).toHaveCount(0);
		await page.getByLabel("Message", { exact: true }).press("Enter");
		await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
		await expect
			.poll(() =>
				page.evaluate(
					async ({ conversationId, apiUrl }) => {
						const headers = { Authorization: `Bearer ${localStorage.getItem("chatty:token")}` };
						const messages = await (
							await fetch(`${apiUrl}/conversations/${conversationId}/messages`, { headers })
						).json();

						return messages.find(
							(message: { content: string }) => message.content === "Nháp reply được giữ nguyên",
						)?.replyTo?.id;
					},
					{ ...target, apiUrl: API_URL },
				),
			)
			.toBe(target.messageId);
	} finally {
		await context.close();
		await peerContext.close();
	}
});
