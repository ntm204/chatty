import { useState } from "react";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { useAuth } from "@/hooks/use-auth";
import { HANDLE_PATTERN, MAX_HANDLE_LENGTH, MIN_HANDLE_LENGTH, MIN_PASSWORD_LENGTH } from "@/constants/validation";

export function RegisterForm() {
	const register = useAuth((state) => state.register);
	const [fields, setFields] = useState({ email: "", password: "", handle: "", displayName: "" });
	const [errors, setErrors] = useState({ email: "", password: "", handle: "", displayName: "", form: "" });
	const [isSubmitting, setIsSubmitting] = useState(false);

	function validate() {
		const nextErrors = { email: "", password: "", handle: "", displayName: "", form: "" };
		// Lowercased here as well as on the server, so what is validated is what
		// gets stored — the server normalises too, and the two must agree.
		const handle = fields.handle.trim().toLowerCase();

		if (!fields.displayName.trim()) nextErrors.displayName = "Display name is required";
		if (!fields.email.trim()) nextErrors.email = "Email is required";

		if (handle.length < MIN_HANDLE_LENGTH || handle.length > MAX_HANDLE_LENGTH) {
			nextErrors.handle = `Handle must be ${MIN_HANDLE_LENGTH}–${MAX_HANDLE_LENGTH} characters`;
		} else if (!HANDLE_PATTERN.test(handle)) {
			nextErrors.handle = "Start with a letter; letters, numbers and underscores only";
		}

		if (fields.password.length < MIN_PASSWORD_LENGTH) {
			nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
		}

		setErrors(nextErrors);

		return !nextErrors.email && !nextErrors.password && !nextErrors.handle && !nextErrors.displayName;
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!validate()) return;

		setIsSubmitting(true);
		try {
			await register({
				email: fields.email.trim(),
				password: fields.password,
				handle: fields.handle.trim().toLowerCase(),
				displayName: fields.displayName.trim(),
			});
		} catch (error) {
			setErrors((current) => ({ ...current, form: (error as Error).message }));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<TextField
				label="Display name"
				autoComplete="name"
				value={fields.displayName}
				error={errors.displayName}
				onChange={(event) => setFields((current) => ({ ...current, displayName: event.target.value }))}
			/>
			<TextField
				label="Handle"
				autoComplete="username"
				placeholder="minh"
				value={fields.handle}
				error={errors.handle}
				onChange={(event) => setFields((current) => ({ ...current, handle: event.target.value }))}
			/>
			<TextField
				label="Email"
				type="email"
				autoComplete="email"
				value={fields.email}
				error={errors.email}
				onChange={(event) => setFields((current) => ({ ...current, email: event.target.value }))}
			/>
			<TextField
				label="Password"
				type="password"
				autoComplete="new-password"
				value={fields.password}
				error={errors.password}
				onChange={(event) => setFields((current) => ({ ...current, password: event.target.value }))}
			/>

			{errors.form && (
				<p role="alert" className="text-[13px] text-signal">
					{errors.form}
				</p>
			)}

			<Button type="submit" disabled={isSubmitting}>
				{isSubmitting ? "Creating account…" : "Create account"}
			</Button>
		</form>
	);
}
