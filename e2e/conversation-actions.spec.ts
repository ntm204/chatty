import type { ConversationDTO } from "@chatty/shared-types";
import { expect, test } from "@playwright/test";
import type { Route } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("the five-pin limit stays actionable and a released slot can be reused", async ({ browser }) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	const thirdContext = await browser.newContext();
	try {
		const page = await context.newPage();
		const peer = makeUser("PinPeer");
		const third = makeUser("PinThird");
		await register(await peerContext.newPage(), peer);
		await register(await thirdContext.newPage(), third);
		await register(page, makeUser("PinOwner"));
		const token = await page.evaluate(() => localStorage.getItem("chatty:token"));
		const headers = { Authorization: `Bearer ${token}` };
		const participantIds: string[] = [];
		for (const user of [peer, third]) {
			const response = await page.request.get(`http://localhost:4100/users?query=${user.handle}`, { headers });
			expect(response.ok()).toBe(true);
			participantIds.push(((await response.json()) as { id: string }[])[0]!.id);
		}
		for (let number = 1; number <= 6; number++) {
			const response = await page.request.post("http://localhost:4100/conversations", {
				headers,
				data: { participantIds, name: `Pin group ${number}` },
			});
			expect(response.ok()).toBe(true);
			const conversation = (await response.json()) as ConversationDTO;
			if (number <= 5) {
				expect(
					(
						await page.request.put(`http://localhost:4100/conversations/${conversation.id}/pin`, {
							headers,
							data: { pinned: true },
						})
					).ok(),
				).toBe(true);
			}
		}
		const sixth = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /Pin group 6/ }) });
		await sixth.getByRole("button", { name: "Conversation actions" }).click();
		await page.getByRole("menuitem", { name: "Pin conversation", exact: true }).click();
		await expect(page.getByRole("alert")).toContainText("You can pin up to 5 conversations");
		await expect(page.getByRole("menuitem", { name: "Pin conversation", exact: true })).toBeEnabled();
		await page.keyboard.press("Escape");
		const first = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /Pin group 1/ }) });
		await first.getByRole("button", { name: "Conversation actions" }).click();
		await page.getByRole("menuitem", { name: "Unpin", exact: true }).click();
		await expect(page.getByRole("menu")).toHaveCount(0);
		await sixth.getByRole("button", { name: "Conversation actions" }).click();
		await page.getByRole("menuitem", { name: "Pin conversation", exact: true }).click();
		await expect(page.getByRole("menu")).toHaveCount(0);
		await expect(page.getByRole("alert")).toHaveCount(0);
		const response = await page.request.get("http://localhost:4100/conversations", { headers });
		const { items } = (await response.json()) as { items: ConversationDTO[] };
		expect(items.filter((conversation) => conversation.isPinned)).toHaveLength(5);
		expect(items.find((conversation) => conversation.name === "Pin group 6")?.isPinned).toBe(true);
		expect(items.find((conversation) => conversation.name === "Pin group 1")?.isPinned).toBe(false);
	} finally {
		await context.close();
		await peerContext.close();
		await thirdContext.close();
	}
});

test("mute expiry updates the sidebar, unread title and details without a reload", async ({ browser }) => {
	const listener = await browser.newContext();
	const sender = await browser.newContext();
	try {
		const listenerPage = await listener.newPage();
		const senderPage = await sender.newPage();
		const listenerUser = makeUser("MuteListener");
		const senderUser = makeUser("MuteSender");
		await register(listenerPage, listenerUser);
		await register(senderPage, senderUser);
		await startDirectChat(senderPage, listenerUser);
		await expect(listenerPage.getByRole("button", { name: new RegExp(senderUser.displayName) })).toBeVisible();
		const token = await listenerPage.evaluate(() => localStorage.getItem("chatty:token"));
		const headers = { Authorization: `Bearer ${token}` };
		const response = await listenerPage.request.get("http://localhost:4100/conversations", { headers });
		const { items } = (await response.json()) as { items: ConversationDTO[] };
		const conversationUrl = `http://localhost:4100/conversations/${items[0]!.id}`;
		expect(
			(
				await listenerPage.request.put(`${conversationUrl}/mute`, {
					headers,
					data: { until: new Date(Date.now() + 6_000).toISOString() },
				})
			).ok(),
		).toBe(true);
		await expect(listenerPage.getByRole("img", { name: "Muted", exact: true })).toBeVisible();
		await sendMessage(senderPage, "Unread after the quiet period");
		await expect(listenerPage.getByLabel("1 unread messages")).toBeVisible();
		await expect(listenerPage).toHaveTitle("Chatty");
		await listenerPage.getByRole("button", { name: "Conversation actions" }).click();
		await expect(listenerPage.getByRole("menuitem", { name: "Muted", exact: true })).toBeVisible();
		await expect(listenerPage.getByRole("menuitem", { name: "Mute", exact: true })).toBeVisible({
			timeout: 10_000,
		});
		await expect(listenerPage.getByRole("img", { name: "Muted", exact: true })).toHaveCount(0);
		await expect(listenerPage).toHaveTitle("(1) Chatty");
		await listenerPage.keyboard.press("Escape");
		await openConversationWith(listenerPage, senderUser);
		await listenerPage.getByRole("button", { name: "Conversation storage and details" }).click();
		const details = listenerPage.getByRole("complementary", { name: "Conversation details" });
		await expect(details.getByRole("button", { name: "Mute notifications", exact: true })).toBeVisible();
		expect(
			(
				await listenerPage.request.put(`${conversationUrl}/mute`, {
					headers,
					data: { until: new Date(Date.now() + 3_000).toISOString() },
				})
			).ok(),
		).toBe(true);
		await details.getByRole("button", { name: "Turn notifications back on" }).click();
		await expect(details.getByRole("menuitem", { name: "Unmute", exact: true })).toBeVisible();
		await expect(details.getByRole("button", { name: "Mute notifications", exact: true })).toBeVisible({
			timeout: 5_000,
		});
		await expect(details.getByRole("menuitem", { name: "Unmute", exact: true })).toHaveCount(0);
	} finally {
		await listener.close();
		await sender.close();
	}
});

test("mute errors survive closing either menu and deliberate retries do not send duplicate requests", async ({
	browser,
}) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	try {
		const page = await context.newPage();
		const peer = makeUser("MuteRetryPeer");
		await register(await peerContext.newPage(), peer);
		await register(page, makeUser("MuteRetry"));
		await startDirectChat(page, peer);
		const composer = page.getByRole("textbox", { name: "Message", exact: true });
		await composer.fill("Keep this unfinished message");
		let requestCount = 0;
		let pendingRoute: Route | undefined;
		await page.route("**/conversations/*/mute", async (route) => {
			requestCount++;
			if (requestCount === 1 || requestCount === 3) pendingRoute = route;
			else await route.continue();
		});
		await page.getByRole("button", { name: "Conversation actions" }).click();
		await page.getByRole("menuitem", { name: "Mute", exact: true }).click();
		const duration = page.getByRole("menuitem", { name: "8 hours", exact: true });
		await duration.evaluate((button: HTMLButtonElement) => {
			button.click();
			button.click();
		});
		await expect.poll(() => requestCount).toBe(1);
		await expect(duration).toBeDisabled();
		await expect(page.getByRole("menu", { name: "Conversation actions" })).toHaveAttribute("aria-busy", "true");
		await page.keyboard.press("Escape");
		await expect(page.getByRole("menu")).toHaveCount(0);
		await pendingRoute!.fulfill({
			status: 503,
			contentType: "application/json",
			body: JSON.stringify({ message: "Mute could not be saved. Try again." }),
		});
		await expect(page.getByRole("alert")).toContainText("Mute could not be saved. Try again.");
		await expect(page.getByRole("menu")).toHaveCount(0);
		await expect(page.getByRole("img", { name: "Muted", exact: true })).toHaveCount(0);
		await page.getByRole("button", { name: "Conversation actions" }).click();
		await page.getByRole("menuitem", { name: "Mute", exact: true }).click();
		await page.getByRole("menuitem", { name: "8 hours", exact: true }).click();
		await expect(page.getByRole("img", { name: "Muted", exact: true })).toBeVisible();
		await expect(page.getByRole("alert")).toHaveCount(0);
		await expect.poll(() => requestCount).toBe(2);
		await expect(composer).toHaveValue("Keep this unfinished message");

		await page.getByRole("button", { name: "Conversation storage and details" }).click();
		const details = page.getByRole("complementary", { name: "Conversation details" });
		await details.getByRole("button", { name: "Turn notifications back on" }).click();
		const unmute = details.getByRole("menuitem", { name: "Unmute", exact: true });
		await unmute.evaluate((button: HTMLButtonElement) => {
			button.click();
			button.click();
		});
		await expect.poll(() => requestCount).toBe(3);
		await expect(unmute).toBeDisabled();
		await composer.click();
		await expect(details.getByRole("menu")).toHaveCount(0);
		await pendingRoute!.fulfill({
			status: 503,
			contentType: "application/json",
			body: JSON.stringify({ message: "Unmute could not be saved. Try again." }),
		});
		await expect(details.getByRole("alert")).toContainText("Unmute could not be saved. Try again.");
		await expect(details.getByRole("menu")).toHaveCount(0);
		await details.getByRole("button", { name: "Turn notifications back on" }).click();
		await details.getByRole("menuitem", { name: "Unmute", exact: true }).click();
		await expect(details.getByRole("button", { name: "Mute notifications", exact: true })).toBeVisible();
		await expect(page.getByRole("img", { name: "Muted", exact: true })).toHaveCount(0);
		await expect(page.getByRole("alert")).toHaveCount(0);
		await expect.poll(() => requestCount).toBe(4);
		await expect(composer).toHaveValue("Keep this unfinished message");
	} finally {
		await context.close();
		await peerContext.close();
	}
});
