import { afterAll, beforeEach } from "vitest";
import { workerDatabaseUrl } from "./test-database-url.js";

/**
 * Guard rail. `beforeEach` below wipes every table, so pointing this suite at
 * the dev database would silently destroy local data. Refusing to start is the
 * only acceptable behaviour if the name looks wrong.
 */
// Each worker has its own clone of chatty_test (see global-setup), so test
// files can run side by side. Set before anything imports the Prisma client,
// which reads DATABASE_URL once when it is created.
const workerId = process.env.VITEST_POOL_ID ?? "1";
process.env.DATABASE_URL = workerDatabaseUrl(workerId);
// Files too: attachment and avatar tests write and delete uploads, and two
// workers sharing one directory would remove each other's files.
process.env.UPLOAD_DIR = `.data/test-uploads/w${workerId}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl.endsWith("_test")) {
	throw new Error(`Refusing to run tests against "${databaseUrl}" — the database name must end in "_test".`);
}

const { prisma } = await import("../src/lib/prisma.js");

/**
 * Each test starts from an empty database, so tests cannot depend on the order
 * they run in or on leftovers from a previous one.
 *
 * TRUNCATE ... CASCADE in a single statement handles the foreign keys between
 * these tables; deleting them one by one would need the exact reverse-dependency
 * order and break every time the schema grows a relation.
 *
 * **Keep tests fast, or this hook turns into a trap.** Vitest abandons a test
 * that exceeds `testTimeout` (5s by default) but cannot stop its promise chain,
 * so the abandoned test keeps querying while this TRUNCATE runs for the *next*
 * one. The symptoms look nothing like a timeout: "user does not exist" and
 * "email already registered", scattered across files that had nothing to do with
 * the slow one. It has happened once already — a fixture calling `register()`
 * (bcrypt at cost 12, ~300ms) four times per test was enough. Create rows
 * directly with `prisma` unless a test is actually about authentication.
 */
beforeEach(async () => {
	// `OutboxMessage` is listed explicitly because CASCADE cannot reach it: it has
	// no foreign key to anything here on purpose — a queued mail outlives the row
	// that caused it, and a user deleted mid-flight must not silently cancel the
	// message already promised to their address.
	await prisma.$executeRawUnsafe(
		`TRUNCATE TABLE "OutboxMessage", "Message", "ConversationParticipant", "Conversation", "User" RESTART IDENTITY CASCADE;`,
	);
});

afterAll(async () => {
	await prisma.$disconnect();
});
