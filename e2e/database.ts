/**
 * The one place the e2e databases, ports and upload directories are named.
 *
 * Its own databases, not the dev one and not `chatty_test`: the global setup
 * truncates them, so pointing this at either would delete work — accounts created
 * by hand while developing, or the fixtures of a `npm test` run happening in
 * another terminal. The same reasoning, and the same failure, as
 * apps/server/tests/test-database-url.ts.
 */
const port = Number(process.env.CHATTY_TEST_POSTGRES_PORT ?? "5432");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error("CHATTY_TEST_POSTGRES_PORT must be a valid local TCP port");
}
const host = process.env.CHATTY_TEST_POSTGRES_PORT ? "127.0.0.1" : "localhost";

/**
 * Migrated once per run and never connected to by a server: every worker's
 * database is cloned from it, and PostgreSQL refuses to clone a database
 * somebody is connected to.
 */
export const E2E_TEMPLATE_DATABASE_URL = `postgresql://chatty:chatty@${host}:${port}/chatty_e2e`;

/**
 * How many spec files run at once. Each worker gets its own API server, web dev
 * server, database and upload directory, so a "who is online" assertion in one
 * spec cannot see another spec's browsers. `CHATTY_E2E_WORKERS=1` restores the
 * old one-file-at-a-time run on ports 4100/5273.
 */
export const E2E_WORKERS = Number(process.env.CHATTY_E2E_WORKERS ?? "2");
if (!Number.isInteger(E2E_WORKERS) || E2E_WORKERS < 1 || E2E_WORKERS > 8) {
	throw new Error("CHATTY_E2E_WORKERS must be a whole number from 1 to 8");
}

/**
 * Playwright's slot for the current worker: 0 to workers-1, reused when a worker
 * restarts, and never shared by two workers running at once. Unset in the main
 * process, where only worker 0's values are ever read.
 *
 * Read from the environment because Playwright sets it before it re-loads the
 * config and the spec files inside each worker, which is what lets
 * `playwright.config.ts` give each worker its own `baseURL` without every spec
 * importing a custom `test`.
 */
export function e2eWorkerIndex(): number {
	const index = Number(process.env.TEST_PARALLEL_INDEX ?? "0");
	if (index >= E2E_WORKERS) {
		throw new Error(
			`Worker ${index} has no servers; run with at most ${E2E_WORKERS} workers (CHATTY_E2E_WORKERS).`,
		);
	}

	return index;
}

/** Deliberately not 4000/5173, so an e2e run never attaches to the dev servers and their database. */
export function e2eApiUrl(worker = e2eWorkerIndex()): string {
	return `http://localhost:${4100 + worker}`;
}

export function e2eWebUrl(worker = e2eWorkerIndex()): string {
	return `http://localhost:${5273 + worker}`;
}

export function e2eDatabaseUrl(worker = e2eWorkerIndex()): string {
	return E2E_TEMPLATE_DATABASE_URL.replace(/\/chatty_e2e$/u, `/chatty_e2e_w${worker}`);
}

/** Relative to apps/server, where the API server runs. Separate per worker so uploads never collide. */
export function e2eUploadDir(worker: number): string {
	return `.data/e2e-uploads/w${worker}`;
}

/** This worker's database: the one its API server reads and writes. */
export const E2E_DATABASE_URL = e2eDatabaseUrl();
