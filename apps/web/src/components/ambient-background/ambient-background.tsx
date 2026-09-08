/** A static, low-contrast wash stays out of layout and never moves behind text. */
export function AmbientBackground() {
	return <div className="ambient-background" aria-hidden="true" />;
}
