import { useCallback, useMemo, useSyncExternalStore } from "react";

interface MutationSnapshot {
	isSaving: boolean;
	error: string;
}

interface ConversationMutationCoordinator {
	conversationId: string;
	snapshot: MutationSnapshot;
	isPending: boolean;
	/** Invalidates a request when every surface has left this conversation. */
	epoch: number;
	listeners: Set<() => void>;
	cleanupTimer: ReturnType<typeof setTimeout> | undefined;
}

const coordinators = new Map<string, ConversationMutationCoordinator>();
const EMPTY_SNAPSHOT: MutationSnapshot = { isSaving: false, error: "" };

function getCoordinator(conversationId: string): ConversationMutationCoordinator {
	const existing = coordinators.get(conversationId);
	if (existing) return existing;

	const coordinator: ConversationMutationCoordinator = {
		conversationId,
		snapshot: EMPTY_SNAPSHOT,
		isPending: false,
		epoch: 0,
		listeners: new Set(),
		cleanupTimer: undefined,
	};
	coordinators.set(conversationId, coordinator);

	return coordinator;
}

function publish(coordinator: ConversationMutationCoordinator, snapshot: MutationSnapshot): void {
	coordinator.snapshot = snapshot;
	for (const listener of coordinator.listeners) listener();
}

function discardWhenUnused(coordinator: ConversationMutationCoordinator): void {
	clearTimeout(coordinator.cleanupTimer);
	coordinator.cleanupTimer = setTimeout(() => {
		if (coordinator.listeners.size === 0 && coordinators.get(coordinator.conversationId) === coordinator) {
			coordinators.delete(coordinator.conversationId);
		}
	}, 0);
}

function subscribe(coordinator: ConversationMutationCoordinator, listener: () => void): () => void {
	clearTimeout(coordinator.cleanupTimer);
	coordinator.cleanupTimer = undefined;
	coordinator.listeners.add(listener);

	return () => {
		coordinator.listeners.delete(listener);
		if (coordinator.listeners.size > 0) return;

		// A request from a conversation that nobody is looking at must not leak its
		// late completion into a later visit to the same id. Keep this coordinator
		// briefly for React's development-mode effect re-subscription, but reset its
		// lifecycle immediately.
		coordinator.epoch++;
		coordinator.isPending = false;
		coordinator.snapshot = EMPTY_SNAPSHOT;
		discardWhenUnused(coordinator);
	};
}

/**
 * Shares one mutation lifecycle between every visible control for a conversation.
 *
 * The sidebar and details panel can both offer mute/pin/archive controls. A local
 * `useState` lock lets those two buttons race each other; this coordinator makes
 * them observe the same pending state and the same recoverable error instead.
 */
export function useConversationMutation(conversationId: string) {
	const coordinator = useMemo(() => getCoordinator(conversationId), [conversationId]);
	const snapshot = useSyncExternalStore(
		useCallback((listener) => subscribe(coordinator, listener), [coordinator]),
		useCallback(() => coordinator.snapshot, [coordinator]),
	);

	const run = useCallback(
		async (action: () => Promise<unknown>): Promise<boolean> => {
			if (coordinator.isPending) return false;

			const epoch = coordinator.epoch;
			coordinator.isPending = true;
			publish(coordinator, { isSaving: true, error: "" });
			try {
				await action();
				if (coordinators.get(conversationId) !== coordinator || coordinator.epoch !== epoch) return false;
				publish(coordinator, EMPTY_SNAPSHOT);

				return true;
			} catch (caught) {
				if (coordinators.get(conversationId) === coordinator && coordinator.epoch === epoch) {
					publish(coordinator, {
						isSaving: false,
						error: caught instanceof Error ? caught.message : "Could not update conversation",
					});
				}

				return false;
			} finally {
				if (coordinators.get(conversationId) === coordinator && coordinator.epoch === epoch) {
					coordinator.isPending = false;
				}
			}
		},
		[conversationId, coordinator],
	);

	const clearError = useCallback(() => {
		if (!snapshot.error) return;
		publish(coordinator, { isSaving: snapshot.isSaving, error: "" });
	}, [coordinator, snapshot.error, snapshot.isSaving]);

	return { ...snapshot, clearError, run };
}
