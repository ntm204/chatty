import type { LucideIcon } from "lucide-react";
import { FileText, Image, Link2, Mic, Users } from "lucide-react";

export type VaultTab = "media" | "files" | "voice" | "links" | "members";

export const VAULT_TABS: { id: VaultTab; label: string }[] = [
	{ id: "media", label: "Media" },
	{ id: "files", label: "Files" },
	{ id: "voice", label: "Voice" },
	{ id: "links", label: "Links" },
	{ id: "members", label: "Members" },
];

/** The four content categories, without the standalone "Members" row — the tab row shown once one is open. */
export const VAULT_CATEGORY_TABS = VAULT_TABS.filter(
	(tab): tab is { id: Exclude<VaultTab, "members">; label: string } => tab.id !== "members",
);

export const EMPTY_VAULT_TAB_COPY: Record<Exclude<VaultTab, "members">, string> = {
	media: "Photos shared in this conversation will appear here.",
	files: "Files shared in this conversation will appear here.",
	voice: "Voice messages shared in this conversation will appear here.",
	links: "Links shared in this conversation will appear here.",
};

/**
 * The glyph for each category, in its row and in its empty state.
 *
 * An empty panel used to be one grey line stranded in the top-left corner of a
 * 700px column, which reads as a page that failed to load rather than as a
 * conversation nobody has shared a file in yet. A centred mark plus the sentence
 * is the shape every messenger uses for "there is nothing here *yet*".
 *
 * `members` is on this map — the category list draws it — but not on the copy
 * above, because a conversation always has participants and so that category has
 * no empty state to write.
 */
export const VAULT_TAB_ICONS: Record<VaultTab, LucideIcon> = {
	media: Image,
	files: FileText,
	voice: Mic,
	links: Link2,
	members: Users,
};

/**
 * The month heading every vault list shares.
 *
 * Sticky, so the month a reader is looking at stays named while they scroll past
 * a hundred rows of it — that is the whole point of the heading, and a heading
 * that scrolls away has stopped doing its job exactly when the list is long
 * enough to need it. The negative margin cancels the scroll container's padding
 * so the opaque strip reaches both edges; without it, rows slide up through the
 * 16px gutters beside the label.
 */
export const MONTH_HEADING_CLASS = "eyebrow sticky top-0 z-10 -mx-4 mb-2 bg-paper-raised px-4 py-2 text-ink-faint";
