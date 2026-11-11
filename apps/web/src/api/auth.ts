/**
 * Sign-in, sign-up, password, email-change and logout endpoints.
 * Composed into the public `api` object in ./client.ts.
 */
import type {
	AuthResponse,
	ChangePasswordRequest,
	ChangePasswordResponse,
	ConfirmEmailChangeRequest,
	LoginRequest,
	RegisterRequest,
	RequestEmailChangeRequest,
	RequestPasswordResetRequest,
	ResetPasswordRequest,
} from "@chatty/shared-types";
import { request, post } from "./core";

export const authApi = {
	register(input: RegisterRequest): Promise<AuthResponse> {
		return post<AuthResponse>("/auth/register", input);
	},

	login(input: LoginRequest): Promise<AuthResponse> {
		return post<AuthResponse>("/auth/login", input);
	},

	/**
	 * Sets a new password and returns a replacement token.
	 *
	 * The replacement is not optional. Changing a password ends every session on
	 * the account, the caller's included, so the token this request was made with
	 * stops working the moment it returns. `useAuth.changePassword` is what
	 * stores it and reopens the socket — call that rather than this.
	 */
	changePassword(input: ChangePasswordRequest): Promise<ChangePasswordResponse> {
		return post<ChangePasswordResponse>("/auth/password", input);
	},

	/**
	 * Asks for a reset link. Answers 204 whether or not the address has an
	 * account, so a caller learns nothing about who is registered — which means
	 * the UI must not claim the mail was sent, only that it would have been.
	 */
	requestPasswordReset(input: RequestPasswordResetRequest): Promise<void> {
		return post<void>("/auth/password-reset", input);
	},

	/** Redeems a link from the email. One use, one hour. */
	resetPassword(input: ResetPasswordRequest): Promise<void> {
		return post<void>("/auth/password-reset/confirm", input);
	},

	/**
	 * Asks to move the account to a new address.
	 *
	 * **Nothing has changed when this resolves.** A link goes to the new address
	 * and the account moves only once it is opened, so the UI must say "check that
	 * inbox" rather than "email updated" — and the cached profile must not be
	 * touched. The old address is warned at the same time.
	 */
	requestEmailChange(input: RequestEmailChangeRequest): Promise<void> {
		return post<void>("/auth/email", input);
	},

	/** Redeems the link from the new mailbox. One use, one hour, no session required. */
	confirmEmailChange(input: ConfirmEmailChangeRequest): Promise<void> {
		return post<void>("/auth/email/confirm", input);
	},

	/**
	 * Ends this session on the server.
	 *
	 * Unauthenticated by design — the refresh-token cookie is the credential — so
	 * it still works when the access token has already expired, which is exactly
	 * when somebody closing a laptop needs it to.
	 */
	logout(): Promise<void> {
		return request<void>("/auth/logout", { method: "POST" });
	},
};
