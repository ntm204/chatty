import { useState } from "react";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/utils/get-error-message";

/**
 * Deletes the account, behind a password and a confirmation step.
 *
 * Two steps rather than one button, because this is the only action in the app
 * that nothing can undo: the first press reveals what is about to happen and asks
 * for the password, and only the second sends anything. A single red button next
 * to "Change password" is one mis-click from an account that does not exist.
 *
 * No redirect on success and no navigation of its own — clearing the session in
 * the store is enough. The route guard in app.tsx sends an unauthenticated
 * visitor to /login, which is the same path a sign-out takes.
 */
export function DeleteAccountForm() {
	const deleteAccount = useAuth((state) => state.deleteAccount);
	const [isConfirming, setIsConfirming] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const [error, setError] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!currentPassword) {
			setError("Current password is required");

			return;
		}

		setIsDeleting(true);
		setError("");
		try {
			await deleteAccount(currentPassword);
		} catch (deleteError) {
			setError(getErrorMessage(deleteError, "Your account could not be deleted. Try again."));
			setIsDeleting(false);
		}
		// No `finally`: on success this component is unmounted by the route guard,
		// and setting state on the way out is a warning about a bug that is not one.
	}

	if (!isConfirming) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-[13px] leading-normal text-ink-soft">
					Your account, your avatar and every session you have open are removed. Messages you have already
					sent stay in their conversations, with your name taken off them.
				</p>
				<Button variant="danger" onClick={() => setIsConfirming(true)} className="self-start">
					Delete my account
				</Button>
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<p className="text-[13px] leading-normal text-ink-soft">
				This cannot be undone. Enter your password to confirm.
			</p>
			{/* Distinct from the other two password fields on this page — see the note
			    in change-email-form.tsx. */}
			<TextField
				label="Confirm with your password"
				type="password"
				autoComplete="current-password"
				value={currentPassword}
				error={error}
				onChange={(event) => {
					setError("");
					setCurrentPassword(event.target.value);
				}}
			/>

			<div className="flex gap-2">
				<Button type="submit" variant="danger" disabled={isDeleting}>
					{isDeleting ? "Deleting…" : "Delete permanently"}
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={() => {
						setIsConfirming(false);
						setCurrentPassword("");
						setError("");
					}}
				>
					Cancel
				</Button>
			</div>
		</form>
	);
}
