import type { CurrentUserDTO, UpdateProfileRequest } from "@chatty/shared-types";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { HANDLE_PATTERN, MAX_HANDLE_LENGTH, MIN_HANDLE_LENGTH } from "@/constants/validation";
import { useAuth } from "@/hooks/use-auth";

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
		readReceiptsEnabled: user.readReceiptsEnabled,
		presenceVisibility: user.presenceVisibility,
	});
	const [errors, setErrors] = useState({ displayName: "", handle: "", form: "" });
	const [isSaving, setIsSaving] = useState(false);
	const [isSaved, setIsSaved] = useState(false);

	// Lowercased before comparing, the same way it is before sending: typing a
	// capital into your own unchanged handle is not an edit.
	const displayName = fields.displayName.trim();
	const handle = fields.handle.trim().toLowerCase();
	const hasChanges =
		displayName !== user.displayName ||
		handle !== user.handle ||
		fields.readReceiptsEnabled !== user.readReceiptsEnabled ||
		fields.presenceVisibility !== user.presenceVisibility;

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
		if (isSaving || !hasChanges || !validate(event.currentTarget)) return;

		// Only what actually changed goes up. The server would accept the whole
		// object, but a request carrying a field nobody touched is a request that
		// can overwrite an edit made in another tab.
		const input: UpdateProfileRequest = {
			...(displayName !== user.displayName && { displayName }),
			...(handle !== user.handle && { handle }),
			...(fields.readReceiptsEnabled !== user.readReceiptsEnabled && {
				readReceiptsEnabled: fields.readReceiptsEnabled,
			}),
			...(fields.presenceVisibility !== user.presenceVisibility && {
				presenceVisibility: fields.presenceVisibility,
			}),
		};

		setIsSaving(true);
		setIsSaved(false);
		try {
			setCurrentUser(await api.updateProfile(input));
			setIsSaved(true);
		} catch (error) {
			// "Handle already taken" arrives here — the server is the only thing
			// that can know it, so the message is shown as sent.
			setErrors((current) => ({ ...current, form: (error as Error).message }));
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
				autoComplete="username"
				value={fields.handle}
				error={errors.handle}
				disabled={isSaving}
				onChange={(event) => {
					setIsSaved(false);
					setErrors((current) => ({ ...current, handle: "", form: "" }));
					setFields((current) => ({ ...current, handle: event.target.value }));
				}}
			/>
			{/* A raw checkbox: the app declares a Button and a TextField and nothing
			    else, and inventing a toggle primitive for its only use would be a
			    component to maintain rather than a decision made. */}
			<label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
				<input
					type="checkbox"
					checked={fields.readReceiptsEnabled}
					disabled={isSaving}
					onChange={(event) => {
						setIsSaved(false);
						setErrors((current) => ({ ...current, form: "" }));
						setFields((current) => ({ ...current, readReceiptsEnabled: event.target.checked }));
					}}
					// `accent-color` is the whole styling: a hand-built box would need
					// its own focus ring, indeterminate state and keyboard handling to
					// be as good as the one the browser already ships.
					className="mt-0.5 size-4 accent-ink"
				/>
				<span className="flex flex-col gap-1">
					<span className="font-medium">Send read receipts</span>
					{/* The symmetry is said out loud, because it is the part people are
					    surprised by — and being surprised by it after the fact is what
					    makes a setting feel like a trick. */}
					<span className="text-[13px] leading-normal text-ink-faint">
						Turning this off hides your “Seen” from everyone, and hides theirs from you.
					</span>
				</span>
			</label>

			<label className="flex flex-col gap-2 text-sm text-ink">
				<span className="eyebrow text-ink-soft">Who can see your last seen</span>
				<select
					aria-label="Who can see your last seen"
					value={fields.presenceVisibility}
					disabled={isSaving}
					onChange={(event) => {
						setIsSaved(false);
						setErrors((current) => ({ ...current, form: "" }));
						setFields((current) => ({
							...current,
							presenceVisibility: event.target.value as CurrentUserDTO["presenceVisibility"],
						}));
					}}
					className="cursor-pointer rounded-control border border-rule bg-paper-raised px-3 py-2.5 text-sm text-ink outline-none transition focus:border-ink focus:ring-3 focus:ring-ink/[0.07] disabled:cursor-default disabled:bg-rule-soft disabled:text-ink-faint"
				>
					<option value="everyone">Everyone</option>
					<option value="contacts">People you chat with</option>
					<option value="nobody">Nobody</option>
				</select>
				<span className="text-[13px] text-ink-faint">
					Online status is still shown while you are connected.
				</span>
			</label>

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
