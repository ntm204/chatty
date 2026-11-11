/**
 * The signed-in account, its avatar, people search, blocks and restrictions.
 * Composed into the public `api` object in ./client.ts.
 */
import type {
	CurrentUserDTO,
	DeleteAccountRequest,
	UpdateProfileRequest,
	BlockStatusDTO,
	BlockedUsersPageDTO,
	RestrictedUsersPageDTO,
	RestrictionStatusDTO,
	UserDTO,
} from "@chatty/shared-types";
import { request, get, AVATAR_FIELD } from "./core";

export const usersApi = {
	getCurrentUser(): Promise<CurrentUserDTO> {
		return get<CurrentUserDTO>("/users/me");
	},

	/**
	 * Changes your own display name, handle, or both, and returns the refreshed
	 * profile. Send only what changed — the server rejects a body with neither.
	 */
	updateProfile(input: UpdateProfileRequest): Promise<CurrentUserDTO> {
		return request<CurrentUserDTO>("/users/me", { method: "PATCH", body: JSON.stringify(input) });
	},

	/**
	 * Deletes the signed-in account, permanently.
	 *
	 * The token this was sent with is dead on arrival of the response, so the
	 * caller has to clear it — `useAuth.deleteAccount` is what does that and drops
	 * the socket. Call that rather than this.
	 */
	deleteAccount(input: DeleteAccountRequest): Promise<void> {
		return request<void>("/users/me", { method: "DELETE", body: JSON.stringify(input) });
	},

	/**
	 * Replaces the signed-in user's avatar. Returns the refreshed profile, whose
	 * `avatarUrl` carries a new version — assigning that to the store is what
	 * makes the picture change on screen rather than staying cached.
	 */
	uploadAvatar(file: File): Promise<CurrentUserDTO> {
		const body = new FormData();
		body.append(AVATAR_FIELD, file);

		return request<CurrentUserDTO>("/users/me/avatar", { method: "POST", body });
	},

	deleteAvatar(): Promise<CurrentUserDTO> {
		return request<CurrentUserDTO>("/users/me/avatar", { method: "DELETE" });
	},

	searchUsers(query: string): Promise<UserDTO[]> {
		return get<UserDTO[]>(`/users?query=${encodeURIComponent(query)}`);
	},

	/** A bounded page, walked by the Blocked users panel in account settings. */
	listBlockedUsers(before?: string): Promise<BlockedUsersPageDTO> {
		return get<BlockedUsersPageDTO>(`/blocks${before ? `?before=${encodeURIComponent(before)}` : ""}`);
	},

	/** Only the caller's own decision — the reverse direction remains private. */
	getBlockStatus(userId: string): Promise<BlockStatusDTO> {
		return get<BlockStatusDTO>(`/blocks/${userId}/status`);
	},

	// PUT, so blocking somebody already blocked is the same request twice and
	// answers the same way — the client never has to know which it is sending.
	blockUser(userId: string): Promise<void> {
		return request<void>(`/blocks/${userId}`, { method: "PUT" });
	},

	unblockUser(userId: string): Promise<void> {
		return request<void>(`/blocks/${userId}`, { method: "DELETE" });
	},

	/** A bounded page, walked by the Restricted people panel in account settings. */
	listRestrictedUsers(before?: string): Promise<RestrictedUsersPageDTO> {
		return get<RestrictedUsersPageDTO>(`/restrictions${before ? `?before=${encodeURIComponent(before)}` : ""}`);
	},

	/** Only the caller's own decision — the reverse direction remains private. */
	getRestrictionStatus(userId: string): Promise<RestrictionStatusDTO> {
		return get<RestrictionStatusDTO>(`/restrictions/${userId}/status`);
	},

	// PUT, so restricting somebody already restricted is the same request twice
	// and answers the same way — the client never has to know which it is sending.
	restrictUser(userId: string): Promise<void> {
		return request<void>(`/restrictions/${userId}`, { method: "PUT" });
	},

	unrestrictUser(userId: string): Promise<void> {
		return request<void>(`/restrictions/${userId}`, { method: "DELETE" });
	},
};
