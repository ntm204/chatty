import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Same password for everyone, so local sign-in needs nothing memorised. */
const SEED_PASSWORD = "SuperSecret123";

/**
 * Refuses to run against anything that is not a local database.
 *
 * This script deletes every row before inserting. Pointed at a real deployment
 * it would erase it, so the check is a hard stop rather than a warning.
 */
function assertLocalDatabase(): void {
	const databaseUrl = process.env.DATABASE_URL ?? "";

	if (!databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1")) {
		throw new Error(`Refusing to seed "${databaseUrl}" — seeding wipes all data and is for local use only.`);
	}
}

async function main(): Promise<void> {
	assertLocalDatabase();

	// Order matters only in the absence of cascades; TRUNCATE ... CASCADE handles
	// the foreign keys in one statement and survives new relations being added.
	await prisma.$executeRawUnsafe(
		`TRUNCATE TABLE "Message", "ConversationParticipant", "Conversation", "User" RESTART IDENTITY CASCADE;`,
	);

	const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

	const [minh, an, binh] = await Promise.all([
		prisma.user.create({
			data: { email: "minh@test.com", handle: "minh", displayName: "Minh", passwordHash },
			select: { id: true },
		}),
		prisma.user.create({
			data: { email: "an@test.com", handle: "an", displayName: "An", passwordHash },
			select: { id: true },
		}),
		prisma.user.create({
			data: { email: "binh@test.com", handle: "binh", displayName: "Binh", passwordHash },
			select: { id: true },
		}),
	]);

	// A direct conversation, with history, so the message list is not empty on
	// first sign-in.
	const direct = await prisma.conversation.create({
		data: {
			isGroup: false,
			participants: { create: [{ userId: minh.id }, { userId: an.id }] },
		},
		select: { id: true },
	});

	await prisma.message.create({
		data: { conversationId: direct.id, authorId: minh.id, content: "Chào An, khoẻ không?" },
	});
	await prisma.message.create({
		data: { conversationId: direct.id, authorId: an.id, content: "Khoẻ, cảm ơn Minh!" },
	});

	// A group, so the group-specific rendering has something to show.
	const group = await prisma.conversation.create({
		data: {
			isGroup: true,
			name: "Weekend football",
			participants: {
				create: [{ userId: minh.id, role: "ADMIN" }, { userId: an.id }, { userId: binh.id }],
			},
		},
		select: { id: true },
	});

	await prisma.message.create({
		data: { conversationId: group.id, authorId: binh.id, content: "Cuối tuần này đá không mọi người?" },
	});

	console.log("Seeded 3 users (password for all: %s):", SEED_PASSWORD);
	console.log("  minh@test.com, an@test.com, binh@test.com");
	console.log("Seeded 1 direct conversation and 1 group.");
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => void prisma.$disconnect());
