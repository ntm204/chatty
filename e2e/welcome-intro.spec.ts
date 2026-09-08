import { expect, test } from "@playwright/test";

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 },
]) {
	test(`welcome replays on reload and reveals login at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await page.goto("/login");
		const intro = page.getByRole("dialog", { name: "Welcome to Chatty" });
		await expect(intro).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveCount(0);
		await expect
			.poll(() => page.locator('input[type="email"]').evaluate((element) => Boolean(element.closest("[inert]"))))
			.toBe(true);
		await page.keyboard.press("Tab");
		await expect(intro.getByRole("button", { name: "Skip intro" })).toBeFocused();
		await expect(intro).toHaveCount(0, { timeout: 5200 });
		await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
		expect(
			await page.evaluate(() => ({
				x: document.documentElement.scrollWidth > innerWidth,
				y: document.documentElement.scrollHeight > innerHeight,
			})),
		).toEqual({ x: false, y: false });
		await page.reload();
		await expect(intro).toBeVisible();
		await intro.getByRole("button", { name: "Skip intro" }).click();
		await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
		await expect(intro).toHaveCount(0);
		await page.getByRole("button", { name: "Get started", exact: true }).click();
		await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
		await expect(intro).toHaveCount(0);
	});
}

test("welcome skips immediately, and reduced motion bypasses it", async ({ page }) => {
	await page.goto("/login");
	await page.getByRole("button", { name: "Skip intro" }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.getByRole("textbox", { name: "Email", exact: true }).fill("hello@example.com");
	await page.reload();
	await expect(page.getByRole("dialog", { name: "Welcome to Chatty" })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.reload();
	await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a missing animation event or blocked storage cannot trap the login", async ({ page }) => {
	await page.addInitScript(() => {
		Storage.prototype.setItem = () => {
			throw new Error("Storage unavailable");
		};
	});
	await page.goto("/login");
	await expect(page.getByRole("dialog", { name: "Welcome to Chatty" })).toBeVisible();
	await page.addStyleTag({ content: ".welcome-intro { animation: none !important; }" });
	await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 5200 });
	await page.getByRole("textbox", { name: "Email", exact: true }).fill("ready@example.com");
});

test("letters fall independently, eyes glance left and right, then face the viewer and wink", async ({ page }) => {
	await page.goto("/login");
	await expect(page.getByRole("dialog", { name: "Welcome to Chatty" })).toBeVisible();
	const motion = await page.evaluate(() => {
		const intro = document.querySelector(".welcome-intro")!;
		const symbol = intro.querySelector(".brand-symbol")!;
		const letters = Array.from(intro.querySelectorAll(".brand-wordmark > span"));
		function seek(time: number) {
			for (const animation of document.getAnimations()) {
				if (animation instanceof CSSAnimation && animation.animationName.startsWith("welcome-")) {
					animation.pause();
					animation.currentTime = time;
				}
			}
		}
		seek(700);
		const falling = letters.map((letter) => ({
			y: letter.getBoundingClientRect().y,
			opacity: getComputedStyle(letter).opacity,
		}));
		function gazeAt(time: number) {
			seek(time);
			const eyes = Array.from(symbol.querySelectorAll("i"));
			return {
				x: eyes.map((eye) => parseFloat(getComputedStyle(eye).translate)),
				height: eyes.map((eye) => new DOMMatrix(getComputedStyle(eye).transform).d),
				roll: new DOMMatrix(getComputedStyle(symbol).transform).b,
			};
		}
		return {
			falling,
			left: gazeAt(1120),
			leftHold: gazeAt(1270),
			right: gazeAt(1610),
			front: gazeAt(2440),
			wink: gazeAt(2780),
		};
	});
	expect(motion.falling).toHaveLength(6);
	expect(motion.falling[0]!.y).not.toBe(motion.falling[1]!.y);
	expect(Number(motion.falling[0]!.opacity)).toBeGreaterThan(0);
	expect(Number(motion.falling[5]!.opacity)).toBe(0);
	expect(motion.left.x.every((x) => x < -6)).toBe(true);
	expect(motion.leftHold.x).toEqual(motion.left.x);
	expect(motion.right.x.every((x) => x > 6)).toBe(true);
	expect(motion.front.x).toEqual([0, 0]);
	// The body turns gently in depth, never oscillating around the screen's Z axis.
	expect(motion.left.roll).toBeCloseTo(0);
	expect(motion.right.roll).toBeCloseTo(0);
	expect(motion.front.height).toEqual([1, 1]);
	expect(motion.wink.height[0]).toBeGreaterThan(0.7);
	expect(motion.wink.height[1]).toBeLessThan(0.2);
	await page.getByRole("button", { name: "Skip intro" }).click();
	await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
});
