import type { RelationshipDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { getErrorMessage } from "@/utils/get-error-message";
import { useSocketEvent } from "../../hooks/use-socket-event";

interface Relationship {
	/** Null until loaded. */
	relationship: RelationshipDTO | null;
	isBusy: boolean;
	error: string;
	/** Runs one change; the reply is the new relationship, so the buttons redraw from it. */
	run: (action: (userId: string) => Promise<RelationshipDTO>) => Promise<void>;
}

/**
 * Where you stand with one person, kept current: refetched when the server
 * says it changed — from another tab, or because they answered your request.
 */
export function useRelationship(userId: string): Relationship {
	const [relationship, setRelationship] = useState<RelationshipDTO | null>(null);
	const [isBusy, setIsBusy] = useState(false);
	const [error, setError] = useState("");
	const requestRef = useRef(0);

	const load = useCallback(async () => {
		const request = ++requestRef.current;
		try {
			const next = await api.getRelationship(userId);
			if (request === requestRef.current) setRelationship(next);
		} catch {
			// The buttons are optional; a failed refresh keeps the last good state.
		}
	}, [userId]);

	useEffect(() => {
		setRelationship(null);
		void load();
	}, [load]);

	useSocketEvent("relationship:changed", (event) => {
		if (event.userId === userId) void load();
	});

	const run = useCallback(
		async (action: (id: string) => Promise<RelationshipDTO>) => {
			setIsBusy(true);
			setError("");
			try {
				// Counted as a request too, so a refetch already in flight cannot overwrite the answer.
				++requestRef.current;
				setRelationship(await action(userId));
			} catch (actionError) {
				setError(getErrorMessage(actionError, "That did not work. Try again."));
			} finally {
				setIsBusy(false);
			}
		},
		[userId],
	);

	return { relationship, isBusy, error, run };
}
