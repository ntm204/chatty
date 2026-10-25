import { useState } from "react";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { useAuth } from "@/hooks/use-auth";
import { HANDLE_PATTERN, MAX_HANDLE_LENGTH, MIN_HANDLE_LENGTH, MIN_PASSWORD_LENGTH } from "@/constants/validation";
import { focusField } from "@/utils/focus-field";
import { getServerErrorField } from "@/utils/server-error-field";

export function RegisterForm() {
	const register = useAuth((state) => state.register);
	const [fields, setFields] = useState({ email: "", password: "", handle: "", displayName: "" });
	const [errors, setErrors] = useState({ email: "", password: "", handle: "", displayName: "", form: "" });
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Editing a field clears its own error and any server message about the whole form.
	function update(field: keyof typeof fields, value: string) {
		setFields((current) => ({ ...current, [field]: value }));
		setErrors((current) => ({ ...current, [field]: "", form: "" }));
	}

	function validate(form: HTMLFormElement) {
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
		// In the order the fields appear, so focus lands on the first thing to fix.
		focusField(
			form,
			(["displayName", "handle", "email", "password"] as const).find((field) => nextErrors[field]) ?? null,
		);

		return !nextErrors.email && !nextErrors.password && !nextErrors.handle && !nextErrors.displayName;
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		if (isSubmitting || !validate(form)) return;

		setIsSubmitting(true);
		try {
			await register({
				email: fields.email.trim(),
				password: fields.password,
				handle: fields.handle.trim().toLowerCase(),
				displayName: fields.displayName.trim(),
			});
		} catch (error) {
			const message = (error as Error).message;
			const field = getServerErrorField(message, { email: "email", handle: "handle" });
			setErrors((current) => ({ ...current, [field ?? "form"]: message }));
			focusField(form, field);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} aria-busy={isSubmitting} className="flex flex-col gap-4">
			<TextField
				label="Display name"
				name="displayName"
				autoComplete="name"
				value={fields.displayName}
				error={errors.displayName}
				disabled={isSubmitting}
				onChange={(event) => update("displayName", event.target.value)}
			/>
			{/* "nickname", not "username": sign-in is by email, which is the login a
			    password manager should save. */}
			<TextField
				label="Handle"
				name="handle"
				autoComplete="nickname"
				placeholder="minh"
				value={fields.handle}
				error={errors.handle}
				disabled={isSubmitting}
				onChange={(event) => update("handle", event.target.value)}
			/>
			<TextField
				label="Email"
				name="email"
				type="email"
				autoComplete="username"
				value={fields.email}
				error={errors.email}
				disabled={isSubmitting}
				onChange={(event) => update("email", event.target.value)}
			/>
			<TextField
				label="Password"
				name="password"
				type="password"
				autoComplete="new-password"
				value={fields.password}
				error={errors.password}
				disabled={isSubmitting}
				onChange={(event) => update("password", event.target.value)}
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
