import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, NetworkUnavailableError, setSessionExpiredHandler, storeSession } from "@/api/client";

/**
 * Attachment sends use XHR (for progress), outside `request()`. These pin the
 * contract they must still keep: every outcome settles, and a 401 renews the
 * session and resends the same body instead of signing the user out.
 */

interface FakeResponse {
	status: number;
	body?: string;
}

const sentBodies: unknown[] = [];
let responses: FakeResponse[] = [];

class FakeXhr extends EventTarget {
	status = 0;
	responseText = "";
	readonly upload = new EventTarget();
	readonly headers: Record<string, string> = {};

	open() {}

	setRequestHeader(name: string, value: string) {
		this.headers[name] = value;
	}

	abort() {
		this.dispatchEvent(new Event("abort"));
	}

	send(body: unknown) {
		sentBodies.push(body);
		const next = responses.shift();
		// No scripted response: the connection hangs, which only the stall timer ends.
		if (!next) return;
		queueMicrotask(() => {
			this.status = next.status;
			this.responseText = next.body ?? "";
			this.dispatchEvent(new Event("load"));
		});
	}
}

const onSessionExpired = vi.fn();

function sendImage() {
	const image = new File(["x"], "photo.png", { type: "image/png" });

	return api.sendMessage("c1", "", [image], undefined, [], "client-1");
}

beforeEach(() => {
	sentBodies.length = 0;
	responses = [];
	onSessionExpired.mockReset();
	setSessionExpiredHandler(onSessionExpired);
	storeSession("old-token");
	vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("an attachment upload", () => {
	it("fails cleanly when a proxy answers with an HTML error page", async () => {
		responses = [{ status: 502, body: "<html>Bad gateway</html>" }];

		await expect(sendImage()).rejects.toBeInstanceOf(NetworkUnavailableError);
	});

	it("fails cleanly when a 2xx body is not a message", async () => {
		responses = [{ status: 200, body: "<html>captive portal</html>" }];

		await expect(sendImage()).rejects.toBeInstanceOf(NetworkUnavailableError);
	});

	it("renews an expired token and resends the same body", async () => {
		responses = [{ status: 401 }, { status: 201, body: JSON.stringify({ id: "m1" }) }];
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ token: "new-token" }) }),
		);

		await expect(sendImage()).resolves.toMatchObject({ id: "m1" });
		expect(sentBodies).toHaveLength(2);
		expect(sentBodies[1]).toBe(sentBodies[0]);
		expect((sentBodies[1] as FormData).get("clientId")).toBe("client-1");
		expect(onSessionExpired).not.toHaveBeenCalled();
	});

	it("ends the session only when the renewal is refused", async () => {
		responses = [{ status: 401 }];
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) }));

		await expect(sendImage()).rejects.toThrow();
		expect(onSessionExpired).toHaveBeenCalledOnce();
	});

	it("settles when the renewal behind a 401 never answers", async () => {
		responses = [{ status: 401 }];
		// Stands in for the refresh deadline firing, without waiting it out.
		const deadline = new AbortController();
		vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_url: string, init: RequestInit) =>
					new Promise((_resolve, reject) =>
						init.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
					),
			),
		);
		const settled = expect(sendImage()).rejects.toBeInstanceOf(NetworkUnavailableError);

		await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
		deadline.abort();

		await settled;
		expect(onSessionExpired).not.toHaveBeenCalled();
	});

	it("gives up on a connection that stops moving", async () => {
		vi.useFakeTimers();
		const pending = sendImage();
		const settled = expect(pending).rejects.toBeInstanceOf(NetworkUnavailableError);

		await vi.advanceTimersByTimeAsync(60_000);

		await settled;
	});
});
