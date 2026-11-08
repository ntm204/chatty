import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";
import { sendVoiceFixture } from "./fixtures/voice.js";

/** Reach controls by browser tab order, never by moving focus through script. */
async function tabTo(page: Page, target: Locator): Promise<void> {
	await expect(target).toBeVisible();
	for (let index = 0; index < 100; index += 1) {
		if (await target.evaluateAll((elements) => elements.some((element) => element === document.activeElement)))
			return;
		await page.keyboard.press("Tab");
	}
	await expect(target).toBeFocused();
}

test("keyboard reaches sidebar, reply, reaction, search, forward and help without losing the active layer", async ({
	browser,
}) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	const page = await context.newPage();
	const peerPage = await peerContext.newPage();
	const author = makeUser("KeyAuthor");
	const peer = makeUser("KeyboardPeer");
	await register(peerPage, peer);
	await register(page, author);
	await startDirectChat(page, peer);
	await openConversationWith(peerPage, author);
	await sendMessage(page, "Keyboard source message");
	await page.bringToFront();
	const sidebarRow = page.getByRole("complementary").getByRole("button", { name: new RegExp(peer.displayName) });
	await tabTo(page, sidebarRow);
	await page.keyboard.press("Enter");
	const composer = page.getByRole("textbox", { name: "Message", exact: true });
	const source = page.locator('[id^="message-"]').filter({ hasText: "Keyboard source message" }).first();
	await tabTo(page, source.getByRole("button", { name: "Reply to message" }));
	await page.keyboard.press("Enter");
	await expect(page.getByRole("button", { name: "Cancel reply", exact: true })).toBeVisible();
	await tabTo(page, composer);
	await page.keyboard.insertText("Keyboard reply");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("main").getByText("Keyboard reply", { exact: true })).toBeVisible();

	await tabTo(page, source.getByRole("button", { name: "React to message" }));
	await page.keyboard.press("Enter");
	const firstReaction = page.getByRole("menuitem", { name: "React with ❤️", exact: true });
	await expect(firstReaction).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(source.getByRole("button", { name: "❤️, 1", exact: true })).toBeVisible();

	await page.keyboard.press("Control+f");
	const search = page.getByRole("textbox", { name: "Search in conversation", exact: true });
	await expect(search).toBeFocused();
	await page.keyboard.insertText("Keyboard source");
	await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(search).toHaveCount(0);

	await tabTo(page, source.getByRole("button", { name: "Message actions", exact: true }));
	await page.keyboard.press("Enter");
	const forwardAction = page.getByRole("menuitem", { name: "Forward", exact: true });
	for (let index = 0; index < 8; index += 1) {
		if (
			await forwardAction.evaluateAll((elements) =>
				elements.some((element) => element === document.activeElement),
			)
		)
			break;
		await page.keyboard.press("ArrowDown");
	}
	await expect(forwardAction).toBeFocused();
	await page.keyboard.press("Enter");
	const forward = page.getByRole("dialog", { name: "Forward message", exact: true });
	await expect(forward).toHaveAttribute("aria-modal", "true");
	const destinationSearch = forward.getByRole("searchbox", { name: "Find a conversation to forward to" });
	await expect(destinationSearch).toBeFocused();
	await page.keyboard.insertText(peer.displayName);
	const destination = forward.getByRole("button", { name: new RegExp(peer.displayName) });
	await expect(destination).toBeVisible();
	await page.keyboard.press("Tab");
	await expect(destination).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(forward.getByRole("status")).toHaveText(`Forwarded to ${peer.displayName}.`);
	await expect(forward.getByRole("button", { name: "Done", exact: true })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(forward).toHaveCount(0);

	await tabTo(page, page.getByRole("button", { name: "Add an attachment" }));
	await page.keyboard.press("Enter");
	const photos = page.getByRole("menuitem", { name: "Photos", exact: true });
	await expect(photos).toBeFocused();
	await photos.dispatchEvent("keydown", { key: "Escape", isComposing: true, bubbles: true });
	await expect(photos).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: "Add an attachment" })).toBeFocused();
	await page.keyboard.press("?");
	const help = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
	await expect(help).toBeVisible();
	await page.keyboard.press("Tab");
	await expect(help.getByRole("button", { name: "Close shortcuts" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(help).toHaveCount(0);
	// The sidebar's "More" menu also opens them, from the keyboard.
	await tabTo(page, page.getByRole("button", { name: "More", exact: true }));
	await page.keyboard.press("Enter");
	await page.getByRole("menuitem", { name: "Keyboard shortcuts", exact: true }).focus();
	await page.keyboard.press("Enter");
	await expect(help).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(help).toHaveCount(0);

	await tabTo(page, composer);
	await sendMessage(peerPage, "Only announce this incoming message");
	await expect(page.getByRole("status").filter({ hasText: "New message from" })).toHaveText(
		`New message from ${peer.displayName}: Only announce this incoming message`,
	);
	await expect(composer).toBeFocused();
});

test("voice playback, seeking and speed stay keyboard accessible when playback ends", async ({ browser }) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	const page = await context.newPage();
	const peer = makeUser("KeyVoicePeer");
	await register(await peerContext.newPage(), peer);
	await register(page, makeUser("VoiceAuthor"));
	await startDirectChat(page, peer);
	const messageId = await sendVoiceFixture(page, 8);
	const player = page.locator(`#message-${messageId}`).getByRole("group", { name: "Voice message" });
	const play = player.getByRole("button", { name: "Play voice message", exact: true });
	await tabTo(page, play);
	await page.keyboard.press("Enter");
	await expect(player.getByRole("button", { name: "Pause voice message", exact: true })).toBeFocused();
	await page.keyboard.press("Tab");
	const seek = player.getByRole("slider", { name: "Seek voice message" });
	await expect(seek).toBeFocused();
	await page.keyboard.press("Home");
	await page.keyboard.press("ArrowRight");
	await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(0);
	await expect(seek).toHaveAttribute("aria-valuetext", /of 0:0[78]/);
	await page.keyboard.press("Tab");
	const speed = player.getByRole("button", { name: "Change playback speed" });
	await expect(speed).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(speed).toHaveAttribute("aria-description", "Current speed: 1.5 times");
	// Let the uploaded clip finish through the real decoder while speed owns focus.
	await expect(player.getByRole("button", { name: "Play voice message", exact: true })).toBeFocused({
		timeout: 15_000,
	});
	await expect(speed).toHaveCount(0);
});
