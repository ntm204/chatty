import { act, renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useUserSearch } from "@/features/chat/hooks/use-user-search";
import { makeUser } from "./factories";

vi.mock("@/api/client", () => ({ api: { searchUsers: vi.fn() } }));
afterEach(() => {
	vi.resetAllMocks();
	vi.restoreAllMocks();
});
const event = { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>;

it("ignores a result after the query changes, even before another submission", async () => {
	let finish!: (users: ReturnType<typeof makeUser>[]) => void;
	vi.mocked(api.searchUsers).mockReturnValueOnce(
		new Promise((resolve) => {
			finish = resolve;
		}),
	);
	const view = renderHook(() => useUserSearch());
	act(() => view.result.current.setQuery("old"));
	act(() => view.result.current.search(event));
	act(() => view.result.current.setQuery("new"));
	await act(async () => finish([makeUser("old", "Old")]));
	expect(view.result.current.results).toEqual([]);
	expect(view.result.current.hasNoResults).toBe(false);
	expect(view.result.current.isSearching).toBe(false);
});

it("keeps the latest result when an earlier search fails later", async () => {
	let fail!: (error: Error) => void;
	vi.mocked(api.searchUsers).mockReturnValueOnce(
		new Promise((_resolve, reject) => {
			fail = reject;
		}),
	);
	vi.mocked(api.searchUsers).mockResolvedValueOnce([makeUser("new", "New")]);
	const view = renderHook(() => useUserSearch());
	act(() => view.result.current.setQuery("old"));
	act(() => view.result.current.search(event));
	act(() => view.result.current.setQuery("new"));
	await act(async () => view.result.current.search(event));
	await act(async () => fail(new Error("old failure")));
	expect(view.result.current.results[0]?.id).toBe("new");
	expect(view.result.current.error).toBe("");
});

it("re-filters people when group membership changes and resets empty state", async () => {
	vi.mocked(api.searchUsers).mockResolvedValue([makeUser("new", "New")]);
	const view = renderHook(({ excluded }) => useUserSearch(excluded), { initialProps: { excluded: [] as string[] } });
	act(() => view.result.current.setQuery("new"));
	await act(async () => view.result.current.search(event));
	view.rerender({ excluded: ["new"] });
	expect(view.result.current.hasNoResults).toBe(true);
	act(() => view.result.current.reset());
	expect(view.result.current.hasNoResults).toBe(false);
});

it("explains offline search instead of returning an empty success", () => {
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
	const view = renderHook(() => useUserSearch());
	act(() => view.result.current.setQuery("friend"));
	act(() => view.result.current.search(event));
	expect(view.result.current.error).toBe("Connect to find people.");
	expect(view.result.current.hasNoResults).toBe(false);
	expect(api.searchUsers).not.toHaveBeenCalled();
});
