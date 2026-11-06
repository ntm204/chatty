import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, NetworkUnavailableError, setSessionExpiredHandler, storeSession, wasSessionExpired } from "@/api/client";

/**
 * A 401 means two different things depending on where it came from, and telling
 * them apart is the whole of this behaviour: a wrong password on a form belongs
 * to that form, while a 401 anywhere else means the token this tab holds is
 * dead and the session has to end.
 */

const onSessionExpired = vi.fn();

function respondWith(status: number) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: status < 400,
			status,
			json: () => Promise.resolve({ message: "nope" }),
		}),
	);
}

beforeEach(() => {
	onSessionExpired.mockReset();
	setSessionExpiredHandler(onSessionExpired);
	// Storing a session is also what clears the flag, so this resets both.
	storeSession("a-token");
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("a 401 on an ordinary request", () => {
	it("ends the session and leaves a reason for the login screen", async () => {
		respondWith(401);

		await expect(api.listConversations()).rejects.toThrow();

		expect(onSessionExpired).toHaveBeenCalledOnce();
		expect(wasSessionExpired()).toBe(true);
	});

	it("keeps saying so until there is a session again", async () => {
		// A pure read, on purpose: it used to read-and-clear, and React's
		// StrictMode double-invoked the lazy initialiser that called it — so the
		// first call consumed the flag and the login form was handed `false`.
		respondWith(401);
		await expect(api.listConversations()).rejects.toThrow();

		expect(wasSessionExpired()).toBe(true);
		expect(wasSessionExpired()).toBe(true);

		storeSession("fresh-token");

		expect(wasSessionExpired()).toBe(false);
	});
});

describe("a 401 answering a password", () => {
	it("does not sign the user out when the password on the login form is wrong", async () => {
		respondWith(401);

		await expect(api.login({ email: "minh@chatty.test", password: "wrong" })).rejects.toThrow();

		expect(onSessionExpired).not.toHaveBeenCalled();
		expect(wasSessionExpired()).toBe(false);
	});

	it("does not sign the user out when the current password is wrong", async () => {
		respondWith(401);

		await expect(api.changePassword({ currentPassword: "wrong", newPassword: "n3wpassword" })).rejects.toThrow();

		expect(onSessionExpired).not.toHaveBeenCalled();
	});

	it("does not sign the user out when the deletion password is wrong", async () => {
		respondWith(401);

		await expect(api.deleteAccount({ currentPassword: "wrong" })).rejects.toThrow();

		expect(onSessionExpired).not.toHaveBeenCalled();
	});

	// `/users/me` is a credential check only when it carries a password, which is
	// the DELETE. Reading the profile with a dead token is an expired session.
	it("ends the session when the profile cannot be read", async () => {
		respondWith(401);

		await expect(api.getCurrentUser()).rejects.toThrow();

		expect(onSessionExpired).toHaveBeenCalledOnce();
	});

	// The avatar routes live under /users/me and carry no password at all.
	it("ends the session when an avatar delete is refused", async () => {
		respondWith(401);

		await expect(api.deleteAvatar()).rejects.toThrow();

		expect(onSessionExpired).toHaveBeenCalledOnce();
	});
});

describe("other failures", () => {
	it("leaves the session alone on a 403", async () => {
		respondWith(403);

		await expect(api.listConversations()).rejects.toThrow();

		expect(onSessionExpired).not.toHaveBeenCalled();
	});

	it("identifies a missing network without expiring the session", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

		await expect(api.getCurrentUser()).rejects.toBeInstanceOf(NetworkUnavailableError);
		expect(onSessionExpired).not.toHaveBeenCalled();
		expect(wasSessionExpired()).toBe(false);
	});
});

describe("a 401 whose renewal cannot be confirmed", () => {
	function expiredThenRefresh(refresh: () => Promise<unknown>) {
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) =>
				url.endsWith("/auth/refresh")
					? refresh()
					: Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }),
			),
		);
	}

	it("keeps the session when the refresh never reaches the server", async () => {
		expiredThenRefresh(() => Promise.reject(new TypeError("offline")));

		await expect(api.listConversations()).rejects.toBeInstanceOf(NetworkUnavailableError);
		expect(onSessionExpired).not.toHaveBeenCalled();
		expect(wasSessionExpired()).toBe(false);
	});

	it("keeps the session when the auth server answers with a 5xx", async () => {
		expiredThenRefresh(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }));

		await expect(api.listConversations()).rejects.toBeInstanceOf(NetworkUnavailableError);
		expect(onSessionExpired).not.toHaveBeenCalled();
	});

	it("keeps the session when the refresh is rate limited", async () => {
		expiredThenRefresh(() => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) }));

		await expect(api.listConversations()).rejects.toBeInstanceOf(NetworkUnavailableError);
		expect(onSessionExpired).not.toHaveBeenCalled();
	});

	it("retries the request with the renewed token", async () => {
		let calls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) => {
				if (url.endsWith("/auth/refresh")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ token: "renewed" }),
					});
				}
				calls += 1;

				return Promise.resolve(
					calls === 1
						? { ok: false, status: 401, json: () => Promise.resolve({}) }
						: { ok: true, status: 200, json: () => Promise.resolve({ items: [], nextCursor: null }) },
				);
			}),
		);

		await expect(api.listConversations()).resolves.toBeDefined();
		expect(onSessionExpired).not.toHaveBeenCalled();
	});
});
