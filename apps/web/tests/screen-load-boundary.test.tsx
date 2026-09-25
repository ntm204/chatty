import { act, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { expect, it, vi } from "vitest";
import { ScreenLoadBoundary } from "@/components/screen-load-boundary/screen-load-boundary";

it("shows a loading status until the screen module arrives", async () => {
	let finish!: (module: { default: () => string }) => void;
	const Screen = lazy(
		() =>
			new Promise<{ default: () => string }>((resolve) => {
				finish = resolve;
			}),
	);
	const view = render(
		<ScreenLoadBoundary>
			<Screen />
		</ScreenLoadBoundary>,
	);
	expect(screen.getByRole("status")).toHaveTextContent("Loading…");
	await act(async () => finish({ default: () => "Screen ready" }));
	expect(view.getByText("Screen ready")).toBeVisible();
});

it("offers recovery when a screen chunk fails instead of leaving a blank screen", async () => {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
	try {
		const Screen = lazy(() => Promise.reject(new Error("Chunk unavailable")));
		render(
			<ScreenLoadBoundary>
				<Screen />
			</ScreenLoadBoundary>,
		);
		expect(await screen.findByRole("alert")).toHaveTextContent("This screen couldn’t load.");
		expect(screen.getByRole("button", { name: "Reload" })).toBeVisible();
	} finally {
		consoleError.mockRestore();
	}
});
