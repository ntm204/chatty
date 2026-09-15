import { expect, test } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

test("failed reactions, pins and deletes show an inline error and recover deliberately", async ({ browser }) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	const page = await context.newPage();
	const peer = await peerContext.newPage();
	const other = makeUser("ActionPeer");
	await register(peer, other);
	await register(page, makeUser("ActionAuthor"));
	await startDirectChat(page, other);
	await sendMessage(page, "Keep this message until deletion succeeds");
	const content = page
		.getByLabel("Message history")
		.getByText("Keep this message until deletion succeeds", { exact: true });
	await expect
		.poll(() => content.evaluate((element) => element.closest('[id^="message-"]')!.id))
		.not.toContain("draft");
	const composer = page.getByRole("textbox", { name: "Message", exact: true });
	await composer.fill("My next message stays here");
	let shouldFail = true;
	let mutationCount = 0;
	await page.route("**/conversations/*/messages/**", async (route) => {
		if (["POST", "PUT", "DELETE"].includes(route.request().method())) {
			mutationCount++;
			if (shouldFail) {
				await route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({ message: "Temporary failure" }),
				});
				return;
			}
		}
		await route.continue();
	});

	await page.getByLabel("React to message").click();
	await page.getByRole("menuitem", { name: "React with ❤️" }).click();
	await expect(page.getByLabel("Message history").getByRole("alert")).toContainText(
		"Could not confirm your reaction",
	);
	await expect(page.getByRole("button", { name: "❤️, 1" })).toHaveCount(0);
	expect(mutationCount).toBe(1);
	shouldFail = false;
	await page.getByLabel("React to message").click();
	await page.getByRole("menuitem", { name: "React with ❤️" }).click();
	await expect(page.getByRole("button", { name: "❤️, 1" })).toBeVisible();
	await expect(page.getByLabel("Message history").getByRole("alert")).toHaveCount(0);

	shouldFail = true;
	await page.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Pin message", exact: true }).click();
	await expect(page.getByLabel("Message history").getByRole("alert")).toContainText("Could not confirm pinning");
	await expect(page.locator(".pinned-messages-banner")).toHaveCount(0);
	shouldFail = false;
	await page.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Pin message", exact: true }).click();
	await expect(page.locator(".pinned-messages-banner")).toBeVisible();

	shouldFail = true;
	await page.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Delete message", exact: true }).click();
	await page.getByRole("menuitem", { name: "Delete for everyone" }).click();
	await expect(page.getByLabel("Message history").getByRole("alert")).toContainText(
		"Could not confirm deletion for everyone",
	);
	await expect(content).toBeVisible();
	await expect(composer).toHaveValue("My next message stays here");
	shouldFail = false;
	await page.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Delete message", exact: true }).click();
	await page.getByRole("menuitem", { name: "Delete for everyone" }).click();
	await expect(page.getByLabel("Message history").getByText("This message was deleted")).toBeVisible();
	await expect(page.getByLabel("Message history").getByRole("alert")).toHaveCount(0);
	await expect(composer).toHaveValue("My next message stays here");

	shouldFail = true;
	await page.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Delete message", exact: true }).click();
	await page.getByRole("menuitem", { name: "Delete for me", exact: true }).click();
	await expect(page.getByLabel("Message history").getByRole("alert")).toContainText(
		"Could not confirm deletion for you",
	);
	await expect(page.getByLabel("Message history").getByText("This message was deleted")).toBeVisible();
	shouldFail = false;
	await page.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Delete message", exact: true }).click();
	await page.getByRole("menuitem", { name: "Delete for me", exact: true }).click();
	await expect(page.getByLabel("Message history").getByText("This message was deleted")).toHaveCount(0);
	await expect(composer).toHaveValue("My next message stays here");
	await context.close();
	await peerContext.close();
});
