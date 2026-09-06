import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { setSessionExpiredHandler } from "@/api/client";
import { ConfirmEmailPage } from "@/features/auth/pages/confirm-email-page";
import { ForgotPasswordPage } from "@/features/auth/pages/forgot-password-page";
import { LoginPage } from "@/features/auth/pages/login-page";
import { ResetPasswordPage } from "@/features/auth/pages/reset-password-page";
import { ChatPage } from "@/features/chat/pages/chat-page";
import { SettingsPage } from "@/features/profile/pages/settings-page";
import { useAuth } from "@/hooks/use-auth";

export function App() {
	const currentUser = useAuth((state) => state.currentUser);
	const isRestoring = useAuth((state) => state.isRestoring);
	const restoreSession = useAuth((state) => state.restoreSession);

	useEffect(() => {
		// A token that expires mid-session used to fail every request separately,
		// with no route back to the login screen: the tab kept rendering a chat
		// nothing could be sent from. The teardown is `logout`'s, and clearing the
		// user is what makes the route guards below redirect. Wired here rather
		// than inside the store because the api client is imported *by* the store,
		// and this is the composition root where both are already in scope.
		setSessionExpiredHandler(() => useAuth.getState().logout());
		void restoreSession();
	}, [restoreSession]);

	// Without this gate, a reload would bounce an authenticated user to /login for
	// the moment before the stored token has been checked.
	if (isRestoring) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-paper">
				<p className="eyebrow text-ink-faint">Loading…</p>
			</div>
		);
	}

	return (
		<BrowserRouter>
			<Routes>
				<Route path="/login" element={currentUser ? <Navigate to="/chat" replace /> : <LoginPage />} />
				{/* Reachable while signed in as well as out. Someone who is still
				    logged in on this device may well be the person who asked for the
				    link, and bouncing them to /chat would strand the email. */}
				<Route path="/forgot-password" element={<ForgotPasswordPage />} />
				<Route path="/reset-password" element={<ResetPasswordPage />} />
				{/* Unguarded for the same reason: the link is opened in the new
				    mailbox, which is regularly a phone that has never signed in. */}
				<Route path="/confirm-email" element={<ConfirmEmailPage />} />
				<Route
					path="/chat"
					element={
						currentUser ? (
							<>
								<ChatPage />
								<SettingsPage />
							</>
						) : (
							<Navigate to="/login" replace />
						)
					}
				/>
				{/* The chat and the dialog on top of it, as siblings, so a
				    reload of /profile shows what a click on the settings icon
				    shows and Back closes the dialog rather than leaving the app.
				    Composed here because `features/profile` may not import a page
				    from `features/chat` — the router is where both are in scope. */}
				<Route
					path="/profile"
					element={
						currentUser ? (
							<>
								<ChatPage />
								<SettingsPage />
							</>
						) : (
							<Navigate to="/login" replace />
						)
					}
				/>
				<Route path="*" element={<Navigate to={currentUser ? "/chat" : "/login"} replace />} />
			</Routes>
		</BrowserRouter>
	);
}
