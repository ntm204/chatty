import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

interface WorkerEnvironment {
	registration: { waiting: unknown; active: { state: string } | null };
}

test("a complete shell upgrade waits for old tabs and a failed install preserves the active build", async ({
	browser,
}) => {
	const template = await readFile("apps/web/public/sw.js", "utf8");
	let version = 1;
	let hasMissingAsset = false;
	const server = createServer((request, response) => {
		response.setHeader("Cache-Control", "no-store");
		if (request.url === "/sw.js") {
			response.setHeader("Content-Type", "application/javascript");
			response.end(
				template
					.replace('"__SHELL_VERSION__"', JSON.stringify(String(version)))
					.replace(
						'"__SHELL_HTML__"',
						JSON.stringify(
							`<!doctype html><html><body><script type="module" crossorigin src="/app-${version}.js"></script></body></html>`,
						),
					)
					.replace(
						'["__SHELL_ASSETS__"]',
						JSON.stringify([`/app-${version}.js`, ...(hasMissingAsset ? ["/missing.js"] : [])]),
					),
			);
		} else if (request.url === "/missing.js") {
			response.statusCode = 404;
			response.end();
		} else if (request.url?.startsWith("/app-")) {
			response.setHeader("Content-Type", "application/javascript");
			response.setHeader("Vary", "Origin");
			response.end(
				`document.body.textContent = ${JSON.stringify(`Build ${request.url.match(/\d+/)?.[0]}`)}; navigator.serviceWorker.register('/sw.js');`,
			);
		} else {
			response.setHeader("Content-Type", "text/html");
			response.end(
				`<!doctype html><html><body><script type="module" crossorigin src="/app-${version}.js"></script></body></html>`,
			);
		}
	}).listen(0, "127.0.0.1");
	await once(server, "listening");
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const context = await browser.newContext();
	try {
		const first = await context.newPage();
		await first.goto(origin);
		await first.evaluate(async () => {
			await navigator.serviceWorker.ready;
			await caches.open("unrelated-cache");
		});
		await expect.poll(() => first.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
		hasMissingAsset = true;
		version = 2;
		const failedWorkerPromise = context.waitForEvent("serviceworker");
		await first.evaluate(async () => {
			await (await navigator.serviceWorker.getRegistration())?.update();
		});
		await failedWorkerPromise;
		await expect
			.poll(() =>
				first.evaluate(async () => {
					const registration = await navigator.serviceWorker.getRegistration();
					return !registration?.installing && !registration?.waiting;
				}),
			)
			.toBe(true);
		await context.setOffline(true);
		await first.reload();
		await expect(first.locator("body")).toHaveText("Build 1");
		await context.setOffline(false);
		hasMissingAsset = false;
		version = 3;
		const workerPromise = context.waitForEvent("serviceworker");
		await first.evaluate(async () => {
			await (await navigator.serviceWorker.getRegistration())?.update();
		});
		const worker = await workerPromise;
		await expect
			.poll(() => first.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state))
			.toBe("installed");
		const second = await context.newPage();
		await second.goto(origin);
		await expect(second.locator("body")).toHaveText("Build 1");
		await first.close();
		await second.close();
		await expect
			.poll(() =>
				worker.evaluate(() => {
					const registration = (self as unknown as WorkerEnvironment).registration;
					return registration.waiting === null && registration.active?.state === "activated";
				}),
			)
			.toBe(true);
		await context.setOffline(true);
		const next = await context.newPage();
		await next.goto(origin);
		await expect(next.locator("body")).toHaveText("Build 3");
		expect(await next.evaluate(() => caches.keys())).toEqual(
			expect.arrayContaining(["unrelated-cache", "chatty-shell-3"]),
		);
		expect(await next.evaluate(() => caches.keys())).not.toContain("chatty-shell-1");
	} finally {
		await context.close();
		server.close();
		await once(server, "close");
	}
});
