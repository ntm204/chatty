import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// Contexts opened with `browser.newContext()` belong to the worker's browser, not
// to the test, so any a spec forgets to close keep their pages and sockets for the
// rest of the run. Chromium shrugged that off; WebKit slowed until late specs timed
// out during sign-up. Every spec imports this file, so this hook covers them all.
test.afterEach(async ({ browser }) => {
	await Promise.all(browser.contexts().map((context) => context.close()));
});

/**
 * Everything here drives the real UI rather than the API.
 *
 * Seeding through HTTP would be faster and would also skip the sign-up form,
 * the router redirect, and the socket handshake that follows a successful
 * registration — three of the things most likely to break and least likely to
 * be caught anywhere else.
 */

export interface TestUser {
	displayName: string;
	handle: string;
	email: string;
	password: string;
}

/**
 * A user nobody else in this run will collide with.
 *
 * The handle column is unique and the database is truncated once per run, not
 * per test, so two specs registering "minh" would fail the second one — for a
 * reason that has nothing to do with what it was checking.
 */
export function makeUser(name: string): TestUser {
	const suffix = Math.random().toString(36).slice(2, 8);

	return {
		displayName: name,
		handle: `${name.toLowerCase()}_${suffix}`,
		email: `${name.toLowerCase()}_${suffix}@chatty.test`,
		password: "SuperSecret123",
	};
}

/** Registers through the form and waits until the chat screen is up. */
export async function register(page: Page, user: TestUser): Promise<void> {
	await page.goto("/login");
	const createAccount = page.getByRole("button", { name: "No account? Create one" });
	const skipIntro = page.getByRole("button", { name: "Skip intro" });
	// The welcome sequence has its own suite. Ordinary fixtures should not pay
	// its 3.8 seconds for every account, or depend on its animation to unlock auth.
	await expect(skipIntro.or(createAccount).first()).toBeVisible();
	// Dispatched rather than clicked: the curtain keeps moving, and WebKit's
	// "element is stable" wait could outlast the test before the click landed.
	if (await skipIntro.isVisible()) await skipIntro.dispatchEvent("click");
	await createAccount.click();

	await page.getByLabel("Display name").fill(user.displayName);
	await page.getByLabel("Handle").fill(user.handle);
	await page.getByLabel("Email").fill(user.email);
	await page.getByLabel("Password").fill(user.password);
	await page.getByRole("button", { name: "Create account" }).click();

	// The people search is the one control that is on the chat screen
	// unconditionally — the message composer is not, because it only renders
	// once a conversation is selected.
	await expect(page.getByLabel("Find someone")).toBeVisible({ timeout: 15_000 });
}

/**
 * Waits for a conversation to appear in the sidebar and opens it.
 *
 * The wait is the interesting half. Nobody reloads: a conversation someone else
 * just created reaches this browser over the socket as `conversation:new`, and
 * if that event stopped firing this is the only test that would notice.
 */
export async function openConversationWith(page: Page, peer: TestUser): Promise<void> {
	const row = page.getByRole("button", { name: new RegExp(peer.displayName) });
	// Route changes render a frame behind the URL; wait until what is painted is
	// what the address says, then decide. A visible row is always clicked (opening
	// the open thread is a no-op); a phone that hides the list while a thread is open
	// only skips the click when that thread is this peer's.
	await page.waitForFunction(() => {
		const routed = /\/chat\/([^/]+)$/u.exec(location.pathname)?.[1] ?? null;
		const painted = document.querySelector("main")?.getAttribute("data-conversation-id") ?? null;

		return routed === painted;
	});
	const openThread = page.getByRole("main").getByRole("heading", { name: peer.displayName, exact: true });
	await expect(row.or(openThread).first()).toBeVisible({ timeout: 15_000 });
	if (await row.isVisible()) await row.click();
	await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
}

/** Text inside the conversation itself, not the sidebar's last-message preview. */
export function messages(page: Page) {
	return page.getByRole("main");
}

/** Starts a direct conversation with someone, found by handle. */
export async function startDirectChat(page: Page, peer: TestUser): Promise<void> {
	await page.getByLabel("Find someone").fill(peer.handle);
	await page.getByLabel("Find someone").press("Enter");

	await page.getByRole("button", { name: `${peer.displayName} @${peer.handle}` }).click();
	await page.getByRole("button", { name: `Chat with ${peer.displayName}` }).click();
	await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEnabled();
}

/**
 * Starts a group with two or more people, found by handle, and names it.
 *
 * Two is not a typo: the app decides `isGroup` from how many *other* people are
 * in the conversation, so a "group" of one other person is a direct chat with a
 * name nobody sees.
 */
export async function startGroupChat(page: Page, peers: TestUser[], name: string): Promise<void> {
	if (peers.length < 2) throw new Error("a group needs at least two other people");

	for (const peer of peers) {
		await page.getByLabel("Find someone").fill(peer.handle);
		await page.getByLabel("Find someone").press("Enter");
		await page.getByRole("button", { name: `${peer.displayName} @${peer.handle}` }).click();
	}

	await page.getByLabel("Group name (optional)").fill(name);
	await page.getByRole("button", { name: `Create group with ${peers.length} people` }).click();
	await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15_000 });
}

/** Opens a conversation from the sidebar by its title. */
export async function openConversationNamed(page: Page, name: string): Promise<void> {
	const row = page.getByRole("button", { name: new RegExp(name) });
	await expect(row).toBeVisible({ timeout: 15_000 });
	await row.click();
	await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
}

/** Types into the composer and sends. */
export async function sendMessage(page: Page, text: string): Promise<void> {
	await page.getByLabel("Message", { exact: true }).fill(text);
	await page.getByLabel("Message", { exact: true }).press("Enter");
}
