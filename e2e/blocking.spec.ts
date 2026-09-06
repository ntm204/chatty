import { expect, test } from "@playwright/test";
import { makeUser, register, startDirectChat } from "./helpers.js";

/**
 * Blocking, through the interface rather than the service.
 *
 * The service tests already prove the rules — both directions, groups exempt,
 * search filtered — so these two cover only what a browser can say: that the
 * action is reachable where people reach for it, that it warns before acting,
 * and that being blocked looks like something rather than a message quietly
 * vanishing.
 *
 * Both of those shipped wrong once. The only entry point was buried in a panel
 * called "Conversation storage and details", and when a second one was added to
 * the row menu it blocked immediately while the panel asked first.
 */
test.describe("blocking", () => {
	test("warns before blocking from the row menu, and the panel agrees afterwards", async ({ browser }) => {
		const mai = makeUser("Mai");
		const linh = makeUser("Linh");
		const maiContext = await browser.newContext();
		const linhContext = await browser.newContext();
		const maiPage = await maiContext.newPage();
		const linhPage = await linhContext.newPage();

		await register(linhPage, linh);
		await register(maiPage, mai);
		await startDirectChat(maiPage, linh);

		await maiPage.getByRole("listitem").first().hover();
		await maiPage.getByRole("button", { name: "Conversation actions" }).first().click();
		await maiPage.getByRole("menuitem", { name: "Block" }).click();

		// The exception is the part people are surprised by, so it is said before
		// the decision rather than found out later in a group.
		const dialog = maiPage.getByRole("dialog");
		await expect(dialog).toContainText("groups you are both in are not affected");
		await dialog.getByRole("button", { name: "Block" }).click();

		// The panel is a second surface over the same store: blocking here has to
		// have changed what it offers, or it would invite blocking someone twice.
		await maiPage.getByRole("button", { name: "Conversation storage and details" }).click();
		await maiPage.getByText("Privacy & support", { exact: true }).click();
		await expect(maiPage.getByRole("button", { name: `Unblock ${linh.displayName}` })).toBeVisible({
			timeout: 15_000,
		});

		// Unblocking does not ask, and works from the other surface.
		await maiPage.getByRole("button", { name: `Unblock ${linh.displayName}` }).click();
		await expect(maiPage.getByRole("button", { name: `Block ${linh.displayName}` })).toBeVisible({
			timeout: 15_000,
		});
	});

	test("a blocked person's message is marked, not silently dropped", async ({ browser }) => {
		const mai = makeUser("Mai");
		const linh = makeUser("Linh");
		const maiContext = await browser.newContext();
		const linhContext = await browser.newContext();
		const maiPage = await maiContext.newPage();
		const linhPage = await linhContext.newPage();

		await register(linhPage, linh);
		await register(maiPage, mai);
		await startDirectChat(linhPage, mai);
		await linhPage.getByRole("textbox", { name: "Message" }).fill("before the block");
		await linhPage.keyboard.press("Enter");
		await expect(maiPage.getByText("before the block")).toBeVisible({ timeout: 15_000 });

		await maiPage.getByRole("listitem").first().hover();
		await maiPage.getByRole("button", { name: "Conversation actions" }).first().click();
		await maiPage.getByRole("menuitem", { name: "Block" }).click();
		await maiPage.getByRole("dialog").getByRole("button", { name: "Block" }).click();

		// Refused, and the optimistic copy stays marked rather than disappearing —
		// the phase 19 rule, and it matters most here: a message that vanishes
		// reads as "sent" to whoever wrote it.
		await linhPage.getByRole("textbox", { name: "Message" }).fill("after the block");
		await linhPage.keyboard.press("Enter");
		await expect(linhPage.getByLabel("Message history").getByText("after the block")).toBeVisible({
			timeout: 15_000,
		});
		await expect(linhPage.getByRole("main").getByText(/Not sent/i)).toBeVisible({ timeout: 15_000 });
	});
});
