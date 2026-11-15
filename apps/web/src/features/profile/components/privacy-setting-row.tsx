import type { ReactNode } from "react";

interface PrivacySettingRowProps {
	label: string;
	/** Set when the control is a group that names itself by the label's id. */
	labelId?: string;
	description: string;
	control: ReactNode;
	/** Wide controls sit under the text; a switch sits beside it. */
	isStacked?: boolean;
}

/** One privacy choice: what it is, the one sentence that matters about it, and the control. */
export function PrivacySettingRow({ label, labelId, description, control, isStacked = false }: PrivacySettingRowProps) {
	return (
		<div className={isStacked ? "flex flex-col gap-2.5 py-4" : "flex items-start justify-between gap-6 py-4"}>
			<div className="flex min-w-0 flex-col gap-0.5">
				<span id={labelId} className="text-[14px] font-medium text-ink">
					{label}
				</span>
				<span className="text-[13px] leading-normal text-ink-faint">{description}</span>
			</div>
			{control}
		</div>
	);
}
