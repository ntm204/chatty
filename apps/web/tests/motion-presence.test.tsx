import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTION_DURATION } from "@/constants/motion";
import { useMotionPresence } from "@/hooks/use-motion-presence";
import { useAnimatedDismiss } from "@/hooks/use-animated-dismiss";

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("motion presence", () => {
	it("keeps a closing surface alive and cancels stale removal when reopened", () => {
		vi.useFakeTimers();
		const { result, rerender } = renderHook(({ isOpen }) => useMotionPresence(isOpen), {
			initialProps: { isOpen: true },
		});
		rerender({ isOpen: false });
		expect(result.current).toEqual({ isPresent: true, motionState: "closed" });
		act(() => vi.advanceTimersByTime(100));
		rerender({ isOpen: true });
		act(() => vi.advanceTimersByTime(MOTION_DURATION));
		expect(result.current.isPresent).toBe(true);
		rerender({ isOpen: false });
		act(() => vi.advanceTimersByTime(MOTION_DURATION));
		expect(result.current.isPresent).toBe(false);
	});

	it("removes immediately when reduced motion is requested", () => {
		vi.stubGlobal("matchMedia", () => ({ matches: true }));
		const { result, rerender } = renderHook(({ isOpen }) => useMotionPresence(isOpen), {
			initialProps: { isOpen: true },
		});
		rerender({ isOpen: false });
		expect(result.current.isPresent).toBe(false);
	});

	it("runs the selected completion exactly once after repeated dismissals", () => {
		vi.useFakeTimers();
		const close = vi.fn();
		const forward = vi.fn();
		const { result } = renderHook(() => useAnimatedDismiss(close));
		act(() => {
			result.current.dismiss(forward);
			result.current.dismiss();
		});
		expect(forward).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(MOTION_DURATION));
		expect(forward).toHaveBeenCalledTimes(1);
		expect(close).not.toHaveBeenCalled();
	});
});
