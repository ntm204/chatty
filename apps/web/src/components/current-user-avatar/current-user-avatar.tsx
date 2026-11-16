import type { CurrentUserDTO } from "@chatty/shared-types";
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { AvatarCropDialog } from "@/components/avatar-crop-dialog";
import { Button } from "@/components/button";
import { AVATAR_MAX_BYTES, AVATAR_UPLOAD_HINT } from "@/constants/avatar-upload";
import { useAuth } from "@/hooks/use-auth";
import type { AvatarSize } from "@/types/avatar";
import { getErrorMessage } from "@/utils/get-error-message";

interface CurrentUserAvatarProps {
	user: CurrentUserDTO;
	size?: AvatarSize;
}

/**
 * Your profile avatar with clean upload, crop and remove controls.
 */
export function CurrentUserAvatar({ user, size = "lg" }: CurrentUserAvatarProps) {
	const setCurrentUser = useAuth((state) => state.setCurrentUser);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");
	const [cropFile, setCropFile] = useState<File | null>(null);

	async function uploadPhoto(file: File) {
		setIsSaving(true);
		setError("");
		try {
			setCurrentUser(await api.uploadAvatar(file));
		} catch (uploadError) {
			setError(getErrorMessage(uploadError, "Your photo could not be saved. Try again."));
		} finally {
			setIsSaving(false);
		}
	}

	function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			setError("Choose an image file — PNG or JPG.");

			return;
		}
		if (file.size > AVATAR_MAX_BYTES) {
			setError("That picture is over 5 MB. Choose a smaller one.");

			return;
		}
		setError("");
		setCropFile(file);
	}

	async function handleRemove() {
		setIsSaving(true);
		setError("");
		try {
			setCurrentUser(await api.deleteAvatar());
		} catch (removeError) {
			setError(getErrorMessage(removeError, "Your photo could not be removed. Try again."));
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="flex items-center gap-5">
			<div className="relative shrink-0">
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
			</div>

			<div className="flex min-w-0 flex-col gap-2.5">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					onChange={handleFileSelected}
					className="hidden"
				/>

				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={() => fileInputRef.current?.click()}
						disabled={isSaving}
						aria-label="Change your profile picture"
						className="px-3.5 py-2 text-xs"
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
							className="px-3 py-2 text-xs"
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

			{cropFile && (
				<AvatarCropDialog
					file={cropFile}
					title="Crop profile photo"
					onCrop={(cropped) => void uploadPhoto(cropped)}
					onClose={() => setCropFile(null)}
				/>
			)}
		</div>
	);
}
