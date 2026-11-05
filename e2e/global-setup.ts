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
export default async function globalSetup(): Promise<void> {
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

	execSync("npx prisma migrate deploy --schema apps/server/prisma/schema.prisma", {
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
	});

	const prisma = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
	await prisma.$executeRawUnsafe(
		`TRUNCATE TABLE "Attachment", "Message", "ConversationParticipant", "Conversation", "User" RESTART IDENTITY CASCADE;`,
	);
	await prisma.$disconnect();
}
