import { lazy, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { ScreenLoadBoundary } from "@/components/screen-load-boundary/screen-load-boundary";

const SettingsModal = lazy(() =>
	import("../components/settings-modal").then((module) => ({ default: module.SettingsModal })),
);

/**
 * What `/profile` renders — the dialog and nothing else.
 *
 * The chat behind it is not this component's to draw: `app.tsx` renders
 * `ChatPage` and this as siblings on the same route, because a settings screen
 * inside `features/profile` may not import one from `features/chat`. Composing
 * them one level up, in the router, is the only place both are already in scope.
 *
 * Closing is a navigation rather than a piece of state, which is what makes the
 * browser's Back button close the dialog for free.
 */
export function SettingsPage() {
	const location = useLocation();
	const currentUser = useAuth((state) => state.currentUser);
	const navigate = useNavigate();
	const conversationId = (location.state as { conversationId?: string | null } | null)?.conversationId ?? null;
	// Opened from the app, Back is the way out and lands on the same thread; a
	// reload or a pasted /profile has no entry to go back to, so it goes to chat.
	const handleClose = useCallback(() => {
		if (location.key !== "default") navigate(-1);
		else navigate(conversationId ? `/chat/${encodeURIComponent(conversationId)}` : "/chat", { replace: true });
	}, [conversationId, location.key, navigate]);

	if (!currentUser || location.pathname !== "/profile") return null;

	return (
		<ScreenLoadBoundary>
			<SettingsModal user={currentUser} onClose={handleClose} />
		</ScreenLoadBoundary>
	);
}
