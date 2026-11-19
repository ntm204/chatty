/**
 * Friends and follows (ADR 0027). Every change answers with the relationship
 * as it now stands. Composed into the public `api` object in ./client.ts.
 */
import type { FriendDTO, FriendRequestsDTO, RelationshipDTO } from "@chatty/shared-types";
import { get, request } from "./core";

function act(path: string, method: "PUT" | "POST" | "DELETE"): Promise<RelationshipDTO> {
	return request<RelationshipDTO>(path, { method });
}

export const friendsApi = {
	listFriends(): Promise<FriendDTO[]> {
		return get<FriendDTO[]>("/friends");
	},

	listFriendRequests(): Promise<FriendRequestsDTO> {
		return get<FriendRequestsDTO>("/friends/requests");
	},

	getRelationship(userId: string): Promise<RelationshipDTO> {
		return get<RelationshipDTO>(`/friends/${userId}`);
	},

	sendFriendRequest(userId: string): Promise<RelationshipDTO> {
		return act(`/friends/${userId}/request`, "PUT");
	},

	cancelFriendRequest(userId: string): Promise<RelationshipDTO> {
		return act(`/friends/${userId}/request`, "DELETE");
	},

	acceptFriendRequest(userId: string): Promise<RelationshipDTO> {
		return act(`/friends/${userId}/accept`, "POST");
	},

	declineFriendRequest(userId: string): Promise<RelationshipDTO> {
		return act(`/friends/${userId}/decline`, "POST");
	},

	unfriend(userId: string): Promise<RelationshipDTO> {
		return act(`/friends/${userId}`, "DELETE");
	},

	follow(userId: string): Promise<RelationshipDTO> {
		return act(`/friends/${userId}/follow`, "PUT");
	},

	unfollow(userId: string): Promise<RelationshipDTO> {
		return act(`/friends/${userId}/follow`, "DELETE");
	},
};
