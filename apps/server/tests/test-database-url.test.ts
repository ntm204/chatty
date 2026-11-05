import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("isolated local test database configuration", () => {
	it("keeps the fixed test database on IPv4 loopback when selecting the test instance", async () => {
		vi.resetModules();
		vi.stubEnv("CHATTY_TEST_POSTGRES_PORT", "5433");
		const { TEST_DATABASE_URL } = await import("./test-database-url.js");
		const parsed = new URL(TEST_DATABASE_URL);
		expect(parsed.hostname).toBe("127.0.0.1");
		expect(parsed.port).toBe("5433");
		expect(parsed.pathname).toBe("/chatty_test");
	});

	it("preserves the original default instance when no override is present", async () => {
		vi.resetModules();
		vi.stubEnv("CHATTY_TEST_POSTGRES_PORT", undefined);
		const { TEST_DATABASE_URL } = await import("./test-database-url.js");
		expect(TEST_DATABASE_URL).toBe("postgresql://chatty:chatty@localhost:5432/chatty_test");
	});

	it.each(["0", "-1", "65536", "5433/chatty", "5433?host=remote", "not-a-port"])(
		"rejects an invalid port override before connecting: %s",
		async (port) => {
			vi.resetModules();
			vi.stubEnv("CHATTY_TEST_POSTGRES_PORT", port);
			await expect(import("./test-database-url.js")).rejects.toThrow("valid local TCP port");
		},
	);
});
