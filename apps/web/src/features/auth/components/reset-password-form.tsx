import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { MIN_PASSWORD_LENGTH } from "@/constants/validation";
import { getErrorMessage } from "@/utils/get-error-message";

interface ResetPasswordFormProps {
	/** Straight from the emailed link's query string. Only the server can judge it. */
	token: string;
}

/**
 * Sets a new password from a reset link.
 *
 * No token is handed back on success and none is stored: reading the mailbox
 * proved the address, which is not the same as having signed in. They sign in
 * with the new password like anyone else.
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
	const [fields, setFields] = useState({ newPassword: "", confirmPassword: "" });
	const [errors, setErrors] = useState({ newPassword: "", confirmPassword: "", form: "" });
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDone, setIsDone] = useState(false);

	function validate() {
		const nextErrors = { newPassword: "", confirmPassword: "", form: "" };

		if (fields.newPassword.length < MIN_PASSWORD_LENGTH) {
			nextErrors.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
		}

		if (fields.confirmPassword !== fields.newPassword) {
			nextErrors.confirmPassword = "Passwords do not match";
		}

		setErrors(nextErrors);

		return !nextErrors.newPassword && !nextErrors.confirmPassword;
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!validate()) return;

		setIsSubmitting(true);
		try {
			await api.resetPassword({ token, newPassword: fields.newPassword });
			setFields({ newPassword: "", confirmPassword: "" });
			setIsDone(true);
		} catch (resetError) {
			// "Invalid or has expired" arrives here as one message for all three
			// reasons — used, expired, never existed. Shown as sent.
			setErrors((current) => ({
				...current,
				form: getErrorMessage(resetError, "Your password could not be reset. Try again."),
			}));
		} finally {
			setIsSubmitting(false);
		}
	}

	if (isDone) {
		return (
			<div className="flex flex-col gap-4">
				<p className="text-[13px] text-live">
					Password changed. Any device that was still signed in has been signed out.
				</p>
				<Link to="/login" className="text-[13px] font-semibold text-signal hover:text-signal-hover">
					Sign in
				</Link>
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<TextField
				label="New password"
				type="password"
				autoComplete="new-password"
				value={fields.newPassword}
				error={errors.newPassword}
				onChange={(event) => setFields((current) => ({ ...current, newPassword: event.target.value }))}
			/>
			<TextField
				label="Confirm new password"
				type="password"
				autoComplete="new-password"
				value={fields.confirmPassword}
				error={errors.confirmPassword}
				onChange={(event) => setFields((current) => ({ ...current, confirmPassword: event.target.value }))}
			/>

			{errors.form && (
				<p role="alert" className="text-[13px] text-signal">
					{errors.form}
				</p>
			)}

			<Button type="submit" disabled={isSubmitting}>
				{isSubmitting ? "Saving…" : "Set new password"}
			</Button>
		</form>
	);
}
