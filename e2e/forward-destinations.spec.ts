import { expect, test } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

test("finds an archived destination outside loaded pages and retries a committed forward without duplication", async ({
	browser,
}) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	const thirdContext = await browser.newContext();
	const page = await context.newPage();
	const peer = makeUser("ForwardPeer");
	const third = makeUser("ForwardThird");
	await register(await peerContext.newPage(), peer);
	await register(await thirdContext.newPage(), third);
	await register(page, makeUser("ForwardAuthor"));
	const destinationId = await page.evaluate(
		async ({ handles }) => {
			const headers = {
				Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
				"Content-Type": "application/json",
			};
			const ids: string[] = [];
			for (const handle of handles) {
				const users = await (await fetch(`http://localhost:4100/users?query=${handle}`, { headers })).json();
				ids.push(users[0].id);
			}
			let target = "";
			for (let index = 0; index < 23; index++) {
				const response = await fetch("http://localhost:4100/conversations", {
					method: "POST",
					headers,
					body: JSON.stringify({
						participantIds: ids,
						name: index === 0 ? "Remote archive destination" : `Filler group ${index}`,
					}),
				});
				if (!response.ok) throw new Error(await response.text());
				const conversation = await response.json();
				if (index === 0) target = conversation.id;
			}
			const archived = await fetch(`http://localhost:4100/conversations/${target}/archive`, {
				method: "PUT",
				headers,
				body: JSON.stringify({ archived: true }),
			});
			if (!archived.ok) throw new Error("Archive failed");
			return target;
		},
		{ handles: [peer.handle, third.handle] },
	);
	await startDirectChat(page, peer);
	await sendMessage(page, "Forward exactly once");
	await page.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Forward", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Forward message", exact: true });
	await expect(dialog.getByRole("button", { name: "Load more conversations" })).toBeVisible();
	await expect(dialog.getByRole("button", { name: /Remote archive destination/ })).toHaveCount(0);
	await dialog.getByLabel("Find a conversation to forward to").fill("Remote archive");
	const target = dialog.getByRole("button", { name: /Remote archive destination/ });
	await expect(target).toBeVisible();
	let shouldLoseResponse = true;
	let releaseForward!: () => void;
	const canCompleteForward = new Promise<void>((resolve) => {
		releaseForward = resolve;
	});
	await page.route(`**/conversations/${destinationId}/messages`, async (route) => {
		if (route.request().method() === "POST" && shouldLoseResponse) {
			shouldLoseResponse = false;
			await canCompleteForward;
			const response = await route.fetch();
			expect(response.ok()).toBe(true);
			await route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ message: "Forward response lost" }),
			});
		} else await route.continue();
	});
	await target.click();
	await expect(target).toBeDisabled();
	await page.keyboard.press("Tab");
	await expect(dialog).toBeFocused();
	await page.keyboard.press("Shift+Tab");
	await expect(dialog).toBeFocused();
	releaseForward();
	await expect(dialog.getByRole("alert")).toContainText("Forward response lost");
	await target.click();
	await expect(dialog.getByRole("status")).toHaveText("Forwarded to Remote archive destination.");
	await expect(dialog.getByRole("button", { name: "Done", exact: true })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(dialog).toHaveCount(0);
	const count = await page.evaluate(async (id) => {
		const response = await fetch(`http://localhost:4100/conversations/${id}/messages`, {
			headers: { Authorization: `Bearer ${localStorage.getItem("chatty:token")}` },
		});
		if (!response.ok) throw new Error("Message lookup failed");
		const page = await response.json();
		return page.filter((message: { content: string }) => message.content === "Forward exactly once").length;
	}, destinationId);
	expect(count).toBe(1);
	await page.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Forward", exact: true }).click();
	await dialog.getByLabel("Find a conversation to forward to").fill("Remote archive");
	await expect(target).toBeVisible();
	await page.evaluate(async () => {
		const headers = { Authorization: `Bearer ${localStorage.getItem("chatty:token")}` };
		const conversations = await (await fetch("http://localhost:4100/conversations", { headers })).json();
		const direct = conversations.items.find((conversation: { isGroup: boolean }) => !conversation.isGroup);
		const messages = await (
			await fetch(`http://localhost:4100/conversations/${direct.id}/messages`, { headers })
		).json();
		const source = messages.find((message: { content: string }) => message.content === "Forward exactly once");
		const response = await fetch(`http://localhost:4100/conversations/${direct.id}/messages/${source.id}`, {
			method: "DELETE",
			headers,
		});
		if (!response.ok) throw new Error("Retraction failed");
	});
	await target.click();
	await expect(dialog.getByRole("alert")).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
	await dialog.getByRole("button", { name: "Close forward panel" }).click();
	await context.close();
	await peerContext.close();
	await thirdContext.close();
});
