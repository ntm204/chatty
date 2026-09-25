import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAutosizeTextarea } from "@/hooks/use-autosize-textarea";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it("defers and coalesces resize writes, ignores height-only changes and cancels pending work", () => {
	let notify!: () => void;
	const disconnect = vi.fn();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: () => void) {
				notify = callback;
			}
			observe = vi.fn();
			disconnect = disconnect;
		},
	);
	const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
	const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
	const field = document.createElement("textarea");
	let width = 100;
	let height = 60;
	Object.defineProperties(field, {
		clientWidth: { get: () => width },
		scrollHeight: { get: () => height },
	});
	const ref = { current: field };
	const { unmount } = renderHook(() => useAutosizeTextarea(ref, "draft"));
	expect(field.style.height).toBe("60px");
	height = 160;
	notify();
	expect(requestFrame).not.toHaveBeenCalled();
	width = 80;
	notify();
	width = 70;
	notify();
	expect(requestFrame).toHaveBeenCalledTimes(1);
	expect(field.style.height).toBe("60px");
	requestFrame.mock.calls[0]![0](0);
	expect(field.style.height).toBe("160px");
	width = 120;
	notify();
	expect(requestFrame).toHaveBeenCalledTimes(2);
	unmount();
	expect(disconnect).toHaveBeenCalledOnce();
	expect(cancelFrame).toHaveBeenCalledWith(42);
});
