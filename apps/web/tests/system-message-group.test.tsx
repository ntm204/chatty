import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SystemMessageGroup } from "@/features/chat/components/system-message-group";
import { getSystemMessageRuns } from "@/features/chat/utils/system-message-runs";
import { makeMessage, makeSystemMessage } from "./factories";

afterEach(cleanup);
const updates = [1, 2, 3].map((n) => makeSystemMessage(`s${n}`, `Update ${n}`));

it("collapses three updates and lets the reader reveal and hide their full content", () => {
	render(<SystemMessageGroup messages={updates} />);
	const toggle = screen.getByRole("button", { name: "3 chat updates" });
	expect(toggle).toHaveAttribute("aria-expanded", "false");
	expect(screen.getByText("Update 1")).not.toBeVisible();
	fireEvent.click(toggle);
	expect(screen.getByText("Update 1")).toBeVisible();
	expect(screen.getByText("Update 3")).toBeVisible();
	fireEvent.click(toggle);
	expect(screen.getByText("Update 1")).not.toBeVisible();
});

it("keeps two updates visible without a disclosure", () => {
	render(<SystemMessageGroup messages={updates.slice(0, 2)} />);
	expect(screen.queryByRole("button")).not.toBeInTheDocument();
	expect(screen.getByText("Update 1")).toBeVisible();
});

it("splits at unread markers, user messages, day changes and long pauses", () => {
	expect([...getSystemMessageRuns(updates, "s2").values()].map((run) => run.length)).toEqual([1, 2]);
	const separated = [
		updates[0]!,
		makeMessage("m", "an", "Hello"),
		updates[1]!,
		{ ...updates[2]!, createdAt: "2026-08-24T10:00:00.000Z" },
		{ ...updates[2]!, id: "s4", createdAt: "2026-08-24T12:00:00.000Z" },
	];
	expect([...getSystemMessageRuns(separated, null).values()].map((run) => run.length)).toEqual([1, 1, 1, 1]);
});
