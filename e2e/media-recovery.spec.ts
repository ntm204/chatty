import { expect, test } from "@playwright/test";
import { makeUser, register, startDirectChat } from "./helpers.js";
import { sendVoiceFixture } from "./fixtures/voice.js";
import type { MessageDTO } from "@chatty/shared-types";

test("expired image and voice URLs recover through authenticated renewal", async ({ browser }) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	try {
		const page = await context.newPage();
		const peer = makeUser("RecoveryPeer");
		await register(await peerContext.newPage(), peer);
		await register(page, makeUser("RecoverMe"));
		await startDirectChat(page, peer);
		const renewed = new Set<string>();
		const renewals: string[] = [];
		await page.route("**/attachments/**", async (route) => {
			const path = new URL(route.request().url()).pathname;
			const id = path.split("/")[2]!;
			if (path.endsWith("/urls")) {
				const response = await route.fetch();
				if (response.ok()) renewed.add(id);
				renewals.push(id);
				await route.fulfill({ response });
			} else if (!renewed.has(id)) {
				await route.fulfill({ status: 403, body: "Expired media URL" });
			} else {
				await route.continue();
			}
		});
		await page.locator('input[type="file"][multiple]').setInputFiles({
			name: "recovery.png",
			mimeType: "image/png",
			buffer: Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
				"base64",
			),
		});
		const field = page.getByLabel("Message", { exact: true });
		await field.fill("Recover this image");
		const sent = page.waitForResponse(
			(response) =>
				response.request().method() === "POST" &&
				response.url().endsWith("/messages") &&
				response.status() === 201,
		);
		await field.press("Enter");
		const imageMessage = (await (await sent).json()) as MessageDTO;
		await page.locator(`#message-${imageMessage.id}`).getByAltText("Recover this image").click();
		const viewer = page.getByRole("dialog");
		await expect(viewer.getByRole("button", { name: "Retry image" })).toBeVisible();
		await viewer.getByRole("button", { name: "Retry image" }).click();
		await expect
			.poll(() =>
				viewer.getByAltText("Recover this image").evaluate((image: HTMLImageElement) => image.naturalWidth),
			)
			.toBeGreaterThan(0);
		expect(renewals.filter((id) => id === imageMessage.attachments[0]!.id)).toHaveLength(1);
		await page.keyboard.press("Escape");
		const voiceId = await sendVoiceFixture(page);
		const voice = page.locator(`#message-${voiceId}`).getByRole("group", { name: "Voice message" });
		await voice.getByRole("button", { name: "Play voice message" }).click();
		await expect(voice.getByRole("button", { name: "Retry voice message" })).toBeVisible();
		await voice.getByRole("button", { name: "Retry voice message" }).click();
		// WebKit may require a second user gesture after asynchronous authorization.
		await expect(
			voice
				.getByRole("button", { name: "Pause voice message" })
				.or(voice.getByText("Playback was blocked. Tap Retry to play.")),
		).toBeVisible();
		if (await voice.getByText("Playback was blocked. Tap Retry to play.").isVisible())
			await voice.getByRole("button", { name: "Retry voice message" }).click();
		await expect
			.poll(() => voice.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime))
			.toBeGreaterThan(0.1);
		expect(renewals).toHaveLength(2);
	} finally {
		await context.close();
		await peerContext.close();
	}
});
