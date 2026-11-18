import type { CurrentUserDTO, UpdateProfileRequest } from "@chatty/shared-types";
import { useRef, useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/hooks/use-auth";
import { useStoryPeopleLists } from "@/hooks/use-story-people-lists";
import { getErrorMessage } from "@/utils/get-error-message";
import type { PrivacyPage } from "../types/settings";
import { pick } from "../utils/pick";
import { PrivacyMenu } from "./privacy-menu";
import { PrivacyPageView } from "./privacy-page-view";

interface PrivacySettingsProps {
	user: CurrentUserDTO;
}

/**
 * Who sees what you do, and what others may do with what you write — laid out
 * as Instagram does: a grouped list showing each current value, and a page per
 * setting. Blocked and restricted accounts live here too, as they do there.
 *
 * Every control applies the moment it changes — no Save button for choices that
 * are each one tap. The new value shows at once and rolls back with a reason if
 * the server refuses it. Each symmetric setting says so in its sentence: being
 * surprised by the symmetry afterwards is what makes a setting feel like a trick.
 */
export function PrivacySettings({ user }: PrivacySettingsProps) {
	const setCurrentUser = useAuth((state) => state.setCurrentUser);
	const [error, setError] = useState("");
	const [page, setPage] = useState<PrivacyPage | null>(null);
	const lists = useStoryPeopleLists();
	// One request at a time, in the order chosen, so a quick second tap cannot
	// land before the first and leave the server holding the older value.
	const queueRef = useRef<Promise<void>>(Promise.resolve());

	function save(change: UpdateProfileRequest) {
		const current = useAuth.getState().currentUser ?? user;
		const reverted = pick(current, change);
		setError("");
		setCurrentUser({ ...current, ...change } as CurrentUserDTO);
		queueRef.current = queueRef.current.then(async () => {
			try {
				const saved = await api.updateProfile(change);
				// Only this change's keys: a later tap already shown on screen must not be undone.
				setCurrentUser({ ...(useAuth.getState().currentUser ?? saved), ...pick(saved, change) });
			} catch (saveError) {
				setCurrentUser({ ...(useAuth.getState().currentUser ?? current), ...reverted } as CurrentUserDTO);
				setError(getErrorMessage(saveError, "The setting could not be saved. Try again."));
			}
		});
	}

	return (
		<div className="flex flex-col">
			{page ? (
				<PrivacyPageView page={page} user={user} lists={lists} save={save} onBack={() => setPage(null)} />
			) : (
				<PrivacyMenu
					user={user}
					closeFriendCount={lists.settings ? lists.selected.close_friends.size : null}
					hiddenCount={lists.settings ? lists.selected.hidden.size : null}
					onOpen={setPage}
				/>
			)}
			{(error || lists.error) && (
				<p role="alert" className="pt-4 text-[13px] text-signal">
					{error || lists.error}
				</p>
			)}
		</div>
	);
}
