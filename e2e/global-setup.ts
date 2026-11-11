import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { E2E_TEMPLATE_DATABASE_URL, E2E_WORKERS, e2eDatabaseUrl } from "./database.js";

function migrate(databaseUrl: string): void {
	execSync("npx prisma migrate deploy --schema apps/server/prisma/schema.prisma", {
		stdio: "inherit",
		timeout: 60_000,
		env: { ...process.env, DATABASE_URL: databaseUrl },
	});
}

/**
 * Brings every worker's database up to date and empties it, once per run.
 *
 * Emptied here rather than between tests: these specs drive a real browser
 * against a real server, and each one registers the accounts it needs under a
 * unique handle, so they do not collide. Truncating between them would also
 * disconnect the sockets a test is in the middle of asserting on.
 *
 * A missing worker database is cloned from the migrated `chatty_e2e` template
 * (`CREATE DATABASE ... TEMPLATE`, as the server unit tests do). An existing one
 * is migrated and truncated instead of dropped and re-cloned, unlike the unit
 * tests: Playwright starts `webServer` *before* this runs, so each API server is
 * already connected to its database, and dropping it would mean killing those
 * connections under a running server.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
	// The run lock and the cloning live on the maintenance database: PostgreSQL
	// refuses to clone `chatty_e2e` while anyone, this lock included, is connected
	// to it. One connection, because an advisory lock belongs to a session.
	const adminUrl = new URL(E2E_TEMPLATE_DATABASE_URL);
	adminUrl.pathname = "/postgres";
	adminUrl.searchParams.set("connection_limit", "1");
	const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });

	try {
		// All browser configs share these fixtures. Keep the claim alive through teardown,
		// including when a developer launches Chromium and WebKit from separate terminals.
		const [claim] = await admin.$queryRaw<{ locked: boolean }[]>`
			SELECT pg_try_advisory_lock(4070120250812::bigint) AS locked
		`;
		if (!claim?.locked)
			throw new Error("Another browser run is already using chatty_e2e. Stop it before starting another run.");

		const databaseExists = async (name: string): Promise<boolean> => {
			const [row] = await admin.$queryRaw<{ exists: boolean }[]>`
				SELECT EXISTS (SELECT FROM pg_database WHERE datname = ${name}) AS exists
			`;

			return row?.exists ?? false;
		};

		if (!(await databaseExists("chatty_e2e"))) await admin.$executeRawUnsafe('CREATE DATABASE "chatty_e2e"');
		migrate(E2E_TEMPLATE_DATABASE_URL);

		for (let worker = 0; worker < E2E_WORKERS; worker += 1) {
			const databaseUrl = e2eDatabaseUrl(worker);
			const name = new URL(databaseUrl).pathname.slice(1);
			if (!(await databaseExists(name))) {
				await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "chatty_e2e"`);
				continue;
			}

			migrate(databaseUrl);
			const workerDatabase = new PrismaClient({
				datasources: { db: { url: `${databaseUrl}?connection_limit=1` } },
			});
			try {
				await workerDatabase.$executeRawUnsafe(
					`TRUNCATE TABLE "Attachment", "Message", "ConversationParticipant", "Conversation", "User" RESTART IDENTITY CASCADE;`,
				);
			} finally {
				await workerDatabase.$disconnect();
			}
		}
	} catch (error) {
		await admin.$disconnect();
		throw error;
	}

	return () => admin.$disconnect();
}
