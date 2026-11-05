import { X } from "lucide-react";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";
import { KEYBOARD_SHORTCUTS } from "../constants/keyboard-shortcuts";

interface KeyboardShortcutsPanelProps {
	onClose: () => void;
}

export function KeyboardShortcutsPanel({ onClose }: KeyboardShortcutsPanelProps) {
	const dialogRef = useDialog<HTMLDivElement>(onClose);

	return (
		<div
			ref={dialogRef}
			tabIndex={-1}
			className="absolute inset-0 z-50 flex items-center justify-center bg-scrim/20 p-4 dark:bg-scrim/50"
			role="dialog"
			aria-modal="true"
			aria-label="Keyboard shortcuts"
		>
			<div className="w-full max-w-sm rounded-bubble border border-rule bg-paper-raised p-4 shadow-lift">
				<div className="mb-3 flex items-center">
					<h2 className="flex-1 text-sm font-semibold">Keyboard shortcuts</h2>
					<Button variant="ghost" onClick={onClose} aria-label="Close shortcuts" className="size-7 p-0">
						<X className="size-4" />
					</Button>
				</div>
				<dl className="flex flex-col gap-2">
					{KEYBOARD_SHORTCUTS.map((shortcut) => (
						<div
							key={shortcut.keys}
							className="flex items-center justify-between gap-4 border-t border-rule-soft pt-2"
						>
							<dt className="text-xs text-ink-soft">{shortcut.description}</dt>
							<dd className="meta shrink-0 rounded-control border border-rule px-2 py-1 text-ink">
								{shortcut.keys}
							</dd>
						</div>
					))}
				</dl>
			</div>
		</div>
	);
}
