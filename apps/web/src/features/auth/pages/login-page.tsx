import { useState } from "react";
import { Button } from "@/components/button";
import { AuthCard, LoginForm, RegisterForm } from "../components";

export function LoginPage() {
	const [mode, setMode] = useState<"login" | "register">("login");
	const isLogin = mode === "login";

	return (
		<AuthCard
			title={isLogin ? "Sign in" : "Create an account"}
			description={
				isLogin ? "Your people are just a hello away. Welcome back!" : "Pick a handle people can find you by."
			}
		>
			{isLogin ? <LoginForm /> : <RegisterForm />}

			<Button variant="ghost" className="mt-5 w-full" onClick={() => setMode(isLogin ? "register" : "login")}>
				{isLogin ? "No account? Create one" : "Already have an account? Sign in"}
			</Button>
		</AuthCard>
	);
}
