import type { CurrentUserDTO, UpdateProfileRequest } from "@chatty/shared-types";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { HANDLE_PATTERN, MAX_HANDLE_LENGTH, MIN_HANDLE_LENGTH } from "@/constants/validation";
import { useAuth } from "@/hooks/use-auth";
import { focusField } from "@/utils/focus-field";
import { getServerErrorField } from "@/utils/server-error-field";
import { getErrorMessage } from "@/utils/get-error-message";

interface ProfileFormProps {
	user: CurrentUserDTO;
}

/**
 * Edits the things about an account that are yours to change in one request.
 *
 * Email is not one of them, and is not shown here at all any more: moving an
 * account to a new address is a two-step flow that only takes effect when a link
 * in the new mailbox is opened, so it has its own form rather than a field that
 * would appear to save with everything else.
 */
export function ProfileForm({ user }: ProfileFormProps) {
	const setCurrentUser = useAuth((state) => state.setCurrentUser);
	const [fields, setFields] = useState({
		displayName: user.displayName,
		handle: user.handle,
	});
	const [errors, setErrors] = useState({ displayName: "", handle: "", form: "" });
	const [isSaving, setIsSaving] = useState(false);
	const [isSaved, setIsSaved] = useState(false);

	// Lowercased before comparing, the same way it is before sending: typing a
	// capital into your own unchanged handle is not an edit.
	const displayName = fields.displayName.trim();
	const handle = fields.handle.trim().toLowerCase();
	const hasChanges = displayName !== user.displayName || handle !== user.handle;

	function validate(form: HTMLFormElement) {
		const nextErrors = { displayName: "", handle: "", form: "" };

		if (!displayName) nextErrors.displayName = "Display name is required";

		if (handle.length < MIN_HANDLE_LENGTH || handle.length > MAX_HANDLE_LENGTH) {
			nextErrors.handle = `Handle must be ${MIN_HANDLE_LENGTH}–${MAX_HANDLE_LENGTH} characters`;
		} else if (!HANDLE_PATTERN.test(handle)) {
			nextErrors.handle = "Start with a letter; letters, numbers and underscores only";
		}

		setErrors(nextErrors);
		const firstInvalidField = nextErrors.displayName ? "displayName" : nextErrors.handle ? "handle" : null;
		if (firstInvalidField) {
			const field = form.elements.namedItem(firstInvalidField);
			if (field instanceof HTMLElement) field.focus();
		}

		return !nextErrors.displayName && !nextErrors.handle;
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		if (isSaving || !hasChanges || !validate(form)) return;

		// Only what actually changed goes up. The server would accept the whole
		// object, but a request carrying a field nobody touched is a request that
		// can overwrite an edit made in another tab.
		const input: UpdateProfileRequest = {
			...(displayName !== user.displayName && { displayName }),
			...(handle !== user.handle && { handle }),
		};

		setIsSaving(true);
		setIsSaved(false);
		try {
			setCurrentUser(await api.updateProfile(input));
			setIsSaved(true);
		} catch (error) {
			// "Handle already taken" is the server's to know; it is shown beside the
			// handle it is about, with the typed value left in place to edit.
			const message = getErrorMessage(error, "Your profile could not be saved. Try again.");
			const field = getServerErrorField(message, { handle: "handle" });
			setErrors((current) => ({ ...current, [field ?? "form"]: message }));
			focusField(form, field);
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} aria-busy={isSaving} className="flex flex-col gap-5">
			<TextField
				label="Display name"
				name="displayName"
				autoComplete="name"
				value={fields.displayName}
				error={errors.displayName}
				disabled={isSaving}
				onChange={(event) => {
					setIsSaved(false);
					setErrors((current) => ({ ...current, displayName: "", form: "" }));
					setFields((current) => ({ ...current, displayName: event.target.value }));
				}}
			/>
			<TextField
				label="Handle"
				name="handle"
				// Not "username": sign-in uses the email, and a password manager that
				// saved the handle as the username would fill it into the email field.
				autoComplete="nickname"
				value={fields.handle}
				error={errors.handle}
				disabled={isSaving}
				onChange={(event) => {
					setIsSaved(false);
					setErrors((current) => ({ ...current, handle: "", form: "" }));
					setFields((current) => ({ ...current, handle: event.target.value }));
				}}
			/>
			{errors.form && (
				<p role="alert" className="text-[13px] text-signal">
					{errors.form}
				</p>
			)}
			{/* Cleared by every onChange below, so it cannot linger over a later edit.
			    Guarding this on `hasChanges` as well would tie the message to the
			    parent passing a refreshed `user` back down — true in the app, and
			    an invisible dependency for anything else that renders this. */}
			{isSaved && (
				<p role="status" className="text-[13px] text-live">
					Profile saved
				</p>
			)}

			<Button type="submit" disabled={isSaving || !hasChanges} className="self-start px-5">
				{isSaving ? "Saving…" : "Save changes"}
			</Button>
		</form>
	);
}
