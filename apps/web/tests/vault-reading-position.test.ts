import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useVaultReadingPosition } from "@/features/chat/hooks/use-vault-reading-position";

/**
 * A live update (a new link, a retracted message) reloads the vault list while
 * the reader may still be scrolling. The position they scroll to during that
 * reload is the one to restore when it finishes, not the one from before it.
 */

function renderPosition(container: HTMLDivElement) {
	return renderHook(
		({ isLoading, items }: { isLoading: boolean; items: { id: string }[] }) =>
			useVaultReadingPosition({ current: container }, "links", isLoading, items),
		{ initialProps: { isLoading: false, items: [{ id: "a" }] } },
	);
}

describe("vault reading position", () => {
	it("keeps a scroll made while a refresh is loading", () => {
		const container = document.createElement("div");
		const { result, rerender } = renderPosition(container);

		rerender({ isLoading: true, items: [{ id: "a" }] });
		container.scrollTop = 500;
		result.current();
		rerender({ isLoading: false, items: [{ id: "b" }] });

		expect(container.scrollTop).toBe(500);
	});

	it("does not record the clamped position of an emptied list", () => {
		const container = document.createElement("div");
		const { result, rerender } = renderPosition(container);
		container.scrollTop = 300;
		result.current();

		rerender({ isLoading: true, items: [] });
		container.scrollTop = 0;
		result.current();
		rerender({ isLoading: false, items: [{ id: "a" }] });

		expect(container.scrollTop).toBe(300);
	});
});
