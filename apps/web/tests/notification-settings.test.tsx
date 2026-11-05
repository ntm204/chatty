import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSettings } from "@/features/profile/components/notification-settings";
import { useNotificationSetting } from "@/hooks/use-notification-setting";

const requestPermission = vi.fn();
let permission: NotificationPermission = "default";

beforeEach(() => {
	permission = "default";
	requestPermission.mockReset();
	vi.stubGlobal("Notification", {
		get permission() {
			return permission;
		},
		requestPermission,
	});
	useNotificationSetting.setState({ isEnabled: false, isEnabling: false, error: "", permission: "default" });
});

afterEach(() => vi.unstubAllGlobals());

describe("notification permission recovery", () => {
	it("refreshes permission changed in browser settings when the app regains focus", () => {
		render(<NotificationSettings />);
		expect(screen.getByRole("button", { name: "Turn notifications on" })).toBeVisible();
		permission = "denied";
		fireEvent.focus(window);
		expect(screen.getByRole("status")).toHaveTextContent("Notifications blocked");
		expect(screen.queryByRole("button", { name: "Turn notifications on" })).not.toBeInTheDocument();
		permission = "granted";
		fireEvent(document, new Event("visibilitychange"));
		expect(screen.getByRole("button", { name: "Turn notifications on" })).toBeVisible();
	});

	it("shows a retryable error instead of an unhandled permission rejection", async () => {
		requestPermission.mockRejectedValueOnce(new Error("Browser rejected the prompt"));
		render(<NotificationSettings />);
		fireEvent.click(screen.getByRole("button", { name: "Turn notifications on" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Check your browser’s site settings");
		expect(useNotificationSetting.getState().isEnabled).toBe(false);
		permission = "granted";
		requestPermission.mockResolvedValueOnce("granted");
		fireEvent.click(screen.getByRole("button", { name: "Turn notifications on" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Turn notifications off" })).toBeVisible());
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("allows only one outstanding browser permission request", async () => {
		let resolvePermission: (value: NotificationPermission) => void = () => {};
		requestPermission.mockImplementation(
			() =>
				new Promise<NotificationPermission>((resolve) => {
					resolvePermission = resolve;
				}),
		);
		render(<NotificationSettings />);
		fireEvent.click(screen.getByRole("button", { name: "Turn notifications on" }));
		expect(screen.getByRole("button", { name: "Requesting permission…" })).toBeDisabled();
		await act(async () => {
			await useNotificationSetting.getState().enable();
		});
		expect(requestPermission).toHaveBeenCalledTimes(1);
		await act(async () => {
			resolvePermission("granted");
		});
		expect(screen.getByRole("button", { name: "Turn notifications off" })).toBeEnabled();
	});
});
