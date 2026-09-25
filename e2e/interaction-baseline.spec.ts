import { cpus, platform, arch } from "node:os";
import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, startDirectChat } from "./helpers.js";

test("records a repeatable interaction baseline and preserves mixed image choices", async ({ browser }, testInfo) => {
	test.setTimeout(60_000);
	const context = await browser.newContext({ viewport: { width: 1280, height: 760 }, reducedMotion: "reduce" });
	const peerContext = await browser.newContext({ reducedMotion: "reduce" });
	try {
		const page = await context.newPage();
		const peer = makeUser("MeasurePeer");
		await register(await peerContext.newPage(), peer);
		await register(page, makeUser("MeasureAuthor"));
		await startDirectChat(page, peer);
		await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
		await page.evaluate(async () => {
			const headers = {
				Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
				"Content-Type": "application/json",
			};
			const conversations = await (await fetch("http://localhost:4100/conversations", { headers })).json();
			const id = conversations.items[0].id;
			for (let index = 0; index < 200; index++) {
				const response = await fetch(`http://localhost:4100/conversations/${id}/messages`, {
					method: "POST",
					headers,
					body: JSON.stringify({
						content: `Baseline ${index}: tiếng Việt có dấu, emoji 🙂 and https://example.com/a-long-readable-path`,
					}),
				});
				if (!response.ok) throw new Error("Baseline seeding failed");
			}
		});
		await page.reload();
		await openConversationWith(page, peer);
		await expect(page.getByLabel("Message history")).toContainText("Baseline 199:");
		const field = page.getByLabel("Message", { exact: true });
		const samples: number[] = [];
		for (let index = 0; index < 10; index++) {
			const start = await page.evaluate(() => performance.now());
			await field.fill(`Bản nháp đo tương tác ${index}`);
			await page.evaluate(
				() =>
					new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
			);
			samples.push((await page.evaluate(() => performance.now())) - start);
		}
		const sorted = [...samples].sort((left, right) => left - right);
		const result = {
			browser: browser.browserType().name(),
			version: browser.version(),
			platform: platform(),
			arch: arch(),
			cpu: cpus()[0]?.model,
			viewport: "1280x760",
			messagesInDatabase: 200,
			renderedRows: await page.locator('[id^="message-"]').count(),
			metric: "Playwright fill to two animation frames; includes automation overhead, not a production latency SLO",
			samplesMs: samples,
			medianMs: sorted[5],
			maxMs: sorted.at(-1),
		};
		await testInfo.attach("interaction-baseline.json", {
			body: JSON.stringify(result, null, 2),
			contentType: "application/json",
		});
		console.info("Interaction baseline:", JSON.stringify(result));
		await page.locator('input[type="file"][multiple]').setInputFiles([
			{
				name: "valid.png",
				mimeType: "image/png",
				buffer: Buffer.from(
					"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
					"base64",
				),
			},
			{ name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
		]);
		await expect(page.getByAltText("Attached image preview 1")).toBeVisible();
		await expect(page.getByText(/too-large.png: each image must be smaller/)).toBeVisible();
		await expect(field).toHaveValue("Bản nháp đo tương tác 9");
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.getByAltText("Attached image preview 1")).toBeInViewport();
		await expect(field).toBeInViewport();
		await page.screenshot({ path: "/tmp/chatty-acceptance-mobile-composer.png", animations: "disabled" });
	} finally {
		await context.close();
		await peerContext.close();
	}
});
