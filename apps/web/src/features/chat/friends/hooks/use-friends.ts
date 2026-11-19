import type { FriendDTO, FriendRequestsDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { useSocketEvent } from "../../hooks/use-socket-event";

interface Friends {
	friends: FriendDTO[] | null;
	requests: FriendRequestsDTO | null;
	refresh: () => void;
}

/** Your friends and requests, refetched whenever any relationship of yours changes. */
export function useFriends(): Friends {
	const [friends, setFriends] = useState<FriendDTO[] | null>(null);
	const [requests, setRequests] = useState<FriendRequestsDTO | null>(null);
	const requestRef = useRef(0);

	const refresh = useCallback(() => {
		const request = ++requestRef.current;
		void Promise.all([api.listFriends(), api.listFriendRequests()])
			.then(([nextFriends, nextRequests]) => {
				if (request !== requestRef.current) return;
				setFriends(nextFriends);
				setRequests(nextRequests);
			})
			.catch(() => undefined);
	}, []);

	useEffect(() => refresh(), [refresh]);
	useSocketEvent("relationship:changed", refresh);

	return { friends, requests, refresh };
}
