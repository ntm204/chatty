import type { PalettePreviewColors } from "@/types/theme";
import { cn } from "@/utils/cn";

interface ThemePreviewProps {
	colors: PalettePreviewColors;
	className?: string;
}

/**
 * A thumbnail of the chat screen in one palette and mode: a panel, a received
 * bubble, your bubble and the call to action — the four things a palette
 * changes that a reader recognises at a glance.
 *
 * Inline colours rather than tokens on purpose: a card has to draw a palette
 * that is not the one applied, and the tokens only ever hold the applied one.
 */
export function ThemePreview({ colors, className }: ThemePreviewProps) {
	return (
		<span
			aria-hidden="true"
			className={cn("flex size-full flex-col gap-1.5 p-2", className)}
			style={{ background: colors.panel }}
		>
			<span className="flex flex-1 flex-col gap-1.5 rounded-[8px] p-2" style={{ background: colors.page }}>
				<span className="h-1 w-8 rounded-full opacity-70" style={{ background: colors.ink }} />
				<span className="mt-auto flex flex-col gap-1">
					<span className="h-2.5 w-3/5 rounded-full" style={{ background: colors.incoming }} />
					<span className="h-2.5 w-2/5 self-end rounded-full" style={{ background: colors.mine }} />
					<span className="h-2.5 w-1/2 rounded-full" style={{ background: colors.incoming }} />
				</span>
				<span className="flex items-center gap-1">
					<span className="h-2.5 flex-1 rounded-full" style={{ background: colors.incoming }} />
					<span className="size-2.5 shrink-0 rounded-full" style={{ background: colors.accent }} />
				</span>
			</span>
		</span>
	);
}
