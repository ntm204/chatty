const SHELL_CACHE = `chatty-shell-${"__SHELL_VERSION__"}`;
const SHELL_ASSETS = ["__SHELL_ASSETS__"];
const SHELL_HTML = "__SHELL_HTML__";

// A failed install never replaces the active shell. Each build keeps its HTML
// and complete hashed asset set together, including lazy chunks and fonts.
self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			const cache = await self.caches.open(SHELL_CACHE);
			await cache.addAll(SHELL_ASSETS.map((path) => new self.Request(path, { cache: "reload" })));
			// Reject a deployment race instead of mixing the next release's HTML
			// with these assets. Keep the original response, including its CSP.
			const html = await self.fetch(new self.Request("/", { cache: "reload" }));
			if (!html.ok || (await html.clone().text()) !== SHELL_HTML)
				throw new Error("Shell build changed during install");
			await cache.put("/", html);
		})(),
	);
});

// Activate after the previous app's tabs close. No forced reload interrupts a
// recording, upload or draft, and no old tab loses its assets mid-session.
self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keys = await self.caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith("chatty-shell-") && key !== SHELL_CACHE)
					.map((key) => self.caches.delete(key)),
			);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	const url = new URL(request.url);
	if (request.method !== "GET" || url.origin !== self.location.origin) return;
	if (request.mode === "navigate") {
		event.respondWith(
			(async () => {
				const cache = await self.caches.open(SHELL_CACHE);
				return (await cache.match("/")) ?? self.fetch(request);
			})(),
		);
		return;
	}
	if (SHELL_ASSETS.includes(url.pathname)) {
		event.respondWith(
			(async () => {
				const cache = await self.caches.open(SHELL_CACHE);
				// Build assets are public and immutable. A module's Origin header
				// differs from the install fetch on servers using Vary: Origin.
				return (await cache.match(request, { ignoreVary: true })) ?? self.fetch(request);
			})(),
		);
	}
});
