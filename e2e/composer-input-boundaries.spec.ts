import { expect, test } from "@playwright/test";
import { makeUser, register, startDirectChat } from "./helpers.js";

test("only the composer accepts drops and emoji replaces the selected text", async ({ browser }) => {
	const context = await browser.newContext();
	const peerContext = await browser.newContext();
	const page = await context.newPage();
	const peer = makeUser("DropPeer");
	await register(await peerContext.newPage(), peer);
	await register(page, makeUser("DropAuthor"));
	await startDirectChat(page, peer);
	const field = page.getByRole("textbox", { name: "Message", exact: true });
	const transfer = await page.evaluateHandle(() => {
		const data = new DataTransfer();
		const bytes = Uint8Array.from(
			atob(
				"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
			),
			(character) => character.charCodeAt(0),
		);
		data.items.add(new File([bytes], "drop.png", { type: "image/png" }));
		return data;
	});
	await page.getByRole("complementary").dispatchEvent("drop", { dataTransfer: transfer });
	await expect(page.getByAltText(/Attached image preview/)).toHaveCount(0);
	await field.dispatchEvent("drop", { dataTransfer: transfer });
	await expect(page.getByAltText(/Attached image preview/)).toHaveCount(1);
	await field.dispatchEvent("drop", { dataTransfer: transfer });
	await expect(page.getByAltText(/Attached image preview/)).toHaveCount(2);
	await page.getByRole("button", { name: "Remove attached image 1", exact: true }).click();
	await expect(page.getByAltText(/Attached image preview/)).toHaveCount(1);
	await page.getByRole("button", { name: "Search all messages", exact: true }).click();
	await field.dispatchEvent("drop", { dataTransfer: transfer });
	await page.getByRole("button", { name: "Close message search" }).click();
	await expect(page.getByAltText(/Attached image preview/)).toHaveCount(1);
	await field.fill("Hi OLD there");
	await field.press("Home");
	for (let index = 0; index < 3; index++) await field.press("ArrowRight");
	for (let index = 0; index < 3; index++) await field.press("Shift+ArrowRight");
	await page.getByRole("button", { name: "Insert an emoji" }).click();
	const picker = page.getByRole("dialog", { name: "Choose an emoji" });
	const emojiButton = picker.getByRole("button", { name: /^Insert / }).first();
	const emoji = (await emojiButton.getAttribute("aria-label"))!.slice("Insert ".length);
	await emojiButton.click();
	await expect(field).toHaveValue(`Hi ${emoji} there`);
	await expect(field).toBeFocused();
	await field.press("x");
	await expect(field).toHaveValue(`Hi ${emoji}x there`);
	await expect(page.getByAltText(/Attached image preview/)).toHaveCount(1);
	await context.close();
	await peerContext.close();
});
