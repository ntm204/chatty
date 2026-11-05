import type { ConversationDTO } from "@chatty/shared-types";
import type { useGlobalSearchSession } from "../hooks/use-global-search-session";
import { ConnectionBanner } from "./connection-banner";
import { GlobalMessageSearch } from "./global-message-search";
import { KeyboardShortcutsPanel } from "./keyboard-shortcuts-panel";

interface ChatOverlaysProps {
	globalSearch: ReturnType<typeof useGlobalSearchSession>;
	currentUserId: string;
	isShortcutHelpOpen: boolean;
	isConnectionLost: boolean;
	onCloseShortcutHelp: () => void;
	onSelectMessage: (conversation: ConversationDTO, messageId: string) => void;
}

export function ChatOverlays({
	globalSearch,
	currentUserId,
	isShortcutHelpOpen,
	isConnectionLost,
	onCloseShortcutHelp,
	onSelectMessage,
}: ChatOverlaysProps) {
	return (
		<>
			{globalSearch.isOpen && (
				<GlobalMessageSearch
					search={globalSearch.search}
					scrollPosition={globalSearch.scrollPosition}
					currentUserId={currentUserId}
					onClose={globalSearch.close}
					onSelectMessage={onSelectMessage}
				/>
			)}
			{isShortcutHelpOpen && <KeyboardShortcutsPanel onClose={onCloseShortcutHelp} />}
			{isConnectionLost && <ConnectionBanner />}
		</>
	);
}
