import {
	NOTIFICATION_BROADCAST_CLAIM_DELAY_MS,
	NOTIFICATION_CLAIM_TTL_MS,
	NOTIFICATION_COORDINATION_CHANNEL_PREFIX,
	NOTIFICATION_RECEIPT_STORAGE_PREFIX,
	NOTIFICATION_RECEIPT_TTL_MS,
} from "../constants/notification-coordination";

interface NotificationReceipt {
	kind: "claim" | "shown";
	ownerId?: string;
	expiresAt: number;
}

interface NotificationCoordinationEvent {
	kind: "claim" | "shown";
	messageId: string;
	ownerId?: string;
	expiresAt: number;
}

interface LockClaimResult<Value> {
	state: "claimed" | "occupied" | "unavailable";
	value: Value | null;
}

/**
 * Coordinates desktop popups between tabs belonging to one account.
 *
 * A Web Lock makes the final notification creation atomic in browsers that
 * support it. A short-lived local receipt handles a socket event delivered
 * after that lock is released. Older browsers fall back to a storage lease,
 * then a BroadcastChannel election, and finally the existing single-tab
 * behaviour when neither browser primitive is usable.
 */
export interface NotificationTabCoordinator {
	runOnce<Value>(messageId: string, create: () => Value | null): Promise<Value | null>;
	dispose(): void;
}

function getTabId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();

	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function waitForBroadcastClaims(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, NOTIFICATION_BROADCAST_CLAIM_DELAY_MS));
}

function isCoordinationEvent(value: unknown): value is NotificationCoordinationEvent {
	if (!value || typeof value !== "object") return false;
	const event = value as Partial<NotificationCoordinationEvent>;

	return (
		(event.kind === "claim" || event.kind === "shown") &&
		typeof event.messageId === "string" &&
		typeof event.expiresAt === "number"
	);
}

function parseReceipt(value: string | null): NotificationReceipt | null {
	if (!value) return null;

	try {
		const receipt = JSON.parse(value) as Partial<NotificationReceipt>;
		if (
			(receipt.kind !== "claim" && receipt.kind !== "shown") ||
			typeof receipt.expiresAt !== "number" ||
			(receipt.ownerId !== undefined && typeof receipt.ownerId !== "string")
		) {
			return null;
		}

		return receipt as NotificationReceipt;
	} catch {
		return null;
	}
}

class BrowserNotificationTabCoordinator implements NotificationTabCoordinator {
	private readonly tabId = getTabId();
	private readonly shownMessageIds = new Map<string, number>();
	private readonly claimantsByMessageId = new Map<string, Set<string>>();
	private readonly channel: BroadcastChannel | null;

	constructor(private readonly userId: string) {
		this.channel = this.createChannel();
	}

	async runOnce<Value>(messageId: string, create: () => Value | null): Promise<Value | null> {
		if (this.hasShownReceipt(messageId)) return null;

		const lockResult = await this.runWithLock(messageId, create);
		if (lockResult.state !== "unavailable") return lockResult.value;

		const storageResult = await this.runWithStorageLease(messageId, create);
		if (storageResult.state !== "unavailable") return storageResult.value;

		if (this.channel) return this.runWithBroadcastElection(messageId, create);

		// A browser without Locks, storage or BroadcastChannel cannot coordinate
		// tabs safely. Keep the old per-tab behaviour rather than blocking every
		// notification just because an optional browser capability is missing.
		return create();
	}

	dispose(): void {
		this.channel?.close();
		this.shownMessageIds.clear();
		this.claimantsByMessageId.clear();
	}

	private createChannel(): BroadcastChannel | null {
		if (typeof BroadcastChannel === "undefined") return null;

		try {
			const channel = new BroadcastChannel(`${NOTIFICATION_COORDINATION_CHANNEL_PREFIX}${this.userId}`);
			channel.onmessage = (event: MessageEvent<unknown>) => this.handleChannelMessage(event.data);

			return channel;
		} catch {
			return null;
		}
	}

	private handleChannelMessage(value: unknown): void {
		if (!isCoordinationEvent(value) || value.expiresAt <= Date.now()) return;

		if (value.kind === "shown") {
			this.shownMessageIds.set(value.messageId, value.expiresAt);

			return;
		}

		if (!value.ownerId) return;
		const claimants = this.claimantsByMessageId.get(value.messageId) ?? new Set<string>();
		claimants.add(value.ownerId);
		this.claimantsByMessageId.set(value.messageId, claimants);
	}

	private async runWithLock<Value>(messageId: string, create: () => Value | null): Promise<LockClaimResult<Value>> {
		const lockManager = typeof navigator === "undefined" ? undefined : navigator.locks;
		if (!lockManager) return { state: "unavailable", value: null };

		try {
			return await lockManager.request(
				`${NOTIFICATION_COORDINATION_CHANNEL_PREFIX}${this.userId}:${messageId}`,
				{ ifAvailable: true },
				(lock) => {
					if (!lock || this.hasShownReceipt(messageId)) return { state: "occupied", value: null };

					const value = create();
					if (value !== null) this.recordShown(messageId);

					return { state: "claimed", value };
				},
			);
		} catch {
			// Web Locks can be unavailable even when the property exists, for
			// example in an insecure embedded browser. The fallback below remains
			// useful in exactly that case.
			return { state: "unavailable", value: null };
		}
	}

	private async runWithStorageLease<Value>(
		messageId: string,
		create: () => Value | null,
	): Promise<LockClaimResult<Value>> {
		const existingReceipt = this.readReceipt(messageId);
		if (existingReceipt) return { state: "occupied", value: null };

		const claim: NotificationReceipt = {
			kind: "claim",
			ownerId: this.tabId,
			expiresAt: Date.now() + NOTIFICATION_CLAIM_TTL_MS,
		};
		if (!this.writeReceipt(messageId, claim)) return { state: "unavailable", value: null };

		await waitForBroadcastClaims();
		const settledClaim = this.readReceipt(messageId);
		if (settledClaim?.kind !== "claim" || settledClaim.ownerId !== this.tabId) {
			return { state: "occupied", value: null };
		}

		const value = create();
		if (value !== null) this.recordShown(messageId);

		return { state: "claimed", value };
	}

	private async runWithBroadcastElection<Value>(
		messageId: string,
		create: () => Value | null,
	): Promise<Value | null> {
		if (this.hasShownReceipt(messageId)) return null;

		const claimants = this.claimantsByMessageId.get(messageId) ?? new Set<string>();
		claimants.add(this.tabId);
		this.claimantsByMessageId.set(messageId, claimants);
		this.post({
			kind: "claim",
			messageId,
			ownerId: this.tabId,
			expiresAt: Date.now() + NOTIFICATION_CLAIM_TTL_MS,
		});
		await waitForBroadcastClaims();

		if (this.hasShownReceipt(messageId)) return null;
		const firstClaimant = [...(this.claimantsByMessageId.get(messageId) ?? [])].sort()[0];
		if (firstClaimant !== this.tabId) return null;

		const value = create();
		if (value !== null) this.recordShown(messageId);

		return value;
	}

	private hasShownReceipt(messageId: string): boolean {
		const expiration = this.shownMessageIds.get(messageId);
		if (expiration && expiration > Date.now()) return true;
		if (expiration) this.shownMessageIds.delete(messageId);

		const receipt = this.readReceipt(messageId);

		return receipt?.kind === "shown";
	}

	private recordShown(messageId: string): void {
		const receipt: NotificationReceipt = {
			kind: "shown",
			expiresAt: Date.now() + NOTIFICATION_RECEIPT_TTL_MS,
		};
		this.shownMessageIds.set(messageId, receipt.expiresAt);
		this.writeReceipt(messageId, receipt);
		this.post({ kind: "shown", messageId, expiresAt: receipt.expiresAt });
	}

	private readReceipt(messageId: string): NotificationReceipt | null {
		try {
			const receipt = parseReceipt(localStorage.getItem(this.getReceiptKey(messageId)));
			if (!receipt) return null;
			if (receipt.expiresAt > Date.now()) return receipt;
			localStorage.removeItem(this.getReceiptKey(messageId));

			return null;
		} catch {
			return null;
		}
	}

	private writeReceipt(messageId: string, receipt: NotificationReceipt): boolean {
		try {
			localStorage.setItem(this.getReceiptKey(messageId), JSON.stringify(receipt));

			return true;
		} catch {
			return false;
		}
	}

	private getReceiptKey(messageId: string): string {
		return `${NOTIFICATION_RECEIPT_STORAGE_PREFIX}${this.userId}:${messageId}`;
	}

	private post(event: NotificationCoordinationEvent): void {
		try {
			this.channel?.postMessage(event);
		} catch {
			// Closing a tab can race with a channel post. The local receipt still
			// coordinates tabs that have storage, so this is intentionally silent.
		}
	}
}

export function createNotificationTabCoordinator(userId: string): NotificationTabCoordinator {
	return new BrowserNotificationTabCoordinator(userId);
}
