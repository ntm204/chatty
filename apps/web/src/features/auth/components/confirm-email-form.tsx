import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { getErrorMessage } from "@/utils/get-error-message";

interface ConfirmEmailFormProps {
	token: string;
}

/**
 * Redeems an email-change link, on arrival.
 *
 * A form with no fields and no button, because there is nothing left to ask: the
 * person got here by opening a link in the mailbox being confirmed, which is the
 * entire proof the server wants. Every other link in this app lands on something
 * to fill in — a new password — and this one would only be a button labelled
 * "yes, the thing you already clicked".
 *
 * The ref guard is load-bearing rather than tidy. StrictMode runs every effect
 * twice in development, and a cleanup flag is not enough here: it suppresses the
 * first run's *state update*, not its *request*. Both would be sent, the second
 * would find the token already spent, and the screen would report failure for a
 * change that had in fact worked. A ref survives StrictMode's simulated remount,
 * so the request happens once.
 */
export function ConfirmEmailForm({ token }: ConfirmEmailFormProps) {
	const [status, setStatus] = useState<"confirming" | "confirmed" | "failed">("confirming");
	const [error, setError] = useState("");
	const hasSentRef = useRef(false);

	useEffect(() => {
		if (hasSentRef.current) return;
		hasSentRef.current = true;

		void api
			.confirmEmailChange({ token })
			.then(() => setStatus("confirmed"))
			.catch((confirmError: unknown) => {
				setError(getErrorMessage(confirmError, "Your email could not be confirmed. Try again."));
				setStatus("failed");
			});
	}, [token]);

	if (status === "confirming") return <p className="text-[13px] text-ink-faint">Confirming…</p>;

	if (status === "failed") {
		return (
			<p role="alert" className="text-[13px] text-signal">
				{error}
			</p>
		);
	}

	return (
		<p className="text-[13px] text-live">
			Your email address has been updated. Sign in with it from now on — your password has not changed.
		</p>
	);
}
