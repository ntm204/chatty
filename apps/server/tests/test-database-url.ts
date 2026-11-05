/**
 * The one place the test database is named.
 *
 * Both vitest.config.ts (which injects it into the test environment) and
 * global-setup.ts (which migrates it) import this. They cannot share it via
 * `process.env`: vitest's `test.env` only applies to test files, so globalSetup
 * would fall back to the dev `.env` and migrate the wrong database.
 */
// Only the local port is configurable; test runners must never accept a dev database name.
const port = Number(process.env.CHATTY_TEST_POSTGRES_PORT ?? "5432");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error("CHATTY_TEST_POSTGRES_PORT must be a valid local TCP port");
}
// The optional container publishes IPv4 only; avoid a slow IPv6 connection fallback.
const host = process.env.CHATTY_TEST_POSTGRES_PORT ? "127.0.0.1" : "localhost";
export const TEST_DATABASE_URL = `postgresql://chatty:chatty@${host}:${port}/chatty_test`;
