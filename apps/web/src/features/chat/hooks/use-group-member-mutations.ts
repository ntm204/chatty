import { useEffect, useRef, useState } from "react";

type MemberMutation = "remove" | "role" | "leave";

/** Serialize writes per person without letting a late completion affect a different group. */
export function useGroupMemberMutations(conversationId: string) {
	const [pending, setPending] = useState<Record<string, MemberMutation>>({});
	const [error, setError] = useState("");
	const scopeRef = useRef({ conversationId, requests: new Set<string>() });
	if (scopeRef.current.conversationId !== conversationId) scopeRef.current = { conversationId, requests: new Set() };
	useEffect(() => {
		setPending({});
		setError("");
		const scope = scopeRef.current;

		return () => {
			if (scopeRef.current === scope) scopeRef.current = { conversationId, requests: new Set() };
		};
	}, [conversationId]);

	async function run(userId: string, kind: MemberMutation, action: () => Promise<unknown>) {
		const scope = scopeRef.current;
		if (scope.requests.has(userId)) return false;
		scope.requests.add(userId);
		setPending((current) => ({ ...current, [userId]: kind }));
		setError("");
		try {
			await action();

			return scopeRef.current === scope;
		} catch (caught) {
			if (scopeRef.current === scope)
				setError(caught instanceof Error ? caught.message : "Could not update this member. Try again.");

			return false;
		} finally {
			scope.requests.delete(userId);
			if (scopeRef.current === scope)
				setPending((current) => {
					const next = { ...current };
					delete next[userId];

					return next;
				});
		}
	}

	return { pending, error, setError, run, isPending: (userId: string) => scopeRef.current.requests.has(userId) };
}
