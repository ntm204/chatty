import { useState } from "react";

interface ProtectedSendOptions {
	/** Your own Saved chat has nobody to protect anything from. */
	hasRecipients: boolean;
	/** A file sends on pick and cannot be protected. */
	hasFile: boolean;
	hasSomethingToSend: boolean;
}

/**
 * Whether the next send is a protected message. Per message, never sticky: the
 * composer resets it after each send, so an ordinary message never goes out
 * protected because of an earlier choice.
 */
export function useProtectedSend({ hasRecipients, hasFile, hasSomethingToSend }: ProtectedSendOptions) {
	const [isRequested, setIsRequested] = useState(false);
	const canProtect = hasRecipients && !hasFile;

	return {
		/** True only when it can actually apply to what is in the composer. */
		isProtected: isRequested && canProtect && hasSomethingToSend,
		/** Whether the user has asked — kept with the draft even while the field is empty. */
		isRequested,
		canProtect,
		setIsRequested,
		toggle: () => setIsRequested((current) => !current),
	};
}
