import type { MessageProtectionDTO } from "@chatty/shared-types";
import { Lock } from "lucide-react";
import { describeProtectedStatus } from "../utils/protected-message";

interface ProtectedMessageLabelProps {
	protection: MessageProtectionDTO;
	participantCount: number;
}

/** Above the author's own protected message: that it is protected, and whether it has been opened. */
export function ProtectedMessageLabel({ protection, participantCount }: ProtectedMessageLabelProps) {
	return (
		<span className="eyebrow mb-1 flex items-center gap-1 opacity-70">
			<Lock aria-hidden="true" className="size-3" />
			Protected · {describeProtectedStatus(protection, participantCount)}
		</span>
	);
}
