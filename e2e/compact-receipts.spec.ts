import { expect, test } from "@playwright/test";
import { makeUser, openConversationNamed, register, sendMessage, startGroupChat } from "./helpers.js";

const MESSAGE = "Ghi chú hiệu năng cần giữ nguyên nội dung được gửi Ghi chú hiệu Cảm ơn bạn đã xem.";

test("compact outgoing text stays inside its row as group read receipts grow", async ({ browser }) => {
	const ownerUser = makeUser("Owner");
	const peerUser = makeUser("Peer");
	const thirdUser = makeUser("Third");
	const owner = await browser.newContext({ viewport: { width: 1024, height: 900 } });
	const peer = await browser.newContext();
	const third = await browser.newContext();
	try {
		const page = await owner.newPage();
		const peerPage = await peer.newPage();
		const thirdPage = await third.newPage();
		await register(peerPage, peerUser);
		await register(thirdPage, thirdUser);
		await register(page, ownerUser);
		await startGroupChat(page, [peerUser, thirdUser], "Gutter sizing");
		await page.evaluate(() => document.fonts.ready);
		await sendMessage(page, MESSAGE);
		const paragraph = page.getByRole("main").getByText(MESSAGE, { exact: true });
		await expect(paragraph).toBeVisible();
		const row = page
			.locator("[data-message-interaction-row]")
			.filter({ has: page.getByText(MESSAGE, { exact: true }) });
		await expect(row.getByRole("button", { name: "Message actions", exact: true })).toBeVisible();
		const geometry = () =>
			paragraph.evaluate((text) => {
				const bubble = text.parentElement!;
				const wrapper = bubble.parentElement!;
				const interactionRow = wrapper.parentElement!;
				return {
					bubbleWidth: bubble.getBoundingClientRect().width,
					wrapperWidth: wrapper.getBoundingClientRect().width,
					outerWidth: interactionRow.parentElement!.getBoundingClientRect().width,
					rowOverflow: interactionRow.scrollWidth - interactionRow.clientWidth,
					textOverflow: text.scrollWidth - text.clientWidth,
					text: text.textContent,
				};
			});
		const before = await geometry();
		for (const [readerIndex, readerPage] of [peerPage, thirdPage].entries()) {
			await openConversationNamed(readerPage, "Gutter sizing");
			await expect(page.getByRole("button", { name: `Seen by ${readerIndex + 1}`, exact: true })).toBeVisible();
			// The container does not resize when a receipt appears; only its available text space changes.
			await expect
				.poll(async () => {
					const current = await geometry();
					return Math.max(
						current.bubbleWidth - current.wrapperWidth,
						current.rowOverflow,
						current.textOverflow,
					);
				})
				.toBeLessThanOrEqual(1);
			const after = await geometry();
			expect(after.outerWidth).toBe(before.outerWidth);
			expect(after.text).toBe(MESSAGE);
		}
	} finally {
		await owner.close();
		await peer.close();
		await third.close();
	}
});
