import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

import { makeVoiceWave } from "./fixtures/voice.js";

const API_URL = "http://localhost:4100";

test("files, voice, links, thumbnails and the conversation vault work across two browsers", async ({ browser }) => {
	const senderUser = makeUser("VaultSender");
	const viewerUser = makeUser("VaultViewer");
	const sender = await browser.newContext();
	const viewer = await browser.newContext();
	const senderPage = await sender.newPage();
	const viewerPage = await viewer.newPage();

	await register(viewerPage, viewerUser);
	await register(senderPage, senderUser);
	await startDirectChat(senderPage, viewerUser);
	await openConversationWith(viewerPage, senderUser);

	const main = senderPage.getByRole("main");
	await main.getByLabel("Message", { exact: true }).fill("Keep this text draft");
	await main.locator('input[type="file"]:not([multiple])').setInputFiles({
		name: "Tài liệu.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("%PDF-1.4 chatty e2e"),
	});
	await expect(messages(viewerPage).getByRole("link", { name: /Tài liệu\.pdf/u })).toBeVisible({ timeout: 15_000 });
	// Short filenames fit their contents on both sides of the thread, rather
	// than paying for an empty fixed-width card. Test actual layout, not classes.
	for (const page of [senderPage, viewerPage]) {
		const card = messages(page).getByRole("link", { name: /Tài liệu\.pdf/u });
		await expect(card).toBeVisible();
		const geometry = await card.evaluate((element) => {
			const label = element.querySelector("span > span");
			if (!label) throw new Error("File label missing");
			const range = document.createRange();
			range.selectNodeContents(label);

			return { cardWidth: element.getBoundingClientRect().width, textWidth: range.getBoundingClientRect().width };
		});
		expect(geometry.cardWidth - geometry.textWidth).toBeLessThanOrEqual(64);
	}
	await expect(main.getByLabel("Message", { exact: true })).toHaveValue("Keep this text draft");
	await expect(messages(viewerPage).getByText("Keep this text draft", { exact: true })).toHaveCount(0);
	await main.getByLabel("Message", { exact: true }).fill("");

	const png = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
		"base64",
	);
	await main.locator('input[type="file"][multiple]').setInputFiles({
		name: "vault-photo.png",
		mimeType: "image/png",
		buffer: png,
	});
	await sendMessage(senderPage, "Vault photo");
	await expect(messages(viewerPage).getByAltText("Vault photo")).toBeVisible({ timeout: 15_000 });

	await sendMessage(senderPage, "Read https://example.com/chatty-vault");

	// MediaRecorder itself cannot be driven meaningfully by Playwright. Post a
	// real WAV fixture through the same authenticated endpoint and assert the
	// browser renders the transcoded player—the portable playback path this test
	// is responsible for.
	const voiceStatus = await senderPage.evaluate(
		async ({ apiUrl, waveBase64 }) => {
			const token = localStorage.getItem("chatty:token");
			// A page, not an array, since conversation paging landed.
			const conversations = (await (
				await fetch(`${apiUrl}/conversations`, { headers: { Authorization: `Bearer ${token}` } })
			).json()) as { items: { id: string }[] };
			const bytes = Uint8Array.from(atob(waveBase64), (character) => character.charCodeAt(0));
			const body = new FormData();
			body.append("voice", new Blob([bytes], { type: "audio/wav" }), "voice.wav");

			return (
				await fetch(`${apiUrl}/conversations/${conversations.items[0]!.id}/messages`, {
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
					body,
				})
			).status;
		},
		{ apiUrl: API_URL, waveBase64: makeVoiceWave().toString("base64") },
	);
	expect(voiceStatus).toBe(201);
	await expect(messages(viewerPage).getByRole("button", { name: "Play voice message" })).toBeVisible({
		timeout: 15_000,
	});

	await senderPage.getByRole("button", { name: "Conversation storage and details" }).click();
	// The sidebar is the page's other <aside>, and the panel's *heading* changes
	// as you walk into a category — so the landmark's own name is what addresses
	// it at every level.
	const vault = senderPage.getByRole("complementary", { name: "Conversation details" });
	await senderPage.setViewportSize({ width: 1440, height: 900 });
	const thread = senderPage.getByRole("region", { name: "Conversation", exact: true });
	await expect(thread).toBeVisible();
	await main.getByLabel("Message", { exact: true }).fill("Draft while browsing details");
	await expect(vault).toBeVisible();
	const threadBounds = await thread.boundingBox();
	const vaultBounds = await vault.boundingBox();
	expect(threadBounds!.x + threadBounds!.width).toBeLessThanOrEqual(vaultBounds!.x + 1);

	const sidebarResize = senderPage.getByRole("separator", { name: "Resize conversation sidebar" });
	await sidebarResize.focus();
	await senderPage.keyboard.press("ArrowRight");
	await expect(sidebarResize).toHaveAttribute("aria-valuenow", "336");
	const detailsResize = senderPage.getByRole("separator", { name: "Resize conversation details" });
	await vault.evaluate(async (element) => {
		await Promise.all(element.getAnimations().map((animation) => animation.finished));
	});
	const divider = await detailsResize.boundingBox();
	await senderPage.mouse.move(divider!.x + divider!.width / 2, divider!.y + 100);
	await senderPage.mouse.down();
	await senderPage.mouse.move(divider!.x - 60, divider!.y + 100, { steps: 5 });
	await senderPage.mouse.up();
	await expect(detailsResize).toHaveAttribute("aria-valuenow", "384");
	expect((await vault.boundingBox())!.width).toBeCloseTo(384, 0);
	await detailsResize.press("End");
	await expect(detailsResize).toHaveAttribute("aria-valuenow", "400");
	await vault.getByRole("button", { name: "Close conversation storage" }).click();
	await senderPage.getByRole("button", { name: "Conversation storage and details" }).click();
	await expect(detailsResize).toHaveAttribute("aria-valuenow", "400");
	await detailsResize.press("Enter");
	await sidebarResize.press("Enter");
	await senderPage.screenshot({ path: "/tmp/chatty-three-panels-desktop.png", animations: "disabled" });
	await senderPage.setViewportSize({ width: 390, height: 844 });
	await expect(thread).toBeHidden();
	await expect(vault).toBeVisible();
	expect((await vault.boundingBox())!.width).toBeCloseTo(390, 1);
	await senderPage.screenshot({ path: "/tmp/chatty-details-mobile.png", animations: "disabled" });
	await vault.getByRole("button", { name: "Close conversation storage" }).click();
	await expect(main.getByLabel("Message", { exact: true })).toHaveValue("Draft while browsing details");
	await senderPage.getByRole("button", { name: "Conversation storage and details" }).click();
	await senderPage.keyboard.press("Escape");
	await expect(vault).toHaveCount(0);
	await expect(senderPage.getByRole("button", { name: "Conversation storage and details" })).toBeFocused();
	await senderPage.getByRole("button", { name: "Conversation storage and details" }).click();
	const thisMonth = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date());

	// The counts are the half of this panel no service test can check: they are
	// four separate database predicates that have to agree with the four lists
	// they sit in front of. A row that opens onto a different number is the bug
	// this walk exists to catch.
	await vault.getByRole("button", { name: "Media, files and links" }).click();
	await vault.getByRole("button", { name: /^Media, [1-9]/ }).click();
	await expect(vault.getByText(thisMonth)).toBeVisible();
	await vault
		.getByRole("button", { name: /^Shared by/ })
		.first()
		.click();
	const imageViewer = senderPage.getByRole("dialog");
	await expect(imageViewer).toBeVisible();
	expect(await imageViewer.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
	await senderPage.keyboard.press("Escape");
	await expect(imageViewer).toHaveCount(0);
	await expect(vault).toBeVisible();

	await vault.getByRole("button", { name: "Back to conversation details" }).click();
	await vault.getByRole("button", { name: /^Files, [1-9]/ }).click();
	await expect(vault.getByRole("link", { name: /Tài liệu\.pdf/u })).toBeVisible();

	await vault.getByRole("button", { name: "Back to conversation details" }).click();
	await vault.getByRole("button", { name: /^Voice, [1-9]/ }).click();
	await expect(vault.getByRole("button", { name: "Play voice message" })).toBeVisible();

	await vault.getByRole("button", { name: "Back to conversation details" }).click();
	await vault.getByRole("button", { name: /^Links, [1-9]/ }).click();
	await expect(vault.getByText("https://example.com/chatty-vault")).toBeVisible();

	await sender.close();
	await viewer.close();
});
