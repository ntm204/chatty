import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, startDirectChat } from "./helpers.js";

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

test("built web previews and sends image/voice under the production CSP", async ({ browser, browserName }) => {
	test.setTimeout(60_000);
	const author = makeUser("BuiltAuthor");
	const peer = makeUser("BuiltPeer");
	const sender = await browser.newContext({ permissions: ["microphone"], reducedMotion: "reduce" });
	const receiver = await browser.newContext({ reducedMotion: "reduce" });
	try {
		const page = await sender.newPage();
		const other = await receiver.newPage();
		const violations: string[] = [];
		page.on("console", (message) => {
			if (/violates.*content security policy|refused to load.*blob:/iu.test(message.text()))
				violations.push(message.text());
		});
		const response = await page.goto("/login");
		expect(response?.headers()["content-security-policy"]).toContain("media-src 'self' blob:");
		await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
		const initialModules = await page.evaluate(() =>
			performance
				.getEntriesByType("resource")
				.filter((entry) => (entry as PerformanceResourceTiming).initiatorType === "script")
				.map((entry) => entry.name),
		);
		expect(initialModules.some((url) => /\/(chat-page|settings-modal)-/.test(url))).toBe(false);
		await register(other, peer);
		await register(page, author);
		await startDirectChat(page, peer);
		await openConversationWith(other, author);
		await page.locator('input[type="file"][multiple]').setInputFiles({
			name: "preview.png",
			mimeType: "image/png",
			buffer: Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
				"base64",
			),
		});
		const preview = page.getByAltText("Attached image preview 1");
		await expect(preview).toBeVisible();
		await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
		await page.getByLabel("Message", { exact: true }).fill("Built photo");
		await page.getByLabel("Message", { exact: true }).press("Enter");
		await expect(other.getByRole("main").getByAltText("Built photo")).toBeVisible();
		await page.getByRole("button", { name: "Record a voice message" }).click();
		await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
		await page.waitForTimeout(1_200);
		await page.getByRole("button", { name: "Stop recording" }).click();
		await page.getByRole("button", { name: "Play recording preview" }).click();
		await expect(page.getByRole("button", { name: "Pause recording preview" })).toBeVisible();
		await expect
			.poll(() =>
				page
					.getByRole("group", { name: "Voice recorder" })
					.locator("audio")
					.evaluate((audio: HTMLAudioElement) => audio.currentTime),
			)
			.toBeGreaterThan(0);
		await page.getByRole("button", { name: "Send voice message" }).click();
		await expect(other.getByRole("button", { name: "Play voice message" })).toBeVisible({ timeout: 15_000 });
		await page.reload();
		await openConversationWith(page, peer);
		await expect(page.getByRole("main").getByAltText("Built photo")).toBeVisible();
		await expect(page.getByRole("button", { name: "Play voice message" })).toBeVisible();
		expect(violations).toEqual([]);
		// Playwright's WebKit throws an internal error reloading a service-worker page
		// under setOffline, so the offline shell is exercised in Chromium only; Safari
		// itself is checked by hand (see acceptance report).
		if (browserName === "webkit") return;
		await page.getByLabel("Message", { exact: true }).fill("Offline draft stays here");
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});
		await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
		await page.getByLabel("Message", { exact: true }).blur();
		await sender.setOffline(true);
		const offlineResponse = await page.reload();
		expect(offlineResponse?.headers()["content-security-policy"]).toContain("media-src 'self' blob:");
		await openConversationWith(page, peer);
		await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Offline draft stays here");
		await expect(page.getByRole("button", { name: "Play voice message" })).toBeDisabled();
		await page.getByRole("link", { name: "Account settings" }).click();
		await expect(page.getByRole("button", { name: "Close settings" })).toBeVisible();
		await page.getByRole("button", { name: "Close settings" }).click();
		await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Offline draft stays here");
		await sender.setOffline(false);
		await expect(page.getByRole("button", { name: "Play voice message" })).toBeEnabled({ timeout: 15_000 });
		expect(violations).toEqual([]);
	} finally {
		await sender.close();
		await receiver.close();
	}
});
