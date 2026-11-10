/**
 * Three head-and-shoulders figures in `currentColor`, filling their box: the
 * group counterpart of `SilhouetteIcon`, drawn to the same proportions so a
 * group and a person sit side by side in the list as one family.
 */
export function GroupSilhouetteIcon() {
	return (
		<svg aria-hidden="true" viewBox="0 0 40 40" className="size-full" fill="currentColor">
			<circle cx="10" cy="17.5" r="4.4" />
			<path d="M1 40c.3-6.6 3.9-10.6 9-10.6 2.1 0 3.9.6 5.3 1.7C13.4 33.4 12.4 36.5 12.3 40z" />
			<circle cx="30" cy="17.5" r="4.4" />
			<path d="M39 40c-.3-6.6-3.9-10.6-9-10.6-2.1 0-3.9.6-5.3 1.7 1.9 2.3 2.9 5.4 3 8.9z" />
			<circle cx="20" cy="15.2" r="5.6" />
			<path d="M9.4 40c.4-7.6 4.7-12.2 10.6-12.2S30.2 32.4 30.6 40z" />
		</svg>
	);
}
