import { expect, test, type Locator, type Page } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

/** Seed real rows over HTTP; the reader obtains them through the API and socket. */
async function seedHistory(page: Page, count: number): Promise<string> {
	return page.evaluate(
		async ({ apiUrl, count: messageCount }) => {
			const token = localStorage.getItem("chatty:token");
			const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
			const response = await fetch(`${apiUrl}/conversations`, { headers });
			const conversations = (await response.json()) as { items: { id: string }[] };
			const conversationId = conversations.items[0]?.id;
			if (!conversationId) throw new Error("The scroll test conversation was not created");
			for (let index = 0; index < messageCount; index += 1) {
				const sent = await fetch(`${apiUrl}/conversations/${conversationId}/messages`, {
					method: "POST",
					headers,
					body: JSON.stringify({ content: `History line ${index + 1}` }),
				});
				if (!sent.ok) throw new Error(`Could not create history line ${index + 1}: ${sent.status}`);
			}
			return conversationId;
		},
		{ apiUrl: process.env.E2E_API_URL ?? "http://localhost:4100", count },
	);
}

/** Observe a settled position instead of relying on the browser's animation duration. */
async function settledScrollPosition(history: Locator): Promise<number> {
	return history.evaluate(
		(element) =>
			new Promise<number>((resolve) => {
				let previousTop = element.scrollTop;
				let stillFrames = 0;
				function check() {
					const top = element.scrollTop;
					stillFrames = Math.abs(top - previousTop) < 0.5 ? stillFrames + 1 : 0;
					previousTop = top;
					if (stillFrames >= 6) resolve(top);
					else requestAnimationFrame(check);
				}
				requestAnimationFrame(check);
			}),
	);
}

test("offers a quiet way back, follows incoming messages during a jump and respects interruption", async ({
	browser,
}) => {
	const senderUser = makeUser("ScrollSender");
	const readerUser = makeUser("ScrollReader");
	const sender = await browser.newContext({ viewport: { width: 1280, height: 760 } });
	const reader = await browser.newContext({ viewport: { width: 1280, height: 760 }, hasTouch: true });

	try {
		const senderPage = await sender.newPage();
		const readerPage = await reader.newPage();
		await register(readerPage, readerUser);
		await register(senderPage, senderUser);
		await startDirectChat(senderPage, readerUser);
		// The click starts an async request; wait for its result before querying the API fixture.
		await expect(senderPage.getByRole("main").getByRole("heading", { name: readerUser.displayName })).toBeVisible();

		const conversationId = await seedHistory(senderPage, 36);

		await openConversationWith(readerPage, senderUser);
		const history = readerPage.getByRole("region", { name: "Message history" });
		const jump = readerPage.getByRole("button", { name: "Jump to latest messages" });
		await expect(history.getByText("History line 36", { exact: true })).toBeInViewport();
		await expect(jump).toBeHidden();
		const distance = () =>
			history.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
		const senderComposer = senderPage.getByLabel("Message", { exact: true });
		const threadTyping = history.getByRole("status", { name: "Typing activity" });
		await senderComposer.fill("Đang viết tin nhắn mới");
		await expect(threadTyping).toHaveText(`${senderUser.displayName} is typing…`);
		await expect(history.locator(".thread-typing .typing-dots")).toBeInViewport();
		await expect.poll(distance).toBeLessThanOrEqual(1);
		await expect(jump).toBeHidden();
		const beats = history.locator(".thread-typing .typing-dots > span");
		expect(await beats.evaluateAll((dots) => dots.map((dot) => getComputedStyle(dot).animationDelay))).toEqual([
			"0s",
			"0.14s",
			"0.28s",
		]);
		await readerPage.screenshot({ path: "/tmp/chatty-thread-typing.png" });
		await senderComposer.fill("");
		await expect(threadTyping).toBeHidden();
		await expect.poll(distance).toBeLessThanOrEqual(1);

		await history.evaluate((element) => {
			element.scrollTop = element.scrollHeight - element.clientHeight - 200;
		});
		await expect.poll(distance).toBeGreaterThan(120);
		await expect.poll(distance).toBeLessThan(await history.evaluate((element) => element.clientHeight));
		await expect(jump).toBeVisible();
		const positionBeforeMessage = await history.evaluate((element) => element.scrollTop);
		await expect
			.poll(async () => (await jump.locator("[data-scroll-latest-surface]").boundingBox())?.width ?? 0)
			.toBeLessThanOrEqual(34);
		const idleBounds = await jump.locator("[data-scroll-latest-surface]").boundingBox();
		const hitBounds = await jump.boundingBox();
		const historyBounds = await history.boundingBox();
		if (!idleBounds || !hitBounds || !historyBounds) throw new Error("Latest-message control is not laid out");
		expect(idleBounds.width).toBeLessThanOrEqual(34);
		expect(idleBounds.height).toBeLessThanOrEqual(34);
		expect(hitBounds.width).toBeGreaterThanOrEqual(44);
		expect(hitBounds.height).toBeGreaterThanOrEqual(44);
		expect(Math.abs(idleBounds.x + idleBounds.width / 2 - historyBounds.x - historyBounds.width / 2)).toBeLessThan(
			1,
		);
		await expect(jump).toHaveText("");
		await expect(jump).toHaveAccessibleDescription("You are viewing earlier messages");
		await readerPage.screenshot({ animations: "disabled", path: "/tmp/chatty-activity-idle.png" });

		await senderComposer.fill("Mình đang soạn phần trao đổi tiếp theo");
		await expect(jump).toHaveText(`${senderUser.displayName} is typing`);
		expect(await history.evaluate((element) => element.scrollTop)).toBeCloseTo(positionBeforeMessage, 0);
		await readerPage.screenshot({ animations: "disabled", path: "/tmp/chatty-activity-typing.png" });
		// The real idle timeout retracts typing; the dots must not imply activity forever.
		await expect(jump).toHaveText("", { timeout: 8_000 });

		await sendMessage(senderPage, "A message while you read history");
		await expect(history.getByText("A message while you read history")).toBeAttached();
		await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBeCloseTo(positionBeforeMessage, 0);
		await expect(jump).toBeVisible();
		await expect(jump).toHaveText("1 new message");
		await sendMessage(senderPage, "One more message below");
		await expect(history.getByText("One more message below")).toBeAttached();
		await expect(jump).toHaveText("2 new messages");
		expect(await history.evaluate((element) => element.scrollTop)).toBeCloseTo(positionBeforeMessage, 0);
		await readerPage.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
		await readerPage.screenshot({ animations: "disabled", path: "/tmp/chatty-activity-new-messages.png" });

		await jump.focus();
		await readerPage.keyboard.press("Enter");

		await expect.poll(distance).toBeLessThanOrEqual(1);
		await expect(history.getByText("A message while you read history")).toBeInViewport();
		await expect(jump).toBeHidden();
		await expect(history).toBeFocused();

		// A message arriving halfway through the native animation extends the
		// destination. Trigger it from the first intermediate scroll frame so the
		// ordering is explicit, including on a fast local server.
		await history.evaluate((element) => {
			element.scrollTop = 0;
		});
		await expect(jump).toBeVisible();
		const senderToken = await senderPage.evaluate(() => localStorage.getItem("chatty:token"));
		if (!senderToken) throw new Error("The sender is not signed in");
		await history.evaluate(
			(element, { apiUrl, conversationId: id, token }) =>
				new Promise<void>((resolve, reject) => {
					const start = element.scrollTop;
					const timer = window.setTimeout(() => {
						element.removeEventListener("scroll", onScroll);
						reject(new Error("Jump did not produce an intermediate scroll frame"));
					}, 3_000);
					function onScroll() {
						const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
						if (element.scrollTop <= start || remaining <= 120) return;
						element.removeEventListener("scroll", onScroll);
						window.clearTimeout(timer);
						void fetch(`${apiUrl}/conversations/${id}/messages`, {
							method: "POST",
							headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
							body: JSON.stringify({ content: "Arrived while the jump was moving" }),
						})
							.then((response) => {
								if (!response.ok) throw new Error(`Could not send during jump: ${response.status}`);
								resolve();
							})
							.catch(reject);
					}
					element.addEventListener("scroll", onScroll);
					const button = document.querySelector<HTMLButtonElement>('[aria-label="Jump to latest messages"]');
					if (!button) {
						window.clearTimeout(timer);
						element.removeEventListener("scroll", onScroll);
						reject(new Error("The jump control is missing"));
						return;
					}
					button.click();
				}),
			{ apiUrl: process.env.E2E_API_URL ?? "http://localhost:4100", conversationId, token: senderToken },
		);
		await expect(history.getByText("Arrived while the jump was moving")).toBeInViewport();
		await expect.poll(distance).toBeLessThanOrEqual(1);
		await expect(jump).toBeHidden();

		// Keyboard activation lets the pointer remain above the messages, so a
		// real wheel gesture can interrupt the trip without moving to the button.
		await history.evaluate((element) => {
			element.scrollTop = 0;
		});
		await expect(jump).toBeVisible();
		await history.hover();
		await jump.focus();
		const tripStarted = history.evaluate(
			(element) =>
				new Promise<void>((resolve, reject) => {
					const timer = window.setTimeout(() => {
						element.removeEventListener("scroll", onScroll);
						reject(new Error("The interruptible jump did not begin"));
					}, 3_000);
					function onScroll() {
						if (element.scrollTop <= 0) return;
						element.removeEventListener("scroll", onScroll);
						window.clearTimeout(timer);
						resolve();
					}
					element.addEventListener("scroll", onScroll);
				}),
		);
		await readerPage.keyboard.press("Enter");
		await tripStarted;
		await readerPage.mouse.wheel(0, -160);
		const interruptedPosition = await settledScrollPosition(history);
		await expect.poll(distance).toBeGreaterThan(120);
		await expect(jump).toBeVisible();
		await sendMessage(senderPage, "A reply after you interrupted the jump");
		await expect(jump).toHaveText("1 new message");
		expect(await settledScrollPosition(history)).toBeCloseTo(interruptedPosition, 0);
		await jump.click();
		await expect.poll(distance).toBeLessThanOrEqual(1);
		await expect(jump).toBeHidden();

		await readerPage.setViewportSize({ width: 375, height: 760 });
		await history.evaluate((element) => {
			element.scrollTop = element.scrollHeight - element.clientHeight - 240;
		});
		await expect(jump).toBeVisible();
		await expect(jump).toHaveText("");
		await senderComposer.fill("Mình đang viết tiếp");
		await expect(jump).toHaveText(`${senderUser.displayName} is typing`);
		await readerPage.emulateMedia({ reducedMotion: "reduce" });
		expect(
			await jump
				.locator("svg, .typing-dots > span")
				.evaluateAll((icons) => icons.every((icon) => getComputedStyle(icon).animationName === "none")),
		).toBe(true);
		await readerPage.screenshot({ animations: "disabled", path: "/tmp/chatty-activity-mobile.png" });
		await jump.tap();
		await expect.poll(distance).toBeLessThanOrEqual(1);
		await expect(jump).toBeHidden();
		await readerPage.setViewportSize({ width: 1280, height: 600 });
		await expect.poll(distance).toBeLessThanOrEqual(1);
		await expect(jump).toBeHidden();
	} finally {
		await sender.close();
		await reader.close();
	}
});

test("returns from search across live arrivals, a delayed latest page and a retryable failure", async ({ browser }) => {
	const senderUser = makeUser("HistorySender");
	const readerUser = makeUser("HistoryReader");
	const sender = await browser.newContext({ viewport: { width: 1280, height: 760 } });
	const reader = await browser.newContext({ viewport: { width: 1280, height: 760 } });
	let releaseLatest = () => {};

	try {
		const senderPage = await sender.newPage();
		const readerPage = await reader.newPage();
		await register(readerPage, readerUser);
		await register(senderPage, senderUser);
		await startDirectChat(senderPage, readerUser);
		await expect(senderPage.getByRole("main").getByRole("heading", { name: readerUser.displayName })).toBeVisible();
		await sendMessage(senderPage, "Historical checkpoint amber-orchid");
		await expect(senderPage.getByRole("main").getByText("Historical checkpoint amber-orchid")).toBeVisible();
		const conversationId = await seedHistory(senderPage, 60);
		await openConversationWith(readerPage, senderUser);
		const history = readerPage.getByRole("region", { name: "Message history" });
		const jump = readerPage.getByRole("button", { name: "Jump to latest messages" });
		const distance = () =>
			history.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
		await expect(history.getByText("History line 60", { exact: true })).toBeInViewport();

		async function openHistoricalCheckpoint() {
			await readerPage.getByRole("button", { name: "Search in conversation" }).click();
			await readerPage.getByRole("textbox", { name: "Search in conversation" }).fill("amber-orchid");
			await expect(readerPage.getByText("1 of 1")).toBeVisible();
			await expect(history.getByText("Historical checkpoint amber-orchid")).toBeInViewport();
			await expect(readerPage.getByRole("button", { name: "Load newer messages" })).toBeAttached();
			await expect(jump).toBeVisible();
		}

		await openHistoricalCheckpoint();
		await history.evaluate((element) => {
			element.scrollTop = 200;
		});
		const readingPosition = await settledScrollPosition(history);
		await sendMessage(senderPage, "A live arrival while search is open");
		await expect(history.getByText("A live arrival while search is open")).toBeAttached();
		expect(await settledScrollPosition(history)).toBeCloseTo(readingPosition, 0);
		// The live message must not become the history paging cursor and silently
		// skip all the messages between the search window and today.
		await readerPage.getByRole("button", { name: "Load newer messages" }).click();
		await expect(history.getByText("History line 40", { exact: true })).toBeAttached();

		const latestUrl = `**/conversations/${conversationId}/messages?limit=50`;
		const released = new Promise<void>((resolve) => {
			releaseLatest = resolve;
		});
		let snapshotReady = () => {};
		const snapshotCaptured = new Promise<void>((resolve) => {
			snapshotReady = resolve;
		});
		await readerPage.route(
			latestUrl,
			async (route) => {
				const response = await route.fetch();
				snapshotReady();
				await released;
				await route.fulfill({ response });
			},
			{ times: 1 },
		);
		await jump.click();
		await snapshotCaptured;
		await expect(jump).toBeDisabled();
		await expect(jump).toHaveText("Loading latest…");
		await expect(jump).toHaveAttribute("aria-busy", "true");
		await readerPage.screenshot({ animations: "disabled", path: "/tmp/chatty-activity-loading.png" });
		await sendMessage(senderPage, "Arrived while the latest page was loading");
		await expect(history.getByText("Arrived while the latest page was loading")).toBeAttached();
		releaseLatest();
		await expect(jump).toBeHidden();
		await expect(history.getByText("History line 60", { exact: true })).toBeAttached();
		await expect(history.getByText("Arrived while the latest page was loading")).toHaveCount(1);
		await expect.poll(distance).toBeLessThanOrEqual(1);

		await openHistoricalCheckpoint();
		await readerPage.route(
			latestUrl,
			(route) =>
				route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({
						error: "unavailable",
						message: "Latest messages are temporarily unavailable",
					}),
				}),
			{ times: 1 },
		);
		await jump.click();
		await expect(readerPage.getByText("This conversation could not be loaded.")).toBeVisible();
		await expect(readerPage.getByText("Latest messages are temporarily unavailable")).toBeVisible();
		await readerPage.getByRole("button", { name: "Try again" }).click();
		await expect(history.getByText("Arrived while the latest page was loading")).toBeInViewport();
		await expect.poll(distance).toBeLessThanOrEqual(1);
		await expect(jump).toBeHidden();
		await expect(readerPage.getByRole("textbox", { name: "Search in conversation" })).toBeHidden();
	} finally {
		releaseLatest();
		await sender.close();
		await reader.close();
	}
});
