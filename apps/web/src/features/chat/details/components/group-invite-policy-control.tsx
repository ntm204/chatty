import type { GroupInvitePolicy } from "@chatty/shared-types";
import { useState } from "react";
import { ShieldPlus } from "lucide-react";
import { api } from "@/api/client";
import { Switch } from "@/components/switch";
import { getErrorMessage } from "@/utils/get-error-message";

interface GroupInvitePolicyControlProps {
	conversationId: string;
	policy: GroupInvitePolicy;
	isAdmin: boolean;
}

export function GroupInvitePolicyControl({ conversationId, policy, isAdmin }: GroupInvitePolicyControlProps) {
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");
	const isAdminsOnly = policy === "managers";

	async function toggle() {
		if (!isAdmin || isSaving) return;
		const nextPolicy: GroupInvitePolicy = isAdminsOnly ? "everyone" : "managers";
		setIsSaving(true);
		setError("");
		try {
			await api.setGroupInvitePolicy(conversationId, nextPolicy);
		} catch (changeError) {
			setError(getErrorMessage(changeError, "The setting could not be changed. Try again."));
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div>
			<div className="flex min-h-12 items-center gap-3 py-2.5">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-sunken">
					<ShieldPlus className="size-4 text-ink-soft" aria-hidden="true" />
				</span>
				<span className="min-w-0 flex-1 whitespace-nowrap text-[13px] text-ink">Admin-only invites</span>
				<Switch
					label="Only admins can add people"
					isOn={isAdminsOnly}
					isDisabled={!isAdmin || isSaving}
					onChange={() => void toggle()}
				/>
			</div>
			{!isAdmin && <p className="note mt-2 text-ink-faint">Only group admins can change this policy.</p>}
			{error && (
				<p role="alert" className="note mt-2 text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
