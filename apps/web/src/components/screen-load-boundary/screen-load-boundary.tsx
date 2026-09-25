import { Component, Suspense, type ReactNode } from "react";
import { Button } from "@/components/button";

interface ScreenLoadBoundaryProps {
	children: ReactNode;
}

/** A missing deployment chunk must offer recovery instead of a blank screen. */
export class ScreenLoadBoundary extends Component<ScreenLoadBoundaryProps> {
	override state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	override render() {
		if (this.state.hasError) {
			return (
				<div
					role="alert"
					className="flex min-h-32 flex-col items-center justify-center gap-3 bg-paper p-6 text-sm text-ink"
				>
					<p>This screen couldn’t load.</p>
					<Button onClick={() => window.location.reload()}>Reload</Button>
				</div>
			);
		}

		return (
			<Suspense
				fallback={
					<p role="status" className="p-6 text-sm text-ink-soft">
						Loading…
					</p>
				}
			>
				{this.props.children}
			</Suspense>
		);
	}
}
