import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";
import {
	captureReadingAnchor,
	expectMessageLocationCue,
	expectReadingAnchor,
	expectReplyReturnControl,
} from "./message-navigation-assertions.js";

test("reply context returns to the reader's anchor across unloaded history", async ({ browser }, testInfo) => {
	test.setTimeout(60_000);
	const context = await browser.newContext({
		reducedMotion: "reduce",
		colorScheme: "dark",
		viewport: { width: 1440, height: 900 },
	});
	const peerContext = await browser.newContext({ reducedMotion: "reduce" });
	try {
		const page = await context.newPage();
		const peer = makeUser("AnchorPeer");
		await register(await peerContext.newPage(), peer);
		await register(page, makeUser("AnchorAuthor"));
		await startDirectChat(page, peer);
		await Promise.all([
			page.waitForResponse(
				(response) =>
					response.url().endsWith("/messages") &&
					response.request().method() === "POST" &&
					response.status() === 201,
			),
			sendMessage(page, "Original context"),
		]);
		await expect(page.getByLabel("Message history")).toContainText("Original context");
		const { originalId, replyId } = await page.evaluate(async () => {
			const headers = {
				Authorization: `Bearer ${localStorage.getItem("chatty:token")}`,
				"Content-Type": "application/json",
			};
			const conversations = await (await fetch("http://localhost:4100/conversations", { headers })).json();
			const id = conversations.items[0].id;
			const messages = await (
				await fetch(`http://localhost:4100/conversations/${id}/messages`, { headers })
			).json();
			for (let index = 0; index < 65; index++) {
				const response = await fetch(`http://localhost:4100/conversations/${id}/messages`, {
					method: "POST",
					headers,
					body: JSON.stringify({ content: `History line ${index}` }),
				});
				if (!response.ok) throw new Error("Could not seed history");
			}
			const response = await fetch(`http://localhost:4100/conversations/${id}/messages`, {
				method: "POST",
				headers,
				body: JSON.stringify({ content: "Reply from today", replyToId: messages[0].id }),
			});
			if (!response.ok) throw new Error("Could not seed reply");
			return { originalId: messages[0].id as string, replyId: (await response.json()).id as string };
		});
		await page.reload();
		await openConversationWith(page, peer);
		const reply = page.locator(`#message-${replyId}`);
		await expect(reply).toBeVisible();
		const original = page.locator(`#message-${originalId}`);
		const header = page.locator(".conversation-header");
		const composer = page.getByRole("textbox", { name: "Message", exact: true });
		const headerBefore = (await header.boundingBox())!;
		const composerBefore = (await composer.boundingBox())!;
		const anchor = await captureReadingAnchor(page);
		await reply.getByRole("button", { name: /original/i }).click();
		await expect(original).toBeInViewport();
		await expectMessageLocationCue(original);
		await expectReplyReturnControl(page);
		expect((await header.boundingBox())!.y).toBeCloseTo(headerBefore.y, 0);
		expect((await composer.boundingBox())!.y).toBeCloseTo(composerBefore.y, 0);
		await page.screenshot({ path: testInfo.outputPath("reply-location-desktop-dark.png") });
		await page.emulateMedia({ colorScheme: "light" });
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await page.screenshot({ path: testInfo.outputPath("reply-location-desktop-light.png") });
		await expect(original).not.toHaveAttribute("data-message-located", "true", { timeout: 5_000 });
		await expect(page.getByRole("button", { name: "Back to reply", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Back to reply", exact: true }).click();
		await expect(page.getByRole("button", { name: "Back to reply", exact: true })).toHaveCount(0);
		await expectReadingAnchor(page, anchor);
		await expect(page.getByLabel("Message history")).toBeFocused();

		await page.setViewportSize({ width: 375, height: 812 });
		await page.emulateMedia({ colorScheme: "dark" });
		await reply.scrollIntoViewIfNeeded();
		const mobileAnchor = await captureReadingAnchor(page);
		const mobileComposerBefore = (await composer.boundingBox())!;
		const quote = reply.getByRole("button", { name: /original/i });
		await quote.focus();
		await quote.press("Enter");
		await expectMessageLocationCue(original);
		await expectReplyReturnControl(page);
		expect((await composer.boundingBox())!.y).toBeCloseTo(mobileComposerBefore.y, 0);
		await page.screenshot({ path: testInfo.outputPath("reply-location-mobile-dark.png") });
		const returnButton = page.getByRole("button", { name: "Back to reply", exact: true });
		await returnButton.focus();
		await returnButton.press("Enter");
		await expect(returnButton).toHaveCount(0);
		await expectReadingAnchor(page, mobileAnchor);
		await expect(page.getByLabel("Message history")).toBeFocused();

		await quote.click();
		await expect(returnButton).toBeVisible();
		await page.getByRole("button", { name: "Jump to latest messages", exact: true }).click();
		await expect(reply).toBeInViewport();
		await expect(returnButton).toHaveCount(0);
		await expect(page.locator('[data-message-located="true"]')).toHaveCount(0);
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
	} finally {
		await context.close();
		await peerContext.close();
	}
});
