import { expect, test } from "@playwright/test";
import { makeUser, register, sendMessage, startDirectChat } from "./helpers.js";

test("conversation search clears, recovers offline and leaves emoji Escape in its own layer", async ({ browser }) => {
	const context = await browser.newContext();
	const other = await browser.newContext();
	try {
		const peer = makeUser("SearchPeer");
		await register(await other.newPage(), peer);
		const page = await context.newPage();
		await register(page, makeUser("SearchMe"));
		await startDirectChat(page, peer);
		await sendMessage(page, "Reference for search recovery");
		const field = page.getByLabel("Message", { exact: true });
		await field.fill("Draft stays here");
		await field.press("Control+f");
		const search = page.getByRole("textbox", { name: "Search in conversation", exact: true });
		await expect(search).toBeFocused();
		await search.fill("Reference");
		await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Clear conversation search" }).click();
		await expect(search).toHaveValue("");
		await expect(search).toBeFocused();
		await context.setOffline(true);
		await search.fill("Reference");
		await expect(page.getByRole("alert")).toContainText("Connect to search messages");
		await expect(page.getByText("No results", { exact: true })).toHaveCount(0);
		await context.setOffline(false);
		await page.getByRole("button", { name: "Retry search" }).click();
		await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();
		await search.press("Escape");
		await expect(field).toHaveValue("Draft stays here");
		await page.getByRole("button", { name: "Insert an emoji" }).click();
		const emojiSearch = page.getByLabel("Search emoji");
		await emojiSearch.fill("cười");
		await expect(page.getByRole("button", { name: "Insert 😂", exact: true })).toBeVisible();
		await emojiSearch.press("Escape");
		await expect(page.getByRole("dialog", { name: "Choose an emoji" })).toHaveCount(0);
		await expect(field).toHaveValue("Draft stays here");
	} finally {
		await context.close();
		await other.close();
	}
});

test("people with the same display name remain distinguishable and empty search is explicit", async ({ browser }) => {
	const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
	try {
		const first = { ...makeUser("FirstPeer"), displayName: "Nguyễn An" };
		const second = { ...makeUser("SecondPeer"), displayName: "Nguyễn An" };
		await register(await contexts[0]!.newPage(), first);
		await register(await contexts[1]!.newPage(), second);
		const page = await contexts[2]!.newPage();
		await register(page, makeUser("FindPeople"));
		const search = page.getByLabel("Find someone");
		await search.fill("Nguyễn");
		await search.press("Enter");
		await expect(page.getByRole("button", { name: `Nguyễn An @${first.handle}`, exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: `Nguyễn An @${second.handle}`, exact: true })).toBeVisible();
		await page.getByRole("button", { name: `Nguyễn An @${second.handle}`, exact: true }).click();
		await expect(page.getByRole("button", { name: "Chat with Nguyễn An", exact: true })).toBeVisible();
		await search.fill("no-person-matches-xyz");
		await search.press("Enter");
		await expect(page.getByText("No people found. Try another name or handle.")).toBeVisible();
		await expect(page.getByRole("button", { name: "Chat with Nguyễn An", exact: true })).toBeVisible();
	} finally {
		await Promise.all(contexts.map((context) => context.close()));
	}
});
