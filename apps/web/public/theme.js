/*
 * Resolves the stored theme and stamps it on <html> before the first paint.
 *
 * A file rather than an inline <script>, and that is the whole reason it exists
 * separately: `nginx.conf.template` sets `script-src 'self'` with no
 * `'unsafe-inline'`, and the comment above that policy is explicit that adding
 * `'unsafe-inline'` would make the rest of it decorative. A theme is not worth
 * that. Served from this origin, it is allowed as it stands.
 *
 * It has to be a *blocking* classic script in <head>, after the stylesheet: a
 * module script is deferred, so the page would paint in light and jump. That
 * jump is the entire problem this file solves, and it is worth one extra request
 * (~400 bytes, and `location /` in nginx lets the browser revalidate rather than
 * re-download it).
 *
 * Not bundled, so `chatty:theme` is written here as a literal. `src/constants/theme.ts`
 * holds the same string and points back at this file — the two must not drift.
 *
 * It stamps the palette too (`chatty:palette`, see `src/constants/theme.ts`):
 * every palette repaints the same tokens, so it has to land before the first
 * paint for the same reason — but only with a stored session, because the
 * sign-in screens always use the default palette.
 *
 * The preference is one of "light", "dark" or "system"; what lands on the
 * element is always "light" or "dark". Resolving here rather than in CSS is why
 * `globals.css` needs a single `[data-theme="dark"]` block instead of that block
 * plus a `prefers-color-scheme` copy of it kept in sync by hand.
 */
(function () {
	var stored = null;

	try {
		stored = localStorage.getItem("chatty:theme");
	} catch {
		// Private modes and blocked site data throw on access rather than
		// returning null. Fall through to the system preference.
	}

	var prefersDark =
		typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;

	document.documentElement.dataset.theme =
		stored === "dark" || (stored !== "light" && prefersDark) ? "dark" : "light";

	// A chosen palette applies inside the app only; signed out (no stored
	// session) the sign-in screens keep the default. `App` keeps it in step.
	var palette = "ink";
	try {
		if (localStorage.getItem("chatty:token")) palette = localStorage.getItem("chatty:palette") || "ink";
	} catch {
		// Same as above: the default palette.
	}
	// Unknown values match no palette selector, so they draw the default.
	document.documentElement.dataset.palette = palette;
})();
