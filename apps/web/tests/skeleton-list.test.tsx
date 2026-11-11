import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SkeletonList } from "@/components/skeleton";
import { SKELETON_DELAY_MS } from "@/constants/loading";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

it("stays hidden for a fast load and appears once loading runs long", () => {
	vi.useFakeTimers();
	render(<SkeletonList label="Loading conversations" rows={2} />);
	expect(screen.queryByRole("status")).toBeNull();

	act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS - 1));
	expect(screen.queryByRole("status")).toBeNull();

	act(() => vi.advanceTimersByTime(1));
	expect(screen.getByRole("status")).toHaveTextContent("Loading conversations");
});
