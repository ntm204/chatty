import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useGroupMemberMutations } from "@/features/chat/hooks/use-group-member-mutations";

it("serializes a person's role/removal writes without blocking another person", async () => {
	let finish!: () => void;
	const first = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const duplicate = vi.fn();
	const other = vi.fn().mockResolvedValue(undefined);
	const { result } = renderHook(() => useGroupMemberMutations("group"));
	let pending!: Promise<boolean>;
	await act(async () => {
		pending = result.current.run("an", "role", first);
		await result.current.run("an", "remove", duplicate);
		await result.current.run("binh", "role", other);
	});
	expect(duplicate).not.toHaveBeenCalled();
	expect(other).toHaveBeenCalledOnce();
	expect(result.current.pending).toEqual({ an: "role" });
	await act(async () => {
		finish();
		await pending;
	});
	expect(result.current.pending).toEqual({});
});

it("ignores old-group failure while a new group has its own pending request", async () => {
	let fail!: (error: Error) => void;
	let finish!: () => void;
	const { result, rerender } = renderHook(({ id }) => useGroupMemberMutations(id), { initialProps: { id: "old" } });
	let oldRequest!: Promise<boolean>;
	let newRequest!: Promise<boolean>;
	act(() => {
		oldRequest = result.current.run(
			"an",
			"remove",
			() =>
				new Promise((_resolve, reject) => {
					fail = reject;
				}),
		);
	});
	rerender({ id: "new" });
	act(() => {
		newRequest = result.current.run(
			"an",
			"role",
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
	});
	await act(async () => {
		fail(new Error("Old error"));
		expect(await oldRequest).toBe(false);
	});
	expect(result.current.error).toBe("");
	expect(result.current.pending).toEqual({ an: "role" });
	await act(async () => {
		finish();
		expect(await newRequest).toBe(true);
	});
});
