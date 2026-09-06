import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";
import { sendVoiceFixture } from "./fixtures/voice.js";

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

test("voice messages support playback, scrubbing, speed and one active player on desktop and mobile", async ({
	browser,
}) => {
	const senderUser = makeUser("Minh");
	const peerUser = makeUser("An");
	const sender = await browser.newContext({ viewport: { width: 1280, height: 850 } });
	const peer = await browser.newContext();
	try {
		const page = await sender.newPage();
		const peerPage = await peer.newPage();
		await register(peerPage, peerUser);
		await register(page, senderUser);
		await startDirectChat(page, peerUser);
		await openConversationWith(peerPage, senderUser);
		await sendMessage(page, "Mình gửi bạn phần trao đổi lúc chiều nhé.");
		const ownId = await sendVoiceFixture(page);
		await sendMessage(peerPage, "Ừ, mình nghe đây.");
		const peerId = await sendVoiceFixture(peerPage, 12);
		const ownVoice = page.locator(`#message-${ownId}`).getByRole("group", { name: "Voice message" });
		const peerVoice = page.locator(`#message-${peerId}`).getByRole("group", { name: "Voice message" });
		await expect(ownVoice).toBeVisible();
		await expect(peerVoice).toBeVisible();
		const playerBounds = await ownVoice.boundingBox();
		expect(playerBounds?.width).toBeLessThanOrEqual(244);
		expect(playerBounds?.height).toBeLessThanOrEqual(60);
		await expect(page.getByRole("complementary").getByText("Voice message", { exact: true })).toBeVisible();
		await expect(ownVoice.getByText("0:08", { exact: true })).toBeVisible();
		await ownVoice.getByRole("button", { name: "Play voice message" }).click();
		await expect(ownVoice.getByRole("button", { name: "Pause voice message" })).toBeVisible();
		await expect
			.poll(() => ownVoice.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime))
			.toBeGreaterThan(0.1);
		await peerVoice.getByRole("button", { name: "Play voice message" }).click();
		await expect(ownVoice.getByRole("button", { name: "Play voice message" })).toBeVisible();
		await expect(peerVoice.getByRole("button", { name: "Pause voice message" })).toBeVisible();
		await peerVoice.getByRole("button", { name: "Pause voice message" }).click();

		const slider = ownVoice.getByRole("slider", { name: "Seek voice message" });
		await slider.press("Home");
		await expect(slider).toHaveValue("0");
		await slider.press("ArrowRight");
		await expect(slider).toHaveValue("0.1");
		await slider.press("End");
		await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(7.8);
		await slider.press("Home");
		const bounds = await slider.boundingBox();
		if (!bounds) throw new Error("Voice seek control is not laid out");
		await page.mouse.click(bounds.x + bounds.width * 0.6, bounds.y + bounds.height / 2);
		await expect
			.poll(() => ownVoice.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime))
			.toBeGreaterThan(4);
		const speed = ownVoice.getByRole("button", { name: "Change playback speed" });
		await speed.click();
		await expect(speed).toHaveText("1.5×");
		await expect
			.poll(() => ownVoice.locator("audio").evaluate((audio: HTMLAudioElement) => audio.playbackRate))
			.toBe(1.5);
		await speed.click();
		await expect(speed).toHaveText("2×");
		await speed.click();
		await expect(speed).toHaveText("1×");

		await page.mouse.move(600, 80);
		await page.screenshot({ animations: "disabled", path: "/tmp/chatty-voice-desktop.png" });
		await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
		await page.screenshot({ animations: "disabled", path: "/tmp/chatty-voice-dark.png" });
		await page.setViewportSize({ width: 375, height: 812 });
		await expect(ownVoice).toBeInViewport();
		await expect(peerVoice).toBeInViewport();
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
			.toBeLessThanOrEqual(0);
		await page.screenshot({ animations: "disabled", path: "/tmp/chatty-voice-mobile.png" });
		await ownVoice.getByRole("button", { name: "Play voice message" }).click();
		await expect(ownVoice.getByRole("button", { name: "Pause voice message" })).toBeVisible();
	} finally {
		await sender.close();
		await peer.close();
	}
});

test("recording can be previewed, discarded and sent from the mobile composer", async ({ browser }) => {
	const senderUser = makeUser("VoiceAuthor");
	const peerUser = makeUser("VoiceReader");
	const sender = await browser.newContext({
		viewport: { width: 375, height: 812 },
		permissions: ["microphone"],
		hasTouch: true,
		isMobile: true,
	});
	const peer = await browser.newContext();
	try {
		const page = await sender.newPage();
		const peerPage = await peer.newPage();
		await register(peerPage, peerUser);
		await register(page, senderUser);
		await startDirectChat(page, peerUser);
		await openConversationWith(peerPage, senderUser);
		const receivedId = await sendVoiceFixture(peerPage);
		const receivedVoice = page.locator(`#message-${receivedId}`).getByRole("group", { name: "Voice message" });
		await receivedVoice.getByRole("button", { name: "Play voice message" }).tap();
		await expect(receivedVoice.getByRole("button", { name: "Pause voice message" })).toBeVisible();
		await page.getByRole("button", { name: "Record a voice message" }).tap();
		await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
		const recorder = page.getByRole("group", { name: "Voice recorder" });
		expect((await recorder.boundingBox())?.height).toBeLessThanOrEqual(48);
		await expect(receivedVoice.getByRole("button", { name: "Play voice message" })).toBeVisible();
		await expect
			.poll(() => receivedVoice.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused))
			.toBe(true);
		// A real microphone capture needs elapsed audio before it can be previewed.
		await page.waitForTimeout(1_200);
		await page.screenshot({ animations: "disabled", path: "/tmp/chatty-voice-recording.png" });
		await page.getByRole("button", { name: "Stop recording" }).tap();
		await page.getByRole("button", { name: "Play recording preview" }).tap();
		await expect(page.getByRole("button", { name: "Pause recording preview" })).toBeVisible();
		await page.getByRole("button", { name: "Pause recording preview" }).tap();
		expect((await recorder.boundingBox())?.height).toBeLessThanOrEqual(48);
		await page.screenshot({ animations: "disabled", path: "/tmp/chatty-voice-preview.png" });
		await page.getByRole("button", { name: "Discard recording" }).tap();
		await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
		await expect(page.getByRole("button", { name: "Send voice message" })).toBeHidden();
		await page.getByRole("button", { name: "Record a voice message" }).tap();
		await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
		await page.waitForTimeout(1_200);
		await page.getByRole("button", { name: "Stop recording" }).tap();
		await page.getByRole("button", { name: "Send voice message" }).tap();
		await expect(peerPage.getByRole("main").getByRole("button", { name: "Play voice message" })).toHaveCount(2, {
			timeout: 15_000,
		});
		await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
		await expect(page.getByRole("button", { name: "Record a voice message" })).toBeVisible();
	} finally {
		await sender.close();
		await peer.close();
	}
});
