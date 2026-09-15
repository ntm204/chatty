import { expect, test } from "@playwright/test";
import { makeUser, register, startGroupChat } from "./helpers.js";

test("mention completion preserves text after the caret and supports keyboard selection", async ({ browser }) => {
	const context = await browser.newContext();
	const otherContext = await browser.newContext();
	const thirdContext = await browser.newContext();
	const page = await context.newPage();
	const other = makeUser("MentionAlpha");
	const third = makeUser("MentionBeta");
	await register(await otherContext.newPage(), other);
	await register(await thirdContext.newPage(), third);
	await register(page, makeUser("MentionWriter"));
	await startGroupChat(page, [other, third], "Mention workshop");
	const field = page.getByRole("textbox", { name: "Message", exact: true });
	await field.fill("Hello @Mention tomorrow");
	await field.press("Home");
	for (let index = 0; index < 14; index++) await field.press("ArrowRight");
	await expect(page.getByRole("listbox", { name: "Mention suggestions" })).toBeVisible();
	await field.press("ArrowDown");
	const selected = page.getByRole("option", { selected: true });
	const selectedText = await selected.textContent();
	const handle = selectedText!.slice(selectedText!.indexOf("@") + 1);
	await field.press("Enter");
	await expect(field).toHaveValue(`Hello @${handle} tomorrow`);
	await field.press("End");
	await field.press("Enter");
	await expect(
		page.getByLabel("Message history").getByText(`Hello @${handle} tomorrow`, { exact: true }),
	).toBeVisible();
	await page.getByLabel("Message actions").click();
	await page.getByRole("menuitem", { name: "Edit message", exact: true }).click();
	await page
		.getByRole("textbox", { name: "Edit message", exact: true })
		.fill(`Edited @${handle} https://example.com/updated`);
	const editResponse = page.waitForResponse(
		(response) => response.request().method() === "PATCH" && response.url().includes("/messages/"),
	);
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const edited = await (await editResponse).json();
	expect(edited.mentionedUserIds).toHaveLength(1);
	await expect(
		page.getByLabel("Message history").getByText(`Edited @${handle} https://example.com/updated`, { exact: true }),
	).toBeVisible();
	await field.fill("@Mention");
	await expect(page.getByRole("listbox")).toBeVisible();
	await field.press("Escape");
	await expect(page.getByRole("listbox")).toHaveCount(0);
	await expect(field).toHaveValue("@Mention");
	await context.close();
	await otherContext.close();
	await thirdContext.close();
});
