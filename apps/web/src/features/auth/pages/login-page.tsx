import { useCallback, useState } from "react";
import { Button } from "@/components/button";
import { AuthCard, LoginForm, RegisterForm, WelcomeIntro } from "../components";
import { shouldShowWelcome } from "../utils/welcome-intro";

export function LoginPage() {
	const [mode, setMode] = useState<"login" | "register">("login");
	const isLogin = mode === "login";
	const [isWelcoming, setIsWelcoming] = useState(shouldShowWelcome);
	const finishWelcome = useCallback(() => setIsWelcoming(false), []);

	return (
		<>
			<div
				className={isWelcoming ? "login-reveal" : undefined}
				aria-hidden={isWelcoming || undefined}
				ref={(element) => element?.toggleAttribute("inert", isWelcoming)}
			>
				<AuthCard
					onCreateAccount={() => setMode("register")}
					title={isLogin ? "Sign in" : "Create an account"}
					description={
						isLogin
							? "Your people are just a hello away. Welcome back!"
							: "Pick a handle people can find you by."
					}
				>
					{isLogin ? <LoginForm /> : <RegisterForm />}

					<Button
						variant="ghost"
						className="mt-5 w-full"
						onClick={() => setMode(isLogin ? "register" : "login")}
					>
						{isLogin ? "No account? Create one" : "Already have an account? Sign in"}
					</Button>
				</AuthCard>
			</div>
			{isWelcoming && <WelcomeIntro onComplete={finishWelcome} />}
		</>
	);
}
