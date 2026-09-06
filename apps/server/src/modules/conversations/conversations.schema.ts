import { z } from "zod";
import { SINGLE_RGI_EMOJI } from "../messages/messages.schema.js";

export const createConversationSchema = z.object({
	// IDs of the other participant(s). A 1-1 chat has exactly one entry here;
	// a group chat has more than one, and the caller is added automatically.
	participantIds: z.array(z.string()).min(1),
	name: z.string().min(1).max(100).optional(), // required in practice once participantIds.length > 1
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const markReadSchema = z.object({
	// The newest message the caller has actually seen. A timestamp would be the
	// client's clock, which is not something the server should let decide what
	// counts as read.
	messageId: z.string().min(1),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;

export const addParticipantSchema = z.object({
	userId: z.string().min(1),
});
export type AddParticipantInput = z.infer<typeof addParticipantSchema>;

export const renameConversationSchema = z.object({
	// Same bound as `createConversationSchema.name` — one group naming rule,
	// not two that could quietly drift apart.
	name: z.string().min(1).max(100),
});
export type RenameConversationInput = z.infer<typeof renameConversationSchema>;

export const setParticipantRoleSchema = z.object({
	role: z.enum(["admin", "member"]),
});
export type SetParticipantRoleInput = z.infer<typeof setParticipantRoleSchema>;

export const setInvitePolicySchema = z.object({
	invitePolicy: z.enum(["everyone", "managers"]),
});
export type SetInvitePolicyInput = z.infer<typeof setInvitePolicySchema>;

export const listConversationsQuerySchema = z.object({
	archived: z
		.enum(["true", "false"])
		.optional()
		.transform((value) => value === "true"),
	limit: z.coerce.number().int().min(1).max(100).optional(),
	// The id of the last *unpinned* row already held. Pinned rows are capped and
	// always sent whole, so a cursor never points at one — see the service.
	before: z.string().min(1).max(64).optional(),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const archiveConversationSchema = z.object({ archived: z.boolean() });
export type ArchiveConversationInput = z.infer<typeof archiveConversationSchema>;

export const pinConversationSchema = z.object({ pinned: z.boolean() });
export type PinConversationInput = z.infer<typeof pinConversationSchema>;

export const muteConversationSchema = z.object({ until: z.string().datetime().nullable() });
export type MuteConversationInput = z.infer<typeof muteConversationSchema>;

export const setNicknameSchema = z.object({ nickname: z.string().trim().min(1).max(50).nullable() });
export type SetNicknameInput = z.infer<typeof setNicknameSchema>;

export const setThemeSchema = z.object({
	theme: z.enum(["azure", "amber", "moss", "plum", "clay", "teal", "iris", "fern"]).nullable(),
});
export type SetThemeInput = z.infer<typeof setThemeSchema>;

export const setQuickReactionSchema = z.object({
	// Same fully-qualified-emoji rule as toggling a reaction — see messages.schema's SINGLE_RGI_EMOJI.
	// Null restores the app-wide default (DEFAULT_REACTION on the web side).
	emoji: z.string().max(64).regex(SINGLE_RGI_EMOJI, "Must be a single emoji").nullable(),
});
export type SetQuickReactionInput = z.infer<typeof setQuickReactionSchema>;
