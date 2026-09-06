import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

test.describe("two people, one conversation", () => {
	test("a message appears on the other person's screen without a reload", async ({ browser }) => {
		// The assertion this whole suite exists for. Nothing below the browser can
		// make it: a service test proves what was asked to be broadcast, and a
		// component test proves what renders given an array.
		const aliceUser = makeUser("Alice");
		const bobUser = makeUser("Bob");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);

		await startDirectChat(alicePage, bobUser);

		// Bob's sidebar gains the conversation without a reload — that is
		// `conversation:new`, which phase 1 added precisely because a brand-new
		// conversation has no messages to broadcast into it.
		await openConversationWith(bobPage, aliceUser);

		// Sent only after Bob is already looking at the conversation, so the text
		// below cannot have arrived in an HTTP page load. The socket is the only
		// way it can get there.
		await sendMessage(alicePage, "hello from alice");

		await expect(messages(bobPage).getByText("hello from alice")).toBeVisible({ timeout: 15_000 });

		await alice.close();
		await bob.close();
	});

	test("the reply comes back the same way", async ({ browser }) => {
		const aliceUser = makeUser("Ana");
		const bobUser = makeUser("Ben");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await openConversationWith(bobPage, aliceUser);

		await sendMessage(alicePage, "are you there");
		await expect(messages(bobPage).getByText("are you there")).toBeVisible({ timeout: 15_000 });

		await sendMessage(bobPage, "yes");
		await expect(messages(alicePage).getByText("yes")).toBeVisible({ timeout: 15_000 });

		await alice.close();
		await bob.close();
	});

	test("an image sent by one person renders for the other", async ({ browser }) => {
		// Phase 4 end to end: multipart upload, re-encode, signed URL, and an
		// <img> on a different origin actually loading it. The signed URL in
		// particular cannot be proved by anything short of a real browser fetching
		// it without an Authorization header.
		const senderUser = makeUser("Sam");
		const viewerUser = makeUser("Vic");

		const sender = await browser.newContext();
		const viewer = await browser.newContext();
		const senderPage = await sender.newPage();
		const viewerPage = await viewer.newPage();

		await register(viewerPage, viewerUser);
		await register(senderPage, senderUser);
		await startDirectChat(senderPage, viewerUser);
		await openConversationWith(viewerPage, senderUser);

		// A real PNG, small enough to inline.
		const png = Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
			"base64",
		);
		await senderPage.getByRole("main").getByRole("button", { name: "Add an attachment" }).click();
		await expect(senderPage.getByRole("menu", { name: "Choose an attachment" })).toBeVisible();
		const fileChooser = senderPage.waitForEvent("filechooser");
		await senderPage.getByRole("menuitem", { name: "Photos" }).click();
		await (
			await fileChooser
		).setFiles({
			name: "photo.png",
			mimeType: "image/png",
			buffer: png,
		});
		await expect(senderPage.getByAltText("Attached image preview")).toBeVisible();

		await sendMessage(senderPage, "here is the photo");

		const delivered = viewerPage.getByAltText("here is the photo");
		await expect(delivered).toBeVisible({ timeout: 15_000 });
		expect(new URL((await delivered.getAttribute("src")) ?? "").searchParams.get("size")).toBe("thumb");

		// Visible is not loaded. A broken <img> still occupies its reserved box,
		// so the only proof the signed URL worked is the decoded pixel count.
		await expect
			.poll(async () => delivered.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 15_000 })
			.toBeGreaterThan(0);

		await delivered.click();
		const fullImage = viewerPage.getByRole("dialog").getByAltText("here is the photo");
		await expect(fullImage).toBeVisible();
		expect(new URL((await fullImage.getAttribute("src")) ?? "").searchParams.has("size")).toBe(false);

		await sender.close();
		await viewer.close();
	});

	test("searches the open conversation and jumps to the exact message", async ({ browser }) => {
		const aliceUser = makeUser("Ari");
		const bobUser = makeUser("Bea");
		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await sendMessage(alicePage, "ordinary message");
		await expect(messages(alicePage).getByText("ordinary message")).toBeVisible({ timeout: 15_000 });
		await sendMessage(alicePage, "the release codename is blue-orchid");
		await expect(messages(alicePage).getByText("the release codename is blue-orchid")).toBeVisible({
			timeout: 15_000,
		});

		await alicePage.getByRole("button", { name: "Search in conversation" }).click();
		await alicePage.getByRole("textbox", { name: "Search in conversation" }).fill("blue-orchid");
		await expect(alicePage.getByText("1 of 1")).toBeVisible({ timeout: 15_000 });
		await expect(messages(alicePage).getByText("the release codename is blue-orchid")).toBeVisible();
		await expect(alicePage.getByRole("button", { name: "Jump to latest messages" })).toBeVisible();

		await alice.close();
		await bob.close();
	});
});
