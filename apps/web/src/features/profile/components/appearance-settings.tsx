import { Check } from "lucide-react";
import { Button } from "@/components/button";
import { PALETTE_OPTIONS, THEME_OPTIONS } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/utils/cn";
import { ThemePreview } from "./theme-preview";

/**
 * Settings → Appearance: how Chatty looks, in two independent choices, after
 * the layout of Claude's own appearance settings.
 *
 * **Mode** — Light, System or Dark, each a card drawing the chat screen in the
 * current palette. System's card is split down the middle, which is the honest
 * preview: it is whichever one the device says at the time.
 *
 * **Palette** — the colour family, each card drawn in the mode on screen now,
 * so the reader compares palettes rather than a palette against a mode.
 *
 * Both stay on this device, like every other appearance preference.
 */
export function AppearanceSettings() {
	const preference = useTheme((state) => state.preference);
	const resolved = useTheme((state) => state.resolved);
	const setPreference = useTheme((state) => state.setPreference);
	const palette = useTheme((state) => state.palette);
	const setPalette = useTheme((state) => state.setPalette);
	const current = PALETTE_OPTIONS.find((option) => option.id === palette) ?? PALETTE_OPTIONS[0]!;

	return (
		<div className="appearance-settings flex flex-col gap-7">
			<section className="flex flex-col gap-3">
				<div>
					<h3 className="text-[14px] font-semibold text-ink">Mode</h3>
					<p className="text-[13px] text-ink-faint">Light, dark, or in step with your device.</p>
				</div>
				<div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
					{THEME_OPTIONS.map((option) => {
						const isSelected = option.id === preference;

						return (
							<Button
								key={option.id}
								variant="ghost"
								role="radio"
								aria-checked={isSelected}
								aria-description={option.description}
								onClick={() => setPreference(option.id)}
								className="flex-col items-stretch gap-2 p-0 text-left hover:bg-transparent"
							>
								<span
									className={cn(
										"relative flex aspect-[4/3] overflow-hidden rounded-control ring-1 transition",
										isSelected ? "ring-2 ring-ink" : "ring-rule hover:ring-ink-faint",
									)}
								>
									{option.id !== "dark" && (
										<ThemePreview colors={current.preview.light} className="min-w-0 flex-1" />
									)}
									{option.id !== "light" && (
										<ThemePreview colors={current.preview.dark} className="min-w-0 flex-1" />
									)}
								</span>
								<span className="flex items-center gap-1.5 px-0.5 text-[13px] font-medium text-ink">
									<option.icon aria-hidden="true" className="size-3.5 shrink-0 text-ink-faint" />
									{option.label}
								</span>
							</Button>
						);
					})}
				</div>
				{/* Stated only for System, where the card cannot say it: the other two
				    already name exactly what is on screen. */}
				{preference === "system" && (
					<p role="status" className="note text-ink-faint">
						Currently {resolved}
					</p>
				)}
			</section>

			<section className="flex flex-col gap-3">
				<div>
					<h3 className="text-[14px] font-semibold text-ink">Palette</h3>
					<p className="text-[13px] text-ink-faint">The colours Chatty is painted in. Each has both modes.</p>
				</div>
				<div role="radiogroup" aria-label="Palette" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{PALETTE_OPTIONS.map((option) => {
						const isSelected = option.id === palette;

						return (
							<Button
								key={option.id}
								variant="ghost"
								role="radio"
								aria-checked={isSelected}
								aria-description={option.description}
								onClick={() => setPalette(option.id)}
								className="flex-col items-stretch gap-2 p-0 text-left hover:bg-transparent"
							>
								<span
									className={cn(
										"relative flex aspect-[4/3] overflow-hidden rounded-control ring-1 transition",
										isSelected ? "ring-2 ring-ink" : "ring-rule hover:ring-ink-faint",
									)}
								>
									<ThemePreview colors={option.preview[resolved]} />
									{isSelected && (
										<span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-ink text-paper-raised">
											<Check aria-hidden="true" className="size-3" />
										</span>
									)}
								</span>
								<span className="flex flex-col px-0.5">
									<span className="text-[13px] font-medium text-ink">{option.label}</span>
									<span className="text-[12px] font-normal text-ink-faint">{option.description}</span>
								</span>
							</Button>
						);
					})}
				</div>
			</section>
		</div>
	);
}
