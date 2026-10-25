import { useState } from "react";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { MIN_PASSWORD_LENGTH } from "@/constants/validation";
import { useAuth } from "@/hooks/use-auth";
import { focusField } from "@/utils/focus-field";
import { getServerErrorField } from "@/utils/server-error-field";

/**
 * Changes the signed-in user's password.
 *
 * Takes no props: the server identifies the account from the token, and the
 * current password is typed rather than remembered. It does reach the auth
 * store, but only for the action — changing a password replaces this session's
 * token and reconnects its socket, which is the store's job rather than a form's.
 *
 * The confirmation field never leaves the browser. It exists to catch a typo in
 * a value the user cannot see, which is a client-side problem — sending it would
 * give the server a second copy to validate and nothing to do with it.
 */
export function ChangePasswordForm() {
	const changePassword = useAuth((state) => state.changePassword);
	const email = useAuth((state) => state.currentUser?.email ?? "");
	const [fields, setFields] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
	const [errors, setErrors] = useState({ currentPassword: "", newPassword: "", confirmPassword: "", form: "" });
	const [isSaving, setIsSaving] = useState(false);
	const [isChanged, setIsChanged] = useState(false);

	function validate(form: HTMLFormElement) {
		const nextErrors = { currentPassword: "", newPassword: "", confirmPassword: "", form: "" };

		if (!fields.currentPassword) nextErrors.currentPassword = "Current password is required";

		if (fields.newPassword.length < MIN_PASSWORD_LENGTH) {
			nextErrors.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
		} else if (fields.newPassword === fields.currentPassword) {
			// The server rejects this too; catching it here saves a round trip and
			// a bcrypt comparison.
			nextErrors.newPassword = "New password must be different from the current one";
		}

		if (fields.confirmPassword !== fields.newPassword) {
			nextErrors.confirmPassword = "Passwords do not match";
		}

		setErrors(nextErrors);
		focusField(
			form,
			nextErrors.currentPassword
				? "currentPassword"
				: nextErrors.newPassword
					? "newPassword"
					: nextErrors.confirmPassword
						? "confirmPassword"
						: null,
		);

		return !nextErrors.currentPassword && !nextErrors.newPassword && !nextErrors.confirmPassword;
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		if (isSaving || !validate(form)) return;

		setIsSaving(true);
		setIsChanged(false);
		try {
			await changePassword(fields.currentPassword, fields.newPassword);
			// Cleared on success, not left filled: the form holds three passwords in
			// plain text and there is no reason for them to survive the request.
			setFields({ currentPassword: "", newPassword: "", confirmPassword: "" });
			setIsChanged(true);
		} catch (error) {
			const message = (error as Error).message;
			const field = getServerErrorField(message, {
				currentPassword: "currentPassword",
				newPassword: "newPassword",
			});
			setErrors((current) => ({ ...current, [field ?? "form"]: message }));
			focusField(form, field);
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} aria-busy={isSaving} className="flex flex-col gap-4">
			{/* Tells a password manager which saved login this new password replaces. */}
			<input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
			<TextField
				label="Current password"
				name="currentPassword"
				type="password"
				autoComplete="current-password"
				value={fields.currentPassword}
				error={errors.currentPassword}
				disabled={isSaving}
				onChange={(event) => {
					setIsChanged(false);
					setErrors((current) => ({ ...current, currentPassword: "", form: "" }));
					setFields((current) => ({ ...current, currentPassword: event.target.value }));
				}}
			/>
			<TextField
				label="New password"
				name="newPassword"
				type="password"
				autoComplete="new-password"
				value={fields.newPassword}
				error={errors.newPassword}
				disabled={isSaving}
				onChange={(event) => {
					setIsChanged(false);
					setErrors((current) => ({ ...current, newPassword: "", form: "" }));
					setFields((current) => ({ ...current, newPassword: event.target.value }));
				}}
			/>
			<TextField
				label="Confirm new password"
				name="confirmPassword"
				type="password"
				autoComplete="new-password"
				value={fields.confirmPassword}
				error={errors.confirmPassword}
				disabled={isSaving}
				onChange={(event) => {
					setIsChanged(false);
					setErrors((current) => ({ ...current, confirmPassword: "", form: "" }));
					setFields((current) => ({ ...current, confirmPassword: event.target.value }));
				}}
			/>

			{errors.form && (
				<p role="alert" className="text-[13px] text-signal">
					{errors.form}
				</p>
			)}
			{isChanged && (
				<p role="status" className="text-[13px] text-live">
					Password changed. Everywhere else you were signed in has been signed out.
				</p>
			)}

			<Button type="submit" disabled={isSaving}>
				{isSaving ? "Changing…" : "Change password"}
			</Button>
		</form>
	);
}
