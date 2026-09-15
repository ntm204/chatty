import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const servers = Array.isArray(base.webServer) ? base.webServer : [];

/** Same test API/database; built assets with the exact production CSP instead of Vite dev. */
export default defineConfig({
	...base,
	testMatch: "**/production-media.spec.ts",
	testIgnore: [],
	webServer: [
		servers[0]!,
		{
			command: "node scripts/preview-built-web.mjs",
			url: "http://localhost:5273",
			reuseExistingServer: false,
			timeout: 120_000,
		},
	],
});
