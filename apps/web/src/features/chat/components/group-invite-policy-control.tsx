import type { GroupInvitePolicy } from "@chatty/shared-types";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";

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
			setError((changeError as Error).message);
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="mt-4">
			<div className="flex items-center justify-between gap-3">
				<span className="text-[13px] text-ink">Only admins can add people</span>
				<Button
					variant="ghost"
					role="switch"
					aria-checked={isAdminsOnly}
					aria-label="Only admins can add people"
					disabled={!isAdmin || isSaving}
					onClick={() => void toggle()}
					className={cn(
						"relative h-6 w-11 shrink-0 rounded-full border p-0 transition-colors",
						// Ghost's own hover:bg-ink/5 would otherwise win over the track's
						// solid "on" fill while the pointer rests on it, mid-hover, turning
						// a solid switch hollow — so the hover state is restated here too.
						// The off track is `paper-sunken`, not a translucent ink tint: an
						// opacity-based fill and a `paper-raised` knob both read as "the
						// panel's own surface" in dark mode, where ink is pale — the two
						// nearly vanished into each other. Raised-above-sunken is the pair
						// this app already uses for "this sits above that", in both themes.
						isAdminsOnly
							? "border-ink bg-ink hover:bg-ink"
							: "border-rule bg-paper-sunken hover:bg-paper-sunken",
					)}
				>
					<span
						aria-hidden="true"
						className={cn(
							"absolute top-0.5 size-5 rounded-full bg-paper-raised shadow-sm transition-transform",
							isAdminsOnly ? "translate-x-5" : "translate-x-0.5",
						)}
					/>
				</Button>
			</div>
			{!isAdmin && <p className="eyebrow mt-2 text-ink-faint">Only group admins can change this policy.</p>}
			{error && (
				<p role="alert" className="eyebrow mt-2 text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
