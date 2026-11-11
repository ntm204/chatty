import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { getErrorMessage } from "@/utils/get-error-message";

/**
 * Asks for a reset link.
 *
 * The confirmation deliberately does not say the mail was sent. The server
 * answers the same way for an address it has never seen, and a UI that said
 * "check your inbox" for one and "no such account" for the other would hand back
 * exactly the membership check the endpoint refuses to answer.
 */
export function ForgotPasswordForm() {
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSent, setIsSent] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!email.trim()) {
			setError("Email is required");

			return;
		}

		setIsSubmitting(true);
		setError("");
		try {
			await api.requestPasswordReset({ email: email.trim() });
			setIsSent(true);
		} catch (requestError) {
			// Reaches here for a rate limit or a network failure — never for an
			// unknown address, which the server treats as success.
			setError(getErrorMessage(requestError, "The reset link could not be sent. Try again."));
		} finally {
			setIsSubmitting(false);
		}
	}

	if (isSent) {
		return (
			<p className="text-[13px] leading-normal text-ink-soft">
				If an account exists for <span className="font-semibold text-ink">{email.trim()}</span>, a reset link is
				on its way. It is good for one hour.
			</p>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<TextField
				label="Email"
				type="email"
				autoComplete="email"
				value={email}
				error={error}
				onChange={(event) => setEmail(event.target.value)}
			/>

			<Button type="submit" disabled={isSubmitting}>
				{isSubmitting ? "Sending…" : "Send reset link"}
			</Button>
		</form>
	);
}
