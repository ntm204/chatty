import { expect, type Locator, type Page } from "@playwright/test";

export interface ReadingAnchor {
	id: string;
	offset: number;
}

export async function captureReadingAnchor(page: Page): Promise<ReadingAnchor> {
	return page.getByLabel("Message history").evaluate((container) => {
		const viewport = container.getBoundingClientRect();
		const chrome = container.closest(".conversation-pane")?.querySelector(".conversation-chrome");
		const visibleTop = Math.max(viewport.top, chrome?.getBoundingClientRect().bottom ?? viewport.top);
		const element = Array.from(container.querySelectorAll<HTMLElement>('[id^="message-"]')).find((row) => {
			const bounds = row.getBoundingClientRect();

			return bounds.bottom > visibleTop && bounds.top < viewport.bottom;
		});
		if (!element) throw new Error("No message is visible below the conversation header");

		return { id: element.id, offset: element.getBoundingClientRect().top - viewport.top };
	});
}

export async function expectReadingAnchor(page: Page, anchor: ReadingAnchor) {
	// Within one pixel: layout is fractional but the browser snaps the scroll
	// offset to a device pixel, so an exact restore can still read 0.8px apart.
	await expect
		.poll(async () =>
			Math.abs(
				(await page
					.locator(`#${anchor.id}`)
					.evaluate(
						(element) =>
							element.getBoundingClientRect().top -
							element.closest('[aria-label="Message history"]')!.getBoundingClientRect().top,
					)) - anchor.offset,
			),
		)
		.toBeLessThanOrEqual(1);
}

/** A locator cue belongs to the content, never the full-width message row. */
export async function expectMessageLocationCue(row: Locator) {
	await expect(row).toHaveAttribute("data-message-located", "true");
	const surface = row.locator("[data-message-surface]");
	const marker = surface.locator(".message-location-marker");
	await expect(marker).toHaveCSS("opacity", "1");
	await expect(marker).toHaveAttribute("aria-hidden", "true");
	await expect(marker).toHaveCSS("pointer-events", "none");
	const surfaceBounds = (await surface.boundingBox())!;
	const markerBounds = (await marker.boundingBox())!;
	const rowBounds = (await row.boundingBox())!;
	expect(markerBounds.x).toBeGreaterThanOrEqual(surfaceBounds.x - 4);
	expect(markerBounds.y).toBeGreaterThanOrEqual(surfaceBounds.y - 4);
	expect(markerBounds.width).toBeLessThanOrEqual(surfaceBounds.width + 8);
	expect(markerBounds.height).toBeLessThanOrEqual(surfaceBounds.height + 8);
	if (rowBounds.width > 600) expect(markerBounds.width).toBeLessThan(rowBounds.width * 0.8);
	await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(row).toHaveCSS("box-shadow", "none");
}

export async function expectReplyReturnControl(page: Page) {
	const button = page.getByRole("button", { name: "Back to reply", exact: true });
	await expect(button).toBeVisible();
	await expect(button).toBeEnabled();
	const bounds = (await button.boundingBox())!;
	const history = (await page.getByLabel("Message history").boundingBox())!;
	const header = (await page.locator(".conversation-header").boundingBox())!;
	const composer = (await page.getByRole("textbox", { name: "Message", exact: true }).boundingBox())!;
	expect(bounds.width).toBeGreaterThanOrEqual(44);
	expect(bounds.height).toBeGreaterThanOrEqual(44);
	expect(bounds.y).toBeGreaterThan(header.y + header.height);
	expect(bounds.y).toBeGreaterThan(history.y + history.height - 80);
	expect(bounds.y + bounds.height).toBeLessThanOrEqual(composer.y);
	expect(bounds.x).toBeGreaterThan(history.x + history.width / 2);
	expect(bounds.x + bounds.width).toBeLessThanOrEqual(history.x + history.width);
	const latest = page.getByRole("button", { name: "Jump to latest messages", exact: true });
	if (await latest.isVisible()) {
		const latestBounds = (await latest.boundingBox())!;
		expect(latestBounds.x + latestBounds.width).toBeLessThanOrEqual(bounds.x);
	}
}
