import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { SettingsModal } from "../components";

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
	const handleClose = useCallback(() => navigate("/chat"), [navigate]);

	if (!currentUser || location.pathname !== "/profile") return null;

	return <SettingsModal user={currentUser} onClose={handleClose} />;
}
