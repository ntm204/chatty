import { expect, test } from "@playwright/test";
import { makeUser, openConversationWith, register, startDirectChat } from "./helpers.js";

test("friend requests, follows and unfriending work between two people, live", async ({ browser }) => {
	test.setTimeout(90_000);
	const minhPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	const anPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	const minh = makeUser("Minh");
	const an = makeUser("An");
	await register(anPage, an);
	await register(minhPage, minh);
	await startDirectChat(minhPage, an);
	await openConversationWith(anPage, minh);

	// ── Minh asks; An sees the request arrive without reloading ──
	await minhPage.getByRole("button", { name: "Conversation storage and details" }).click();
	const details = minhPage.getByRole("complementary", { name: "Conversation details" });
	await details.getByRole("button", { name: "Add friend" }).click();
	await expect(details.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");
	await expect(anPage.getByRole("button", { name: "More, 1 friend requests" })).toBeVisible();

	// ── An answers from the chat's own details ──
	await anPage.getByRole("button", { name: "Conversation storage and details" }).click();
	const anDetails = anPage.getByRole("complementary", { name: "Conversation details" });
	await expect(anDetails.getByText(`${minh.displayName} sent you a friend request`)).toBeVisible();
	await anDetails.getByRole("button", { name: "Confirm" }).click();
	await expect(anDetails.getByRole("button", { name: "Friends" })).toBeVisible();
	await expect(details.getByRole("button", { name: "Friends" })).toBeVisible();
	await expect(anPage.getByRole("button", { name: "More", exact: true })).toBeVisible();

	// ── Both see each other in Friends ──
	await minhPage.getByRole("button", { name: "More", exact: true }).click();
	await minhPage.getByRole("menuitem", { name: /Friends/ }).click();
	const friends = minhPage.getByRole("dialog", { name: "Friends" });
	await expect(
		friends.getByRole("list", { name: "Your friends" }).getByText(an.displayName, { exact: true }),
	).toBeVisible();
	await minhPage.keyboard.press("Escape");

	// ── Unfriending ends it on both sides ──
	await details.getByRole("button", { name: "Friends" }).click();
	await minhPage.getByRole("menuitem", { name: "Unfriend" }).click();
	await minhPage
		.getByRole("dialog", { name: `Unfriend ${an.displayName}?` })
		.getByRole("button", { name: "Unfriend" })
		.click();
	await expect(details.getByRole("button", { name: "Add friend" })).toBeVisible();
	await expect(anDetails.getByRole("button", { name: "Add friend" })).toBeVisible();
});
