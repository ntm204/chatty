import type { CurrentUserDTO } from "@chatty/shared-types";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { focusField } from "@/utils/focus-field";
import { getServerErrorField } from "@/utils/server-error-field";

interface ChangeEmailFormProps {
	user: CurrentUserDTO;
}

/**
 * Moves the account to a new email address — or rather, asks to.
 *
 * The distinction is the whole feature and the copy has to carry it: when this
 * succeeds **nothing has changed yet**. A link goes to the new address and the
 * account moves only when somebody opens it, so the success message names the
 * address to check rather than announcing an update, and the cached profile is
 * deliberately not touched. Saying "email updated" here would leave someone who
 * mistyped their address believing they can still sign in.
 *
 * The current password is asked for because this is a credential change: the
 * next password reset is delivered wherever this field points.
 */
export function ChangeEmailForm({ user }: ChangeEmailFormProps) {
	const [fields, setFields] = useState({ newEmail: "", currentPassword: "" });
	const [errors, setErrors] = useState({ newEmail: "", currentPassword: "", form: "" });
	const [isSending, setIsSending] = useState(false);
	const [pendingEmail, setPendingEmail] = useState("");

	const newEmail = fields.newEmail.trim();

	function validate(form: HTMLFormElement) {
		const nextErrors = { newEmail: "", currentPassword: "", form: "" };

		// Shape only. Whether the address is free, and whether it is even the same
		// one they already have, are the server's answers to give.
		if (!newEmail.includes("@")) nextErrors.newEmail = "Enter a valid email address";
		if (!fields.currentPassword) nextErrors.currentPassword = "Current password is required";

		setErrors(nextErrors);
		focusField(form, nextErrors.newEmail ? "newEmail" : nextErrors.currentPassword ? "currentPassword" : null);

		return !nextErrors.newEmail && !nextErrors.currentPassword;
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		if (isSending || !validate(form)) return;

		setIsSending(true);
		setPendingEmail("");
		try {
			await api.requestEmailChange({ newEmail, currentPassword: fields.currentPassword });
			setPendingEmail(newEmail);
			// The password does not survive the request, for the reason
			// ChangePasswordForm clears its own fields. The address stays on screen so
			// the confirmation message has something to point at.
			setFields({ newEmail: "", currentPassword: "" });
		} catch (error) {
			// "Email already registered" and "that is already the address on this
			// account" are the server's to know; both belong beside the new address.
			const message = (error as Error).message;
			const field = getServerErrorField(message, { email: "newEmail", currentPassword: "currentPassword" });
			setErrors((current) => ({ ...current, [field ?? "form"]: message }));
			focusField(form, field);
		} finally {
			setIsSending(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} aria-busy={isSending} className="flex flex-col gap-4">
			{/* The saved login's username (the visible field is disabled, which password
			    managers skip), so the password below is matched to the right login. */}
			<input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />
			<TextField label="Current email" type="email" value={user.email} readOnly disabled autoComplete="off" />
			<TextField
				label="New email"
				name="newEmail"
				type="email"
				autoComplete="email"
				value={fields.newEmail}
				error={errors.newEmail}
				disabled={isSending}
				onChange={(event) => {
					setPendingEmail("");
					setErrors((current) => ({ ...current, newEmail: "", form: "" }));
					setFields((current) => ({ ...current, newEmail: event.target.value }));
				}}
			/>
			{/* "Your password", not "Current password": the profile page renders three
			    sections that each ask for the same value, and three identically
			    labelled fields on one screen is ambiguous to a screen reader and to
			    anyone else reading down the page. */}
			<TextField
				label="Your password"
				name="currentPassword"
				type="password"
				autoComplete="current-password"
				value={fields.currentPassword}
				error={errors.currentPassword}
				disabled={isSending}
				onChange={(event) => {
					setPendingEmail("");
					setErrors((current) => ({ ...current, currentPassword: "", form: "" }));
					setFields((current) => ({ ...current, currentPassword: event.target.value }));
				}}
			/>

			{errors.form && (
				<p role="alert" className="text-[13px] text-signal">
					{errors.form}
				</p>
			)}
			{pendingEmail && (
				<p role="status" className="text-[13px] text-live">
					Check {pendingEmail} for a confirmation link. Your address stays {user.email} until you open it.
				</p>
			)}

			<Button type="submit" disabled={isSending}>
				{isSending ? "Sending…" : "Send confirmation link"}
			</Button>
		</form>
	);
}
