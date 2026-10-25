import { useState } from "react";
import { Link } from "react-router-dom";
import { wasSessionExpired } from "@/api/client";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { useAuth } from "@/hooks/use-auth";
import { focusField } from "@/utils/focus-field";

export function LoginForm() {
	const login = useAuth((state) => state.login);
	const [fields, setFields] = useState({ email: "", password: "" });
	const [errors, setErrors] = useState({ email: "", password: "", form: "" });
	const [isSubmitting, setIsSubmitting] = useState(false);
	// A plain read on every render, not state: the flag is cleared when a session
	// is stored, so there is nothing here to consume and nothing for StrictMode's
	// double render to consume twice. Being signed out by an expired session
	// deserves a stated reason, or it reads as the app forgetting who you are.
	const hasExpiredSession = wasSessionExpired();

	function validate(form: HTMLFormElement) {
		const nextErrors = { email: "", password: "", form: "" };

		if (!fields.email.trim()) nextErrors.email = "Email is required";
		if (!fields.password) nextErrors.password = "Password is required";

		setErrors(nextErrors);
		focusField(form, nextErrors.email ? "email" : nextErrors.password ? "password" : null);

		return !nextErrors.email && !nextErrors.password;
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (isSubmitting || !validate(event.currentTarget)) return;

		setIsSubmitting(true);
		try {
			await login(fields.email.trim(), fields.password);
		} catch (error) {
			// The server returns one message for both a wrong password and an
			// unknown email; showing it verbatim keeps that indistinguishable.
			setErrors((current) => ({ ...current, form: (error as Error).message }));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} aria-busy={isSubmitting} className="flex flex-col gap-4">
			{hasExpiredSession && !errors.form && (
				<p
					role="status"
					className="rounded-control border border-rule bg-paper-raised px-3 py-2.5 text-[13px] text-ink-soft"
				>
					Your session ended. Sign in again to carry on.
				</p>
			)}

			<TextField
				label="Email"
				name="email"
				type="email"
				autoComplete="username"
				value={fields.email}
				error={errors.email}
				disabled={isSubmitting}
				onChange={(event) => {
					setFields((current) => ({ ...current, email: event.target.value }));
					setErrors((current) => ({ ...current, email: "", form: "" }));
				}}
			/>
			<TextField
				label="Password"
				name="password"
				type="password"
				autoComplete="current-password"
				value={fields.password}
				error={errors.password}
				disabled={isSubmitting}
				onChange={(event) => {
					setFields((current) => ({ ...current, password: event.target.value }));
					setErrors((current) => ({ ...current, password: "", form: "" }));
				}}
			/>

			{errors.form && (
				<p role="alert" className="text-[13px] text-signal">
					{errors.form}
				</p>
			)}

			<Button type="submit" disabled={isSubmitting}>
				{isSubmitting ? "Signing in…" : "Sign in"}
			</Button>

			<Link to="/forgot-password" className="eyebrow text-center text-ink-faint hover:text-ink">
				Forgot your password?
			</Link>
		</form>
	);
}
