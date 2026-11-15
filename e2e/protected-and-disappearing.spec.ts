import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { E2E_DATABASE_URL } from "./database.js";
import { makeUser, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

/** Visible rows in the thread itself, not the sidebar preview. */
function history(page: Page) {
	return page.getByLabel("Message history");
}

test("disappearing timer and protected messages work across two people, honestly", async ({ browser }) => {
	test.setTimeout(90_000);
	const prisma = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
	const authorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const readerContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
	try {
		const author = await authorContext.newPage();
		const reader = await readerContext.newPage();
		const minh = makeUser("Minh");
		const an = makeUser("An");
		await register(reader, an);
		await register(author, minh);
		await startDirectChat(author, an);
		await openConversationWith(reader, minh);

		// ── Disappearing messages: set in the details panel, announced to both by name ──
		await author.getByLabel("Conversation storage and details").click();
		await author.getByRole("button", { name: "Privacy & support" }).click();
		await author.getByRole("radio", { name: "24 hours" }).click();
		for (const page of [author, reader]) {
			await expect(history(page).getByText("Minh set new messages to disappear after 24 hours")).toBeVisible();
			await expect(page.getByRole("img", { name: "Messages disappear after 24 hours" })).toBeVisible();
		}
		await expect(author.getByRole("radio", { name: "24 hours" })).toHaveAttribute("aria-checked", "true");

		// ── A message past its expiry leaves the reader's screen on time, with no reload ──
		const responsePromise = author.waitForResponse(
			(response) => response.request().method() === "POST" && /\/messages$/.test(response.url()),
		);
		await sendMessage(author, "This will vanish");
		const sent = (await (await responsePromise).json()) as { id: string; expiresAt: string | null };
		expect(sent.expiresAt).not.toBeNull();
		await expect(history(reader).getByText("This will vanish")).toBeVisible();
		await prisma.message.update({ where: { id: sent.id }, data: { expiresAt: new Date(Date.now() + 3_000) } });
		await reader.reload();
		await openConversationWith(reader, minh);
		await expect(history(reader).getByText("This will vanish")).toBeVisible();
		await expect(history(reader).getByText("This will vanish")).toHaveCount(0, { timeout: 8_000 });
		// The sweep erases it on the server too; the author's open thread hears about it.
		await expect(history(author).getByText("This will vanish")).toHaveCount(0, { timeout: 20_000 });
		await expect
			.poll(async () => (await prisma.message.findUniqueOrThrow({ where: { id: sent.id } })).content, {
				timeout: 20_000,
			})
			.toBe("");

		// ── A protected message: the reader gets a cover, never the words ──
		await author.getByLabel("Message", { exact: true }).fill("Only between us");
		await author.getByRole("button", { name: "Protect this message" }).click();
		await expect(author.getByRole("status").filter({ hasText: "Opens once, gone within 24h" })).toBeVisible();
		await author.getByRole("button", { name: "Send protected message" }).click();
		await expect(history(author).getByText("Only between us")).toBeVisible();
		await expect(history(author).getByText(/Protected · Not opened yet/)).toBeVisible();

		const cover = history(reader).getByRole("button", { name: "Open protected message" });
		await expect(cover).toBeVisible();
		await expect(history(reader).getByText("Only between us")).toHaveCount(0);
		expect(await reader.content()).not.toContain("Only between us");
		await expect(reader.getByRole("button", { name: new RegExp(minh.displayName) }).first()).toContainText(
			"Protected message",
		);

		await cover.click();
		const viewer = reader.getByRole("dialog", { name: "Protected message" });
		await expect(viewer.getByText("Only between us")).toBeVisible();
		await expect(viewer.getByText(`${an.displayName} @${an.handle}`).first()).toBeAttached();
		await expect(viewer.getByText(/Chatty can't stop screenshots/)).toBeVisible();
		await viewer.getByRole("button", { name: "Close protected message" }).click();
		await expect(viewer).toHaveCount(0);
		await expect(history(reader).getByRole("button", { name: "Protected message, opened" })).toBeDisabled();
		await expect(history(reader).getByText("Only between us")).toHaveCount(0);
		await expect(history(author).getByText(/Protected · Opened/)).toBeVisible();

		// A reload cannot bring it back for the reader.
		await reader.reload();
		await openConversationWith(reader, minh);
		await expect(history(reader).getByRole("button", { name: "Protected message, opened" })).toBeVisible();
		expect(await reader.content()).not.toContain("Only between us");

		// ── The default for new chats is stated as the starter's habit ──
		const binh = makeUser("Binh");
		const binhContext = await browser.newContext();
		const binhPage = await binhContext.newPage();
		await register(binhPage, binh);
		await author.getByLabel("Account settings").click();
		const settings = author.getByRole("dialog");
		await settings.getByRole("button", { name: "Privacy" }).click();
		await settings.getByRole("radio", { name: "7 days" }).click();
		await expect(settings.getByRole("radio", { name: "7 days" })).toHaveAttribute("aria-checked", "true");
		await author.getByRole("button", { name: "Close settings" }).click();
		await startDirectChat(author, binh);
		await expect(
			history(author).getByText("New messages disappear after 7 days. Minh uses this for new chats."),
		).toBeVisible();
		await openConversationWith(binhPage, minh);
		await expect(
			history(binhPage).getByText("New messages disappear after 7 days. Minh uses this for new chats."),
		).toBeVisible();
	} finally {
		await prisma.$disconnect();
	}
});
