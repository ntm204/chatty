import { expect, test, type Page } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

interface RecordedNotification {
	title: string;
	body: string;
	closed: boolean;
	onclick?: () => void;
}
interface NotificationWindow extends Window {
	recordedNotifications: RecordedNotification[];
}

async function recorded(page: Page) {
	return page.evaluate(() =>
		(window as unknown as NotificationWindow).recordedNotifications.map(({ title, body, closed }) => ({
			title,
			body,
			closed,
		})),
	);
}

test("two hidden tabs elect one notification, keep previews private and navigate on click", async ({ browser }) => {
	const sender = await browser.newContext({ reducedMotion: "reduce" });
	const receiver = await browser.newContext({ reducedMotion: "reduce" });
	await receiver.addInitScript(() => {
		localStorage.setItem("chatty:notifications", "true");
		localStorage.setItem("chatty:notification-sound", "false");
		localStorage.setItem("chatty:notification-message-preview", "false");
		const notifications: RecordedNotification[] = [];
		Object.defineProperty(window, "recordedNotifications", { value: notifications });
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
		window.Notification = class {
			static permission = "granted";
			title: string;
			body: string;
			closed = false;
			onclick?: () => void;
			onclose?: () => void;
			constructor(title: string, options?: NotificationOptions) {
				this.title = title;
				this.body = options?.body ?? "";
				notifications.push(this);
			}
			close() {
				this.closed = true;
				this.onclose?.();
			}
		} as unknown as typeof Notification;
	});
	try {
		const page = await sender.newPage();
		const first = await receiver.newPage();
		const author = makeUser("NoticeAuthor");
		const peer = makeUser("NoticePeer");
		await register(first, peer);
		await register(page, author);
		await startDirectChat(page, peer);
		await expect(first.getByRole("button", { name: new RegExp(author.displayName) })).toBeVisible();
		const token = await first.evaluate(() => localStorage.getItem("chatty:token"));
		const headers = { Authorization: `Bearer ${token}` };
		const conversations = await (
			await first.request.get("http://localhost:4100/conversations", { headers })
		).json();
		expect(
			(
				await first.request.put(`http://localhost:4100/conversations/${conversations.items[0].id}/archive`, {
					headers,
					data: { archived: true },
				})
			).ok(),
		).toBe(true);
		await first.reload();
		await expect(first.getByLabel("Find someone")).toBeVisible();
		const second = await receiver.newPage();
		await second.goto("/");
		await expect(second.getByLabel("Find someone")).toBeVisible();
		await sendMessage(page, "This text must stay out of the popup");
		await expect.poll(async () => (await recorded(first)).length + (await recorded(second)).length).toBe(1);
		const owner = (await recorded(first)).length ? first : second;
		expect(await recorded(owner)).toEqual([{ title: "Chatty", body: "New message", closed: false }]);
		await owner.evaluate(() => (window as unknown as NotificationWindow).recordedNotifications[0]?.onclick?.());
		await expect(owner.getByLabel("Message history")).toContainText("This text must stay out of the popup");
		expect((await recorded(owner))[0]?.closed).toBe(true);
		expect((await recorded(first)).length + (await recorded(second)).length).toBe(1);
	} finally {
		await sender.close();
		await receiver.close();
	}
});
