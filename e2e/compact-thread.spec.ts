import { expect, test } from "@playwright/test";
import { makeUser, register, startGroupChat, sendMessage, openConversationNamed } from "./helpers.js";

const LINK_MESSAGE = "Link kiểm tra metadata mà server không tự truy cập: https://example.com/chatty-demo";
const LONG_MESSAGE = "[170/175] Ghi chú hiệu năng: chỉ truyền delta mới thay vì tải lại cả cuộc trò chuyện.";
const MANUAL_LINES = "Hẹn bạn tối mai nhé.\nMình sẽ gửi bản cuối sau.";
const LONG_URL = `https://example.com/${"chi-tiet-ban-thiet-ke-".repeat(10)}`;

test("wrapped text and links keep a compact bubble without changing their content", async ({ browser }) => {
	const ownerUser = makeUser("Lan");
	const peerUser = makeUser("Minh");
	const thirdUser = makeUser("Mai");
	const owner = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const peer = await browser.newContext();
	const third = await browser.newContext();
	try {
		const page = await owner.newPage();
		const peerPage = await peer.newPage();
		await register(peerPage, peerUser);
		await register(await third.newPage(), thirdUser);
		await register(page, ownerUser);
		await startGroupChat(page, [peerUser, thirdUser], "Design review");
		await openConversationNamed(peerPage, "Design review");
		await sendMessage(peerPage, LINK_MESSAGE);
		await sendMessage(peerPage, LONG_MESSAGE);
		await sendMessage(page, "Ừ, được nhé.");
		// The composer is currently one line; preserve explicit newlines through the API fixture.
		await peerPage.evaluate(async (content) => {
			const token = localStorage.getItem("chatty:token");
			const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
			const response = await fetch("http://localhost:4100/conversations", { headers });
			const conversations = (await response.json()) as { items: { id: string }[] };
			const sent = await fetch(`http://localhost:4100/conversations/${conversations.items[0]!.id}/messages`, {
				method: "POST",
				headers,
				body: JSON.stringify({ content }),
			});
			if (!sent.ok) throw new Error("Could not create multiline fixture");
		}, MANUAL_LINES);
		const main = page.getByRole("main");
		await expect(main.getByText(LONG_MESSAGE, { exact: true })).toBeVisible();
		await expect(main.getByText(MANUAL_LINES, { exact: true })).toBeVisible();
		await page.evaluate(() => document.fonts.ready);
		const paragraphs = page.locator("[data-message-interaction-row] p");
		const geometry = () =>
			paragraphs.evaluateAll((nodes) =>
				nodes.map((node) => {
					const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
					const rects: DOMRect[] = [];
					while (walker.nextNode()) {
						const range = document.createRange();
						range.selectNodeContents(walker.currentNode);
						rects.push(...Array.from(range.getClientRects()));
					}
					const bubble = node.parentElement!;
					const bounds = bubble.getBoundingClientRect();
					const visible = rects.filter((rect) => rect.width > 0);
					const paintedWidth =
						Math.max(...visible.map((rect) => rect.right)) - Math.min(...visible.map((rect) => rect.left));
					const style = getComputedStyle(bubble);
					return {
						text: node.textContent,
						width: bounds.width,
						height: bounds.height,
						extra:
							bounds.width -
							paintedWidth -
							parseFloat(style.paddingLeft) -
							parseFloat(style.paddingRight),
						overflow: node.scrollWidth - node.clientWidth,
					};
				}),
			);
		// The old link bubble was 544px wide around only 334px of visible text.
		await expect
			.poll(async () =>
				(await geometry())
					.filter((row) => row.text === LINK_MESSAGE || row.text === LONG_MESSAGE)
					.every((row) => row.extra <= 3 && row.overflow <= 1),
			)
			.toBe(true);
		const desktop = await geometry();
		expect(desktop.find((row) => row.text === LINK_MESSAGE)?.height).toBeLessThan(60);
		expect(desktop.find((row) => row.text === LONG_MESSAGE)?.height).toBeLessThan(60);
		expect(desktop.find((row) => row.text === MANUAL_LINES)?.text).toBe(MANUAL_LINES);
		expect(desktop.find((row) => row.text === "Ừ, được nhé.")?.width).toBeLessThan(160);
		const link = main.getByRole("link", { name: "https://example.com/chatty-demo", exact: true });
		await expect(link).toHaveAttribute("href", "https://example.com/chatty-demo");
		await link.hover();
		expect((await geometry()).map((row) => row.width)).toEqual(desktop.map((row) => row.width));
		await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
		await page.screenshot({ animations: "disabled", path: "/tmp/chatty-compact-thread-desktop.png" });
		await page.setViewportSize({ width: 375, height: 812 });
		await expect
			.poll(async () => (await geometry()).every((row) => row.width <= 285 && row.overflow <= 1))
			.toBe(true);
		await page.screenshot({ animations: "disabled", path: "/tmp/chatty-compact-thread-mobile.png" });
		await page.setViewportSize({ width: 1440, height: 900 });
		await expect
			.poll(async () => (await geometry()).map((row) => row.width))
			.toEqual(desktop.map((row) => row.width));
		await sendMessage(peerPage, LONG_URL);
		await expect(main.getByRole("link", { name: LONG_URL, exact: true })).toHaveAttribute("href", LONG_URL);
		await page.setViewportSize({ width: 375, height: 812 });
		await expect.poll(async () => (await geometry()).every((row) => row.overflow <= 1)).toBe(true);
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
			.toBeLessThanOrEqual(0);
	} finally {
		await owner.close();
		await peer.close();
		await third.close();
	}
});
