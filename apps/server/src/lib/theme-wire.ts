import type { ConversationTheme } from "@chatty/shared-types";
import type { ConversationTheme as DbConversationTheme } from "@prisma/client";

/**
 * The palette's two spellings: uppercase in the database, lowercase on the wire.
 * One place for both directions, shared by conversation themes and story
 * backgrounds, so a colour cannot be renamed on one side only.
 */
const toWire: Record<DbConversationTheme, ConversationTheme> = {
	AZURE: "azure",
	AMBER: "amber",
	MOSS: "moss",
	PLUM: "plum",
	CLAY: "clay",
	TEAL: "teal",
	IRIS: "iris",
	FERN: "fern",
};

const fromWire = Object.fromEntries(Object.entries(toWire).map(([db, wire]) => [wire, db])) as Record<
	ConversationTheme,
	DbConversationTheme
>;

export function themeToWire(theme: DbConversationTheme): ConversationTheme {
	return toWire[theme];
}

export function themeFromWire(theme: ConversationTheme): DbConversationTheme {
	return fromWire[theme];
}
