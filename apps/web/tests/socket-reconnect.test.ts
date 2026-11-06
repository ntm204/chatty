import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * When the server refuses a handshake (an expired token), socket.io leaves the
 * socket inactive and never retries it. Renewing the token is not enough on its
 * own: the client has to connect again, or realtime stays off until a reload.
 */

const fakeSocket = vi.hoisted(() => {
	const handlers = new Map<string, () => void>();

	return {
		active: false,
		handlers,
		on: (event: string, handler: () => void) => handlers.set(event, handler),
		connect: () => undefined,
		disconnect: () => undefined,
	};
});

vi.mock("socket.io-client", () => ({ io: () => fakeSocket }));

const { getSocket, closeSocket } = await import("@/lib/socket");

function refreshAnswers(status: number) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve({ token: "renewed" }) }),
	);
}

beforeEach(() => {
	fakeSocket.active = false;
	fakeSocket.handlers.clear();
	vi.spyOn(fakeSocket, "connect");
	getSocket();
});

afterEach(() => {
	closeSocket();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("a refused handshake", () => {
	it("reconnects once the token is renewed", async () => {
		refreshAnswers(200);

		fakeSocket.handlers.get("connect_error")?.();

		await vi.waitFor(() => expect(fakeSocket.connect).toHaveBeenCalledOnce());
	});

	it("stays disconnected when the session has ended", async () => {
		refreshAnswers(401);

		fakeSocket.handlers.get("connect_error")?.();
		await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
		await Promise.resolve();

		expect(fakeSocket.connect).not.toHaveBeenCalled();
	});
});
