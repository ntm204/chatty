import { expect, test } from "@playwright/test";
import type { ConversationDTO } from "@chatty/shared-types";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

test("an unloaded archived DM respects mute and restriction while handles remain ordinary text", async ({
	browser,
}) => {
	const sender = await browser.newContext();
	const receiver = await browser.newContext();
	await receiver.addInitScript(() => {
		try {
			localStorage.setItem("chatty:notifications", "true");
			localStorage.setItem("chatty:notification-sound", "false");
		} catch {
			/* The initial about:blank document has no storage origin. */
		}
		const received: string[] = [];
		Object.defineProperty(window, "chattyTestNotifications", { value: received });
		window.Notification = class {
			static permission = "granted";
			constructor(_title: string, options?: NotificationOptions) {
				received.push(options?.body ?? "");
			}
		} as unknown as typeof Notification;
	});
	try {
		const senderPage = await sender.newPage();
		const receiverPage = await receiver.newPage();
		const senderUser = makeUser("AlertSender");
		const receiverUser = makeUser("AlertViewer");
		await register(receiverPage, receiverUser);
		await register(senderPage, senderUser);
		await startDirectChat(senderPage, receiverUser);
		await expect(
			receiverPage.getByRole("complementary").getByRole("button", { name: new RegExp(senderUser.displayName) }),
		).toBeVisible();
		const token = await receiverPage.evaluate(() => localStorage.getItem("chatty:token"));
		const headers = { Authorization: `Bearer ${token}` };
		const response = await receiverPage.request.get("http://localhost:4100/conversations", { headers });
		const { items } = (await response.json()) as { items: ConversationDTO[] };
		const conversation = items[0]!;
		const senderId = conversation.participants.find((participant) => participant.handle === senderUser.handle)!.id;
		const conversationUrl = `http://localhost:4100/conversations/${conversation.id}`;
		expect(
			(await receiverPage.request.put(`${conversationUrl}/archive`, { headers, data: { archived: true } })).ok(),
		).toBe(true);
		expect(
			(
				await receiverPage.request.put(`${conversationUrl}/mute`, {
					headers,
					data: { until: "9999-12-31T23:59:59.999Z" },
				})
			).ok(),
		).toBe(true);
		await receiverPage.reload();
		await expect(receiverPage.getByRole("button", { name: "Search all messages", exact: true })).toBeVisible();
		await receiverPage.evaluate(() => {
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
			document.dispatchEvent(new Event("visibilitychange"));
		});
		const notifications = () =>
			receiverPage.evaluate(
				() => (window as unknown as { chattyTestNotifications: string[] }).chattyTestNotifications,
			);
		const lookup = receiverPage.waitForResponse((reply) => reply.url().includes(`/restrictions/${senderId}`));
		await sendMessage(senderPage, "Quiet archived message");
		await lookup;
		await receiverPage.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
		);
		expect(await notifications()).toEqual([]);
		await expect(
			receiverPage.getByRole("complementary").getByRole("button", { name: new RegExp(senderUser.displayName) }),
		).toHaveCount(0);
		expect(
			(await receiverPage.request.put(`${conversationUrl}/mute`, { headers, data: { until: null } })).ok(),
		).toBe(true);
		await sendMessage(senderPage, `@${receiverUser.handle} please read`);
		await expect.poll(notifications).toEqual([`@${receiverUser.handle} please read`]);
		expect(
			(await receiverPage.request.put(`http://localhost:4100/restrictions/${senderId}`, { headers })).ok(),
		).toBe(true);
		const restrictedLookup = receiverPage.waitForResponse(
			(reply) => reply.url() === conversationUrl && reply.request().method() === "GET",
		);
		await sendMessage(senderPage, `@${receiverUser.handle} restricted mention`);
		await restrictedLookup;
		await receiverPage.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
		);
		expect(await notifications()).toEqual([`@${receiverUser.handle} please read`]);
	} finally {
		await sender.close();
		await receiver.close();
	}
});
