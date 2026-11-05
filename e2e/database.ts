/**
 * The one place the e2e database is named.
 *
 * Its own database, not the dev one and not `chatty_test`: the global setup
 * truncates it, so pointing this at either would delete work — accounts created
 * by hand while developing, or the fixtures of a `npm test` run happening in
 * another terminal. The same reasoning, and the same failure, as
 * apps/server/tests/test-database-url.ts.
 */
const port = Number(process.env.CHATTY_TEST_POSTGRES_PORT ?? "5432");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error("CHATTY_TEST_POSTGRES_PORT must be a valid local TCP port");
}
const host = process.env.CHATTY_TEST_POSTGRES_PORT ? "127.0.0.1" : "localhost";
export const E2E_DATABASE_URL = `postgresql://chatty:chatty@${host}:${port}/chatty_e2e`;
