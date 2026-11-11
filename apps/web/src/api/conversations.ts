/**
 * Conversation list, per-conversation settings, membership and the details-panel vault.
 * Composed into the public `api` object in ./client.ts.
 */
import type {
	AddParticipantRequest,
	AttachmentKind,
	AttachmentPageDTO,
	ConversationDTO,
	ConversationPageDTO,
	ConversationSelfUpdatedEvent,
	ConversationReadEvent,
	ConversationTheme,
	MarkReadRequest,
	MessageLinkPageDTO,
	RenameConversationRequest,
	SetGroupInvitePolicyRequest,
	SetParticipantRoleRequest,
	SetThemeRequest,
	ConversationVaultSummaryDTO,
} from "@chatty/shared-types";
import { request, get, post, AVATAR_FIELD } from "./core";

export const conversationsApi = {
	/**
	 * A page of the sidebar. Pinned rows are capped server-side and all arrive on
	 * the first page, so `before` is always the id of the last *unpinned* row.
	 */
	listConversations(isArchived = false, before?: string): Promise<ConversationPageDTO> {
		const params = new URLSearchParams();
		if (isArchived) params.set("archived", "true");
		if (before) params.set("before", before);
		const query = params.toString();

		return get<ConversationPageDTO>(`/conversations${query ? `?${query}` : ""}`);
	},

	searchConversations(query: string, before?: string): Promise<ConversationPageDTO> {
		const params = new URLSearchParams({ q: query });
		if (before) params.set("before", before);

		return get<ConversationPageDTO>(`/conversations/search?${params.toString()}`);
	},

	/** One row, for a conversation that got activity before the sidebar paged to it. */
	getConversation(conversationId: string): Promise<ConversationDTO> {
		return get<ConversationDTO>(`/conversations/${conversationId}`);
	},

	setConversationArchived(conversationId: string, archived: boolean): Promise<ConversationSelfUpdatedEvent> {
		return request<ConversationSelfUpdatedEvent>(`/conversations/${conversationId}/archive`, {
			method: "PUT",
			body: JSON.stringify({ archived }),
		});
	},

	setConversationPinned(conversationId: string, pinned: boolean): Promise<ConversationSelfUpdatedEvent> {
		return request<ConversationSelfUpdatedEvent>(`/conversations/${conversationId}/pin`, {
			method: "PUT",
			body: JSON.stringify({ pinned }),
		});
	},

	setConversationMuted(conversationId: string, until: string | null): Promise<ConversationSelfUpdatedEvent> {
		return request<ConversationSelfUpdatedEvent>(`/conversations/${conversationId}/mute`, {
			method: "PUT",
			body: JSON.stringify({ until }),
		});
	},

	/** Shared with everyone in the conversation, not just the caller — see ADR 0022. */
	setConversationNickname(conversationId: string, userId: string, nickname: string | null): Promise<ConversationDTO> {
		return request<ConversationDTO>(`/conversations/${conversationId}/members/${userId}/nickname`, {
			method: "PUT",
			body: JSON.stringify({ nickname }),
		});
	},

	setConversationTheme(conversationId: string, theme: ConversationTheme | null): Promise<ConversationDTO> {
		const body: SetThemeRequest = { theme };

		return request<ConversationDTO>(`/conversations/${conversationId}/theme`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	/** Group-only; admin-gated. Returns the refreshed conversation, whose `avatarUrl` carries a new version. */
	uploadConversationAvatar(conversationId: string, file: File): Promise<ConversationDTO> {
		const body = new FormData();
		body.append(AVATAR_FIELD, file);

		return request<ConversationDTO>(`/conversations/${conversationId}/avatar`, { method: "POST", body });
	},

	deleteConversationAvatar(conversationId: string): Promise<ConversationDTO> {
		return request<ConversationDTO>(`/conversations/${conversationId}/avatar`, { method: "DELETE" });
	},

	createConversation(participantIds: string[], name?: string): Promise<ConversationDTO> {
		return post<ConversationDTO>("/conversations", name ? { participantIds, name } : { participantIds });
	},

	/**
	 * Moves the read marker to `messageId`.
	 *
	 * The response says where the marker actually ended up, which is not always
	 * where it was asked to go — the server refuses to move one backwards.
	 */
	markConversationRead(conversationId: string, messageId: string): Promise<ConversationReadEvent> {
		const body: MarkReadRequest = { messageId };

		return post<ConversationReadEvent>(`/conversations/${conversationId}/read`, body);
	},

	/**
	 * Adds someone to a group. Returns the conversation as seen by the caller —
	 * everyone else, including the new member, learns about it from the
	 * `conversation:new` / `conversation:updated` socket events instead.
	 */
	addParticipant(conversationId: string, userId: string): Promise<ConversationDTO> {
		const body: AddParticipantRequest = { userId };

		return post<ConversationDTO>(`/conversations/${conversationId}/members`, body);
	},

	/**
	 * Removes someone from a group, or — pass your own id — leaves it. No
	 * return value: the server answers 204 and the UI updates from
	 * `conversation:updated` / `conversation:left` once the socket event lands,
	 * the same write-over-HTTP-render-over-socket split used everywhere else.
	 */
	removeParticipant(conversationId: string, userId: string): Promise<void> {
		return request<void>(`/conversations/${conversationId}/members/${userId}`, { method: "DELETE" });
	},

	setParticipantRole(
		conversationId: string,
		userId: string,
		role: SetParticipantRoleRequest["role"],
	): Promise<ConversationDTO> {
		const body: SetParticipantRoleRequest = { role };

		return request<ConversationDTO>(`/conversations/${conversationId}/members/${userId}/role`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	setGroupInvitePolicy(
		conversationId: string,
		invitePolicy: SetGroupInvitePolicyRequest["invitePolicy"],
	): Promise<ConversationDTO> {
		const body: SetGroupInvitePolicyRequest = { invitePolicy };

		return request<ConversationDTO>(`/conversations/${conversationId}/invite-policy`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	renameConversation(conversationId: string, name: string): Promise<ConversationDTO> {
		const body: RenameConversationRequest = { name };

		return request<ConversationDTO>(`/conversations/${conversationId}`, {
			method: "PATCH",
			body: JSON.stringify(body),
		});
	},

	listConversationMedia(
		conversationId: string,
		kind: AttachmentKind,
		limit = 40,
		before?: string,
	): Promise<AttachmentPageDTO> {
		const params = new URLSearchParams({ kind, limit: String(limit) });
		if (before) params.set("before", before);

		return get<AttachmentPageDTO>(`/conversations/${conversationId}/media?${params.toString()}`);
	},

	listConversationLinks(conversationId: string, limit = 40, before?: string): Promise<MessageLinkPageDTO> {
		const params = new URLSearchParams({ limit: String(limit) });
		if (before) params.set("before", before);

		return get<MessageLinkPageDTO>(`/conversations/${conversationId}/links?${params.toString()}`);
	},

	/** What each category in the details panel holds, before any of them is opened. */
	getConversationVaultSummary(conversationId: string): Promise<ConversationVaultSummaryDTO> {
		return get<ConversationVaultSummaryDTO>(`/conversations/${conversationId}/vault-summary`);
	},
};
