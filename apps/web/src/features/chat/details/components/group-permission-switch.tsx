import type { GroupInvitePolicy } from "@chatty/shared-types";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/switch";
import { getErrorMessage } from "@/utils/get-error-message";

interface GroupPermissionSwitchProps {
	icon: LucideIcon;
	/** Facebook's phrasing: "Only admins can …". Also the switch's accessible name. */
	label: string;
	policy: GroupInvitePolicy;
	isAdmin: boolean;
	save: (policy: GroupInvitePolicy) => Promise<unknown>;
}

/** One group permission: on means admins only. Only an admin can flip it; everyone sees where it stands. */
export function GroupPermissionSwitch({ icon: Icon, label, policy, isAdmin, save }: GroupPermissionSwitchProps) {
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");
	const isAdminsOnly = policy === "managers";

	async function toggle() {
		if (!isAdmin || isSaving) return;
		setIsSaving(true);
		setError("");
		try {
			await save(isAdminsOnly ? "everyone" : "managers");
		} catch (changeError) {
			setError(getErrorMessage(changeError, "The setting could not be changed. Try again."));
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div>
			<div className="flex min-h-11 items-center gap-3 py-1.5">
				<Icon className="size-[18px] shrink-0 text-ink-soft" aria-hidden="true" />
				<span className="min-w-0 flex-1 text-[14px] leading-snug text-ink">{label}</span>
				<Switch
					label={label}
					isOn={isAdminsOnly}
					isDisabled={!isAdmin || isSaving}
					onChange={() => void toggle()}
				/>
			</div>
			{error && (
				<p role="alert" className="note pb-1 text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
