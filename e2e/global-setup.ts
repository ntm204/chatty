import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "./database.js";

/**
 * Brings the e2e database up to date and empties it, once per run.
 *
 * Emptied here rather than between tests: these specs drive a real browser
 * against a real server, and each one registers the accounts it needs under a
 * unique handle, so they do not collide. Truncating between them would also
 * disconnect the sockets a test is in the middle of asserting on.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
	const adminUrl = new URL(E2E_DATABASE_URL);
	adminUrl.pathname = "/postgres";
	adminUrl.searchParams.set("connection_limit", "1");
	const admin = new PrismaClient({
		datasources: { db: { url: adminUrl.toString() } },
	});
	try {
		const existing = await admin.$queryRaw<{ exists: boolean }[]>`
			SELECT EXISTS (SELECT FROM pg_database WHERE datname = 'chatty_e2e') AS exists
		`;
		if (!existing[0]?.exists) await admin.$executeRawUnsafe('CREATE DATABASE "chatty_e2e"');
	} finally {
		await admin.$disconnect();
	}

	// All browser configs share these fixtures. Keep the claim alive through teardown,
	// including when a developer launches Chromium and WebKit from separate terminals.
	const prisma = new PrismaClient({ datasources: { db: { url: `${E2E_DATABASE_URL}?connection_limit=1` } } });
	try {
		const [claim] = await prisma.$queryRaw<{ locked: boolean }[]>`
			SELECT pg_try_advisory_lock(4070120250812::bigint) AS locked
		`;
		if (!claim?.locked)
			throw new Error("Another browser run is already using chatty_e2e. Stop it before starting another run.");
		execSync("npx prisma migrate deploy --schema apps/server/prisma/schema.prisma", {
			stdio: "inherit",
			timeout: 60_000,
			env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
		});
		await prisma.$executeRawUnsafe(
			`TRUNCATE TABLE "Attachment", "Message", "ConversationParticipant", "Conversation", "User" RESTART IDENTITY CASCADE;`,
		);
	} catch (error) {
		await prisma.$disconnect();
		throw error;
	}

	return () => prisma.$disconnect();
}
