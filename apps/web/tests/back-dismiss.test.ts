import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isOnLayerEntry, useBackDismiss } from "@/hooks/use-back-dismiss";

function back(): Promise<void> {
	return new Promise((resolve) => {
		window.addEventListener("popstate", () => resolve(), { once: true });
		window.history.back();
	});
}

describe("useBackDismiss (XP-47)", () => {
	it("Back closes the top layer first, then the one under it", async () => {
		const startLength = window.history.length;
		const closeDetails = vi.fn();
		const closeViewer = vi.fn();
		const details = renderHook(({ isOpen }) => useBackDismiss(isOpen, closeDetails), {
			initialProps: { isOpen: true },
		});
		const viewer = renderHook(({ isOpen }) => useBackDismiss(isOpen, closeViewer), {
			initialProps: { isOpen: true },
		});
		expect(window.history.length).toBe(startLength + 2);
		expect(isOnLayerEntry()).toBe(true);

		await act(back);
		expect(closeViewer).toHaveBeenCalledOnce();
		expect(closeDetails).not.toHaveBeenCalled();
		viewer.rerender({ isOpen: false });

		await act(back);
		expect(closeDetails).toHaveBeenCalledOnce();
		details.rerender({ isOpen: false });
		expect(isOnLayerEntry()).toBe(false);
	});

	it("closing from the UI removes its entry, so the next Back is not a dead step", async () => {
		const close = vi.fn();
		const layer = renderHook(({ isOpen }) => useBackDismiss(isOpen, close), { initialProps: { isOpen: true } });
		expect(isOnLayerEntry()).toBe(true);

		const popped = new Promise<void>((resolve) =>
			window.addEventListener("popstate", () => resolve(), { once: true }),
		);
		layer.rerender({ isOpen: false });
		await act(() => popped);

		await waitFor(() => expect(isOnLayerEntry()).toBe(false));
		expect(close).not.toHaveBeenCalled();
	});

	it("reopening right after closing keeps the new layer open", async () => {
		const close = vi.fn();
		const layer = renderHook(({ isOpen }) => useBackDismiss(isOpen, close), { initialProps: { isOpen: true } });
		layer.rerender({ isOpen: false });
		layer.rerender({ isOpen: true });

		await waitFor(() => expect(isOnLayerEntry()).toBe(true));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(close).not.toHaveBeenCalled();
		expect(isOnLayerEntry()).toBe(true);
		layer.unmount();
		await waitFor(() => expect(isOnLayerEntry()).toBe(false));
	});
});
