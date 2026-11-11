import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { TEST_DATABASE_URL, TEST_WORKERS, workerDatabaseUrl } from "./test-database-url.js";

/**
 * Identifies this suite's claim on the test database.
 *
 * Any constant works — PostgreSQL advisory locks are a bare 64-bit number with
 * no namespace — so the only thing that matters is that every copy of this file
 * picks the same one. Derived from nothing in particular and written out in full
 * rather than computed, so it is greppable if it ever shows up in
 * `pg_locks`.
 */
const TEST_RUN_LOCK_KEY = 4_070_120_250_811n;

/**
 * Creates the disposable test database on a fresh local Postgres container.
 *
 * Prisma cannot connect far enough to run migrations when the database itself
 * does not exist, and `docker compose up` intentionally creates only the dev
 * database. Connecting to Postgres' maintenance database closes that bootstrap
 * gap without adding a manual step to every contributor's first test run.
 */
async function ensureTestDatabase(): Promise<void> {
	const adminUrl = new URL(TEST_DATABASE_URL);
	adminUrl.pathname = "/postgres";
	adminUrl.searchParams.set("connection_limit", "1");
	const adminClient = new PrismaClient({
		datasources: {
			db: { url: adminUrl.toString() },
		},
	});

	try {
		const existing = await adminClient.$queryRaw<{ exists: boolean }[]>`
			SELECT EXISTS (SELECT FROM pg_database WHERE datname = 'chatty_test') AS exists
		`;

		if (!existing[0]?.exists) {
			await adminClient.$executeRawUnsafe('CREATE DATABASE "chatty_test"');
		}
	} finally {
		await adminClient.$disconnect();
	}
}

/**
 * Held for the whole run, and released by the connection dying if nothing else.
 *
 * Its own client with `connection_limit=1`, which is the part that makes this
 * work: `pg_advisory_lock` is scoped to a *session*, and a pooled client would
 * be free to take the lock on one connection and run the unlock on another.
 */
/**
 * The run lock lives on the maintenance database, not on `chatty_test`: a
 * database cannot be cloned while anyone is connected to it, and the lock's
 * connection stays open for the whole run.
 */
function createAdminClient(): PrismaClient {
	const adminUrl = new URL(TEST_DATABASE_URL);
	adminUrl.pathname = "/postgres";
	adminUrl.searchParams.set("connection_limit", "1");

	return new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
}

/**
 * One fresh database per worker, cloned from the migrated `chatty_test`.
 * Cloning copies the schema in well under a second each, where migrating every
 * worker's database would cost seconds apiece.
 */
async function cloneWorkerDatabases(admin: PrismaClient): Promise<void> {
	for (let worker = 1; worker <= TEST_WORKERS; worker += 1) {
		const name = new URL(workerDatabaseUrl(worker)).pathname.slice(1);
		await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
		await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "chatty_test"`);
	}
}

/**
 * Runs once before the whole suite: claims the test database, then brings its
 * schema up to date with prisma/migrations.
 *
 * **The claim comes first, and it is not politeness.** `tests/setup.ts`
 * truncates every table before every test, so a second run — another terminal, a
 * watch mode left open, a CI job and a developer at the same moment — deletes
 * the first run's fixtures mid-test. It does not surface as anything resembling
 * a collision: it is "user does not exist" and "email already registered"
 * scattered across files that have nothing to do with each other, which reads as
 * a broken suite rather than a busy database. That cost real time before this
 * existed, and it is the first thing an outside contributor would hit.
 *
 * A session-scoped advisory lock rather than a row or a file, because it is
 * released when the connection ends — including when this process is killed with
 * `ctrl-c` or dies. A lock that has to be cleaned up is a lock that eventually
 * strands the database in "busy" with nobody holding it.
 *
 * DATABASE_URL is passed to the migration explicitly rather than inherited.
 * globalSetup runs outside the test environment, so vitest's `test.env` does not
 * reach it — and without this, the Prisma CLI falls back to .env and migrates
 * the DEV database.
 *
 * `migrate deploy` (not `migrate dev`) only applies existing migrations and
 * never prompts or generates new ones, which is what a non-interactive run needs.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
	await ensureTestDatabase();
	const lockClient = createAdminClient();
	const [claim] = await lockClient.$queryRaw<{ locked: boolean }[]>`
		SELECT pg_try_advisory_lock(${TEST_RUN_LOCK_KEY}) AS locked
	`;

	if (!claim?.locked) {
		await lockClient.$disconnect();
		throw new Error(
			"Another test run is already using chatty_test. Two runs share one database and " +
				"truncate each other's fixtures mid-test, so this one is refusing to start. " +
				"Stop the other run — a second terminal, or a `vitest` watch left open — and try again.",
		);
	}

	execSync("npx prisma migrate deploy", {
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
	});
	await cloneWorkerDatabases(lockClient);

	return async () => {
		// Explicit, though disconnecting would do it: the unlock says what is
		// happening, and it keeps the pairing visible to whoever reads this next.
		await lockClient.$queryRaw`SELECT pg_advisory_unlock(${TEST_RUN_LOCK_KEY})`;
		await lockClient.$disconnect();
	};
}
