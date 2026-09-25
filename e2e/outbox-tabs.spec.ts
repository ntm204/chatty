import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test("two tabs replay a closed thread's durable text and image outbox without duplicates", async ({ browser }) => {
	const sender = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
	const receiver = await browser.newContext({ reducedMotion: "reduce" });
	let isNetworkBlocked = false;
	// Block the transport, not local file I/O: WebKit's emulated offline mode
	// rejects both File.arrayBuffer and FileReader even for an in-memory Blob.
	await sender.route("http://localhost:4100/**", (route) =>
		isNetworkBlocked ? route.abort("internetdisconnected") : route.continue(),
	);
	try {
		const page = await sender.newPage();
		const peerPage = await receiver.newPage();
		const author = makeUser("ReplayAuthor");
		const peer = makeUser("ReplayPeer");
		await register(peerPage, peer);
		await register(page, author);
		await startDirectChat(page, peer);
		await openConversationWith(peerPage, author);
		const otherTab = await sender.newPage();
		await otherTab.goto("/");
		await expect(otherTab.getByLabel("Find someone")).toBeVisible();
		isNetworkBlocked = true;
		await sendMessage(page, "Queued across two tabs");
		await expect(page.getByText("Not sent", { exact: true })).toBeVisible();
		await page.locator('input[type="file"][multiple]').evaluate((element: HTMLInputElement) => {
			const bytes = Uint8Array.from(
				atob(
					"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
				),
				(character) => character.charCodeAt(0),
			);
			const transfer = new DataTransfer();
			transfer.items.add(new File([bytes], "queued.png", { type: "image/png" }));
			element.files = transfer.files;
			element.dispatchEvent(new Event("change", { bubbles: true }));
		});
		await sendMessage(page, "Queued image across two tabs");
		await expect(page.getByText("Not sent", { exact: true })).toHaveCount(2);
		const queued = await page.evaluate(async () => {
			const database = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open("chatty-local");
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			try {
				return await new Promise<{ attachments: { bytes: ArrayBuffer; type: string }[] }[]>(
					(resolve, reject) => {
						const request = database.transaction("outbox").objectStore("outbox").getAll();
						request.onsuccess = () => resolve(request.result);
						request.onerror = () => reject(request.error);
					},
				).then((records) =>
					records.map((record) =>
						record.attachments.map((attachment) => ({
							size: attachment.bytes.byteLength,
							type: attachment.type,
						})),
					),
				);
			} finally {
				database.close();
			}
		});
		expect(queued).toHaveLength(2);
		expect(queued.flat()).toEqual([{ size: expect.any(Number), type: "image/png" }]);
		await page.getByRole("button", { name: "Back to conversations" }).click();
		await expect(page.getByLabel("Message", { exact: true })).toHaveCount(0);
		isNetworkBlocked = false;
		await Promise.all([page, otherTab].map((tab) => tab.evaluate(() => window.dispatchEvent(new Event("online")))));
		await expect(
			peerPage.getByLabel("Message history").getByText("Queued across two tabs", { exact: true }),
		).toHaveCount(1, { timeout: 15_000 });
		const receivedImage = peerPage.getByLabel("Message history").getByAltText("Queued image across two tabs");
		await expect(receivedImage).toHaveCount(1, { timeout: 15_000 });
		await expect
			.poll(() => receivedImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
			.toBeGreaterThan(0);
		await expect
			.poll(() =>
				page.evaluate(async () => {
					const database = await new Promise<IDBDatabase>((resolve, reject) => {
						const request = indexedDB.open("chatty-local");
						request.onsuccess = () => resolve(request.result);
						request.onerror = () => reject(request.error);
					});
					try {
						return await new Promise<number>((resolve, reject) => {
							const request = database.transaction("outbox").objectStore("outbox").count();
							request.onsuccess = () => resolve(request.result);
							request.onerror = () => reject(request.error);
						});
					} finally {
						database.close();
					}
				}),
			)
			.toBe(0);
		await peerPage.reload();
		await openConversationWith(peerPage, author);
		await expect(
			peerPage.getByLabel("Message history").getByText("Queued across two tabs", { exact: true }),
		).toHaveCount(1);
		await expect(peerPage.getByLabel("Message history").getByAltText("Queued image across two tabs")).toHaveCount(
			1,
		);
	} finally {
		await sender.close();
		await receiver.close();
	}
});
