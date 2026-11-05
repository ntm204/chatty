import { expect, test, type Locator, type Page } from "@playwright/test";
import { makeUser, register, sendMessage, startGroupChat, type TestUser } from "./helpers.js";

interface ReactionFixture {
	account: TestUser;
	token: string;
}

async function expectSeparateTouchTargets(page: Page, controls: Locator): Promise<void> {
	const bounds = await controls.evaluateAll((elements) =>
		elements
			.filter((element) => element.getClientRects().length > 0)
			.map((element) => {
				const rectangle = element.getBoundingClientRect();

				return { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height };
			}),
	);
	expect(bounds.length).toBeGreaterThan(0);
	const viewport = page.viewportSize()!;
	for (const [index, rectangle] of bounds.entries()) {
		expect(rectangle.width).toBeGreaterThanOrEqual(44);
		expect(rectangle.height).toBeGreaterThanOrEqual(44);
		expect(rectangle.x).toBeGreaterThanOrEqual(-1);
		expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(viewport.width + 1);
		for (const other of bounds.slice(index + 1)) {
			const overlapWidth =
				Math.min(rectangle.x + rectangle.width, other.x + other.width) - Math.max(rectangle.x, other.x);
			const overlapHeight =
				Math.min(rectangle.y + rectangle.height, other.y + other.height) - Math.max(rectangle.y, other.y);
			expect(overlapWidth <= 0 || overlapHeight <= 0, "Touch targets must not overlap").toBe(true);
		}
	}
}

test("touch reaction targets stay separate at 320px while desktop keeps its compact controls", async ({
	browser,
	request,
}) => {
	test.setTimeout(60_000);
	const apiUrl = process.env.E2E_API_URL ?? "http://localhost:4100";
	const peers: ReactionFixture[] = [];
	// Extra reactors are HTTP fixtures: this test measures real rendered reaction
	// controls, while the author's account and interactions still use the UI.
	for (const name of ["TouchOne", "TouchTwo", "TouchThree"]) {
		const account = makeUser(name);
		const response = await request.post(`${apiUrl}/auth/register`, { data: account });
		expect(response.ok()).toBe(true);
		const registered = (await response.json()) as { token: string };
		peers.push({ account, token: registered.token });
	}
	const context = await browser.newContext({
		viewport: { width: 320, height: 640 },
		hasTouch: true,
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await register(page, makeUser("TouchAuthor"));
	await startGroupChat(
		page,
		peers.map((peer) => peer.account),
		"Touch group",
	);
	await sendMessage(page, "Hi");
	const row = page.locator("[data-message-interaction-row]").filter({ hasText: "Hi" });
	const actions = row.getByRole("button", { name: "Message actions", exact: true });
	await expect(actions).toBeAttached();
	const messageId = (await row.locator("..").getAttribute("id"))!.slice("message-".length);
	const conversationId = await page.getByRole("main").getAttribute("data-conversation-id");
	const emojis = ["😂", "😮", "😢"];
	for (const [index, peer] of peers.entries()) {
		const response = await request.put(
			`${apiUrl}/conversations/${conversationId}/messages/${messageId}/reactions`,
			{
				headers: { Authorization: `Bearer ${peer.token}` },
				data: { emoji: emojis[index] },
			},
		);
		expect(response.ok()).toBe(true);
	}
	const chips = row.getByRole("group", { name: "Reactions to your message", exact: true });
	await expect(chips.getByRole("button")).toHaveCount(3);
	await row.getByText("Hi", { exact: true }).tap();
	await expect(row).toBeFocused();
	await expectSeparateTouchTargets(page, row.locator(".message-actions > button"));
	await row.getByRole("button", { name: "React to message", exact: true }).tap();
	const reactionMenu = page.getByRole("menu", { name: "React to message", exact: true });
	await expect(reactionMenu).toBeVisible();
	await expectSeparateTouchTargets(page, reactionMenu.getByRole("menuitem"));
	const quickRows = await reactionMenu
		.getByRole("menuitem")
		.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
	expect(new Set(quickRows).size).toBeGreaterThan(1);
	await reactionMenu.getByRole("menuitem", { name: "React with ❤️", exact: true }).tap();
	await expect(chips.getByRole("button")).toHaveCount(4);
	await expectSeparateTouchTargets(page, chips.getByRole("button"));
	const overflow = chips.getByRole("button", { name: "1 more reactions. Show everyone who reacted", exact: true });
	await overflow.tap();
	await expect(page.getByRole("dialog", { name: "Reactions", exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog", { name: "Reactions", exact: true })).toHaveCount(0);
	const firstChip = chips.getByRole("button").first();
	const selectedEmoji = (await firstChip.getAttribute("aria-label"))!.split(",")[0]!;
	await firstChip.tap();
	await expect(chips.getByRole("button", { name: `${selectedEmoji}, 2`, exact: true })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await page.setViewportSize({ width: 640, height: 320 });
	await expectSeparateTouchTargets(page, chips.getByRole("button"));
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

	const desktop = await browser.newContext({
		viewport: { width: 1280, height: 800 },
		storageState: await context.storageState(),
		reducedMotion: "reduce",
	});
	const desktopPage = await desktop.newPage();
	await desktopPage.goto(page.url());
	const desktopRow = desktopPage.locator("[data-message-interaction-row]").filter({ hasText: "Hi" });
	const desktopActions = desktopRow.getByRole("button", { name: "Message actions", exact: true });
	await expect(desktopActions).toBeAttached();
	expect((await desktopActions.boundingBox())!.width).toBe(24);
	expect((await desktopActions.boundingBox())!.height).toBe(24);
	const desktopChips = desktopRow.getByRole("group", { name: "Reactions to your message", exact: true });
	expect((await desktopChips.boundingBox())!.height).toBe(20);
	expect((await desktopChips.getByRole("button").first().boundingBox())!.height).toBe(16);
});
