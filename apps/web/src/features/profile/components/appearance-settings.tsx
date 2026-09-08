import { Check } from "lucide-react";
import { Button } from "@/components/button";
import { THEME_OPTIONS } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/utils/cn";

/**
 * Picks the theme, and shows what each one is rather than naming it twice.
 *
 * Every row carries a swatch drawn from the fixed `swatch-*` tokens instead of
 * the live palette — a preview of Dark has to look dark while the dialog around
 * it is light, which is the one case in this app where a colour must not follow
 * the theme. System shows both halves against a diagonal seam, because "follow
 * the device" has no single appearance to preview and pretending otherwise would
 * be a swatch that is wrong half the time.
 *
 * The choice applies on click with nothing to save. There is no server round
 * trip and no failure mode, so a Save button would be a second click asking
 * permission for something the reader can already see happened.
 */
export function AppearanceSettings() {
	const preference = useTheme((state) => state.preference);
	const resolved = useTheme((state) => state.resolved);
	const setPreference = useTheme((state) => state.setPreference);

	return (
		<div className="appearance-settings flex flex-col gap-4">
			<p className="text-[13px] text-ink-soft">
				Light, dark, or in sync with your device. Choose how Chatty feels to you. This preference stays on this
				device.
			</p>

			<div role="radiogroup" aria-label="Theme" className="flex flex-col gap-2">
				{THEME_OPTIONS.map((option) => {
					const isSelected = option.id === preference;

					return (
						<Button
							key={option.id}
							variant="ghost"
							role="radio"
							aria-checked={isSelected}
							onClick={() => setPreference(option.id)}
							className={cn(
								"w-full justify-start gap-3.5 rounded-control border px-3 py-3 text-left",
								isSelected
									? "border-ink bg-paper-raised text-ink"
									: "border-rule text-ink-soft hover:border-rule hover:bg-paper-raised hover:text-ink",
							)}
						>
							{/* Two halves of a rounded square, split down the middle. For
							    System both halves show, which is the honest preview: it is
							    whichever one the device says at the time. */}
							<span
								aria-hidden="true"
								className="flex size-9 shrink-0 overflow-hidden rounded-control border border-rule"
							>
								{option.id !== "dark" && (
									<span className="flex flex-1 items-center justify-center bg-swatch-light">
										<span className="h-1.5 w-4 rounded-full bg-swatch-light-ink" />
									</span>
								)}
								{option.id !== "light" && (
									<span className="flex flex-1 items-center justify-center bg-swatch-dark">
										<span className="h-1.5 w-4 rounded-full bg-swatch-dark-ink" />
									</span>
								)}
							</span>

							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="flex items-center gap-2 text-[13.5px] font-semibold">
									<option.icon aria-hidden="true" className="size-3.5 shrink-0" />
									{option.label}
								</span>
								<span className="text-[12.5px] font-normal leading-snug text-ink-faint">
									{option.description}
								</span>
							</span>

							{isSelected && <Check aria-hidden="true" className="size-4 shrink-0 text-signal" />}
						</Button>
					);
				})}
			</div>

			{/* Stated only for System, where the row's own label cannot say it: the
			    other two rows already name exactly what is on screen. */}
			{preference === "system" && (
				<p role="status" className="eyebrow text-ink-faint">
					Currently {resolved}
				</p>
			)}
		</div>
	);
}
