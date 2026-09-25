import { cpus, platform, arch, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { expect, test } from "@playwright/test";
import { makeUser, register, startDirectChat, openConversationWith } from "./helpers.js";

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

function summarize(samples: number[]) {
	const sorted = [...samples].sort((left, right) => left - right);
	const percentile = (fraction: number) =>
		Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!.toFixed(2));

	return { n: samples.length, medianMs: percentile(0.5), p95Ms: percentile(0.95), maxMs: percentile(1) };
}

test("measures local built-app interactions, API load and retained browser memory", async ({ browser }, testInfo) => {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		reducedMotion: "reduce",
		serviceWorkers: "block",
		permissions: ["microphone"],
	});
	const peerContext = await browser.newContext({ reducedMotion: "reduce", serviceWorkers: "block" });
	const report: Record<string, unknown> = {
		environment: {
			browser: browser.version(),
			cpu: cpus()[0]?.model,
			cores: cpus().length,
			ramGiB: totalmem() / 2 ** 30,
			platform: platform(),
			arch: arch(),
			node: process.version,
		},
		limits: "Localhost, compiled API with NODE_ENV=test (rate limits disabled), built web, no service worker, two browser clients. CPU throttle is not a physical low-end device. Timings include automation. Forced-GC JS heap excludes native/GPU media memory.",
	};
	try {
		const page = await context.newPage();
		const other = await peerContext.newPage();
		const peer = makeUser("PerfPeer");
		const author = makeUser("PerfAuthor");
		await register(other, peer);
		await register(page, author);
		await startDirectChat(page, peer);
		await openConversationWith(other, author);
		const token = await page.evaluate(() => localStorage.getItem("chatty:token"));
		const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
		const api = "http://localhost:4100";
		const initial = (await (await fetch(`${api}/conversations`, { headers })).json()) as {
			items: { id: string; participants: { id: string }[] }[];
		};
		const conversation = initial.items[0]!;
		const endpoint = `${api}/conversations/${conversation.id}/messages`;
		for (let index = 0; index < 1000; index++) {
			const response = await fetch(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify({
					content: `Measure ${index}: tiếng Việt 🙂 https://example.com/reference/${index}`,
				}),
			});
			if (!response.ok) throw new Error(`Seed failed: ${response.status}`);
			await response.arrayBuffer();
		}
		for (let index = 0; index < 30; index++) {
			const response = await fetch(`${api}/conversations`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					participantIds: conversation.participants.map((user) => user.id),
					name: `Measure group ${index}`,
				}),
			});
			if (!response.ok) throw new Error(`Group seed failed: ${response.status}`);
			await response.arrayBuffer();
		}
		report.dataset = { historyMessages: 1000, extraGroups: 30, participantsPerGroup: 2 };
		console.info("PERF seeded");
		const cdp = await context.newCDPSession(page);
		await cdp.send("Performance.enable");
		await cdp.send("Network.enable");
		const coldLoads: number[] = [];
		for (let index = 0; index < 5; index++) {
			await cdp.send("Network.clearBrowserCache");
			const start = performance.now();
			await page.reload();
			await expect(page.getByLabel("Find someone")).toBeVisible();
			coldLoads.push(performance.now() - start);
		}
		report.coldHttpCacheChatShell = summarize(coldLoads);
		await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
		await cdp.send("Network.emulateNetworkConditions", {
			offline: false,
			latency: 150,
			downloadThroughput: 200_000,
			uploadThroughput: 100_000,
		});
		const slowLoads: number[] = [];
		for (let index = 0; index < 3; index++) {
			await cdp.send("Network.clearBrowserCache");
			const start = performance.now();
			await page.reload();
			await expect(page.getByLabel("Find someone")).toBeVisible({ timeout: 30_000 });
			slowLoads.push(performance.now() - start);
		}
		report.slowColdShell = {
			...summarize(slowLoads),
			cpuRate: 4,
			latencyMs: 150,
			downloadBytesPerSecond: 200_000,
			uploadBytesPerSecond: 100_000,
		};
		await cdp.send("Network.emulateNetworkConditions", {
			offline: false,
			latency: 0,
			downloadThroughput: -1,
			uploadThroughput: -1,
		});
		await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
		await openConversationWith(page, peer);
		await expect(page.getByLabel("Message history")).toContainText("Measure 999:");
		const field = page.getByLabel("Message", { exact: true });
		const frames = () =>
			page.evaluate(
				() =>
					new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
			);
		for (const rate of [1, 4]) {
			await cdp.send("Emulation.setCPUThrottlingRate", { rate });
			const typing: number[] = [],
				panels: number[] = [],
				searches: number[] = [],
				delivery: number[] = [];
			for (let index = 0; index < 10; index++) {
				let start = performance.now();
				await field.fill(`Typing measurement ${index}`);
				await frames();
				typing.push(performance.now() - start);
				start = performance.now();
				await page.getByRole("button", { name: "Conversation storage and details" }).click();
				await expect(page.getByRole("complementary", { name: "Conversation details" })).toBeVisible();
				await frames();
				panels.push(performance.now() - start);
				await page.getByRole("button", { name: "Close conversation storage" }).click();
				await field.press("Control+f");
				start = performance.now();
				await page
					.getByRole("textbox", { name: "Search in conversation", exact: true })
					.fill(`Measure ${990 + index}:`);
				await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();
				searches.push(performance.now() - start);
				await page.getByRole("textbox", { name: "Search in conversation", exact: true }).press("Escape");
				await field.fill(`Delivery ${rate}-${index}`);
				start = performance.now();
				await field.press("Enter");
				await expect(
					other.getByRole("main").getByText(`Delivery ${rate}-${index}`, { exact: true }),
				).toBeVisible();
				delivery.push(performance.now() - start);
			}
			report[`cpu${rate}x`] = {
				typing: summarize(typing),
				openDetails: summarize(panels),
				searchIncludingDebounce: summarize(searches),
				sendToPeerVisible: summarize(delivery),
			};
			console.info(`PERF CPU ${rate}x complete`);
		}
		await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
		const heap = async () => {
			await cdp.send("HeapProfiler.collectGarbage");
			const usage = await cdp.send("Runtime.getHeapUsage");
			const dom = await cdp.send("Memory.getDOMCounters");

			return { jsHeapMiB: Number((usage.usedSize / 2 ** 20).toFixed(2)), ...dom };
		};
		const history = page.getByLabel("Message history");
		const historyBefore = await heap();
		const scrollPages: number[] = [];
		for (let index = 0; index < 10; index++) {
			const loaded = await page.locator('[id^="message-"]').count();
			const start = performance.now();
			await history.evaluate((element) => {
				element.scrollTop = 0;
				element.dispatchEvent(new Event("scroll"));
			});
			await expect.poll(() => page.locator('[id^="message-"]').count()).toBeGreaterThan(loaded);
			await frames();
			scrollPages.push(performance.now() - start);
		}
		const deepRows = await page.locator('[id^="message-"]').count();
		const historyDeep = await heap();
		await page.getByRole("button", { name: "Jump to latest messages" }).click();
		await expect.poll(() => page.locator('[id^="message-"]').count(), { timeout: 15_000 }).toBeLessThanOrEqual(200);
		report.history = {
			loadOlder: summarize(scrollPages),
			rowsAtDepth: deepRows,
			rowsAfterReturn: await page.locator('[id^="message-"]').count(),
			before: historyBefore,
			atDepth: historyDeep,
			afterReturn: await heap(),
		};
		await page.evaluate(() => {
			const originalCreate = URL.createObjectURL.bind(URL),
				originalRevoke = URL.revokeObjectURL.bind(URL);
			const active = new Set<string>();
			Object.assign(window, { perfObjectUrls: active });
			URL.createObjectURL = (blob) => {
				const url = originalCreate(blob);
				active.add(url);
				return url;
			};
			URL.revokeObjectURL = (url) => {
				active.delete(url);
				originalRevoke(url);
			};
		});
		const mediaImage = Buffer.from(
			await page.evaluate(() => {
				const canvas = document.createElement("canvas");
				canvas.width = 1280;
				canvas.height = 720;
				const drawing = canvas.getContext("2d")!;
				const gradient = drawing.createLinearGradient(0, 0, 1280, 720);
				gradient.addColorStop(0, "#101039");
				gradient.addColorStop(1, "#ffe600");
				drawing.fillStyle = gradient;
				drawing.fillRect(0, 0, 1280, 720);

				return canvas.toDataURL("image/png").split(",")[1]!;
			}),
			"base64",
		);
		const media: unknown[] = [await heap()];
		for (let batch = 0; batch < 3; batch++) {
			for (let index = 0; index < 20; index++) {
				await page.locator('input[type="file"][multiple]').setInputFiles({
					name: "memory.png",
					mimeType: "image/png",
					buffer: mediaImage,
				});
				await expect(page.getByAltText("Attached image preview 1")).toBeVisible();
				await page.getByRole("button", { name: "Remove attached image 1" }).click();
				await expect(page.getByAltText("Attached image preview 1")).toHaveCount(0);
			}
			await frames();
			media.push({
				cycles: (batch + 1) * 20,
				...(await heap()),
				objectUrls: await page.evaluate(
					() => (window as unknown as { perfObjectUrls: Set<string> }).perfObjectUrls.size,
				),
			});
		}
		report.mediaPreviewMemory = media;
		await page
			.locator('input[type="file"][multiple]')
			.setInputFiles({ name: "memory.png", mimeType: "image/png", buffer: mediaImage });
		await field.fill("Memory image");
		await field.press("Enter");
		await expect(other.getByRole("main").getByAltText("Memory image")).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole("button", { name: "Open image and caption: Memory image" })).toBeVisible();
		await expect(page.getByRole("main").getByText("Sending…", { exact: true })).toHaveCount(0);
		const viewers: unknown[] = [await heap()];
		for (let batch = 0; batch < 3; batch++) {
			for (let index = 0; index < 10; index++) {
				await page.getByRole("button", { name: "Open image and caption: Memory image" }).click();
				await page.getByRole("button", { name: "Close image preview" }).click();
			}
			viewers.push({ cycles: (batch + 1) * 10, ...(await heap()) });
		}
		report.imageViewerMemory = viewers;
		const voice: unknown[] = [await heap()];
		for (let index = 0; index < 10; index++) {
			await page.getByRole("button", { name: "Record a voice message" }).click();
			await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
			await page.waitForTimeout(600);
			await page.getByRole("button", { name: "Stop recording" }).click();
			await page.getByRole("button", { name: "Discard recording" }).click();
			if ((index + 1) % 5 === 0)
				voice.push({
					cycles: index + 1,
					...(await heap()),
					objectUrls: await page.evaluate(
						() => (window as unknown as { perfObjectUrls: Set<string> }).perfObjectUrls.size,
					),
				});
		}
		report.voicePreviewMemory = voice;
		console.info("PERF browser memory complete");
		const apiResults: unknown[] = [];
		for (const concurrency of [1, 5, 20]) {
			for (const operation of ["list", "history", "search", "send"]) {
				const samples: number[] = [];
				const statuses: Record<string, number> = {};
				let next = 0;
				const started = performance.now();
				await Promise.all(
					Array.from({ length: concurrency }, async () => {
						while (next < 100) {
							const index = next++;
							const url =
								operation === "list"
									? `${api}/conversations`
									: operation === "search"
										? `${api}/search/messages?query=Measure&limit=20`
										: endpoint;
							const start = performance.now();
							const response = await fetch(url, {
								headers,
								...(operation === "send"
									? {
											method: "POST",
											body: JSON.stringify({
												content: `Load ${concurrency}-${index}`,
												clientId: crypto.randomUUID(),
											}),
										}
									: {}),
							});
							await response.arrayBuffer();
							samples.push(performance.now() - start);
							statuses[response.status] = (statuses[response.status] ?? 0) + 1;
						}
					}),
				);
				apiResults.push({
					operation,
					concurrency,
					...summarize(samples),
					requestsPerSecond: Number((100000 / (performance.now() - started)).toFixed(1)),
					statuses,
				});
			}
			console.info(`PERF API concurrency ${concurrency} complete`);
		}
		report.api = apiResults;
	} finally {
		console.info("PERFORMANCE_REPORT", JSON.stringify(report));
		await testInfo.attach("performance-report.json", {
			body: JSON.stringify(report, null, 2),
			contentType: "application/json",
		});
		await context.close();
		await peerContext.close();
	}
});
