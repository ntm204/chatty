import type { CurrentUserDTO } from "@chatty/shared-types";
import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { AVATAR_MAX_BYTES, AVATAR_UPLOAD_HINT } from "@/constants/avatar-upload";
import { useAuth } from "@/hooks/use-auth";
import type { AvatarSize } from "@/types/avatar";

interface CurrentUserAvatarProps {
	user: CurrentUserDTO;
	size?: AvatarSize;
}

/**
 * Your own avatar, and the only controls that change it.
 *
 * The picture used to be the button — click the face, get a file dialog — which
 * is a thing you have to already know. Both actions are now named, because this
 * only ever renders inside settings, where there is room to say what they do.
 *
 * Shared rather than owned by `features/profile` because it is the one control
 * on that screen the sidebar also has a claim on, and features must not import
 * from each other.
 */
export function CurrentUserAvatar({ user, size = "lg" }: CurrentUserAvatarProps) {
	const setCurrentUser = useAuth((state) => state.setCurrentUser);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// Resetting the input is what makes picking the same file twice work: the
		// change event does not fire when the value is unchanged, so re-uploading
		// after a failure would do nothing.
		event.target.value = "";
		if (!file) return;
		// Checked here as well as on the server: a 20 MB photo should fail now, not
		// after it has been uploaded. The current picture stays as it is either way.
		if (!file.type.startsWith("image/")) {
			setError("Choose an image file — PNG or JPG.");

			return;
		}
		if (file.size > AVATAR_MAX_BYTES) {
			setError("That picture is over 5 MB. Choose a smaller one.");

			return;
		}

		setIsSaving(true);
		setError("");
		try {
			setCurrentUser(await api.uploadAvatar(file));
		} catch (uploadError) {
			setError((uploadError as Error).message);
		} finally {
			setIsSaving(false);
		}
	}

	async function handleRemove() {
		setIsSaving(true);
		setError("");
		try {
			setCurrentUser(await api.deleteAvatar());
		} catch (removeError) {
			setError((removeError as Error).message);
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="flex items-center gap-5">
			<span className="relative">
				<Avatar user={user} size={size} />
				{isSaving && (
					<span
						role="status"
						aria-label="Saving your profile picture"
						className="absolute inset-0 flex items-center justify-center rounded-full bg-paper/70"
					>
						<Loader2 className="size-4 animate-spin text-ink-soft" />
					</span>
				)}
			</span>

			<div className="flex min-w-0 flex-col gap-2.5">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					onChange={(event) => void handleFileSelected(event)}
					className="hidden"
				/>

				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={() => fileInputRef.current?.click()}
						disabled={isSaving}
						aria-label="Change your profile picture"
						className="px-3.5 py-2"
					>
						<Upload className="size-3.5" />
						Upload a photo
					</Button>

					{user.avatarUrl && (
						<Button
							variant="ghost"
							onClick={() => void handleRemove()}
							disabled={isSaving}
							aria-label="Remove your profile picture"
							className="px-3 py-2"
						>
							Remove
						</Button>
					)}
				</div>

				{error ? (
					<p role="alert" className="note text-signal">
						{error}
					</p>
				) : (
					<p className="meta text-ink-faint">{AVATAR_UPLOAD_HINT}</p>
				)}
			</div>
		</div>
	);
}
