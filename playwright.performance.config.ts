import { defineConfig } from "@playwright/test";
import base from "./playwright.built.config";

const servers = Array.isArray(base.webServer) ? base.webServer : [];

/** Isolated E2E database, compiled server and built browser assets; never the dev API. */
export default defineConfig({
	...base,
	testMatch: "**/performance-measurement.spec.ts",
	timeout: 300_000,
	use: { ...base.use, actionTimeout: 15_000 },
	webServer: [
		{ ...servers[0]!, command: "npm run build --workspace apps/server && npm run start --workspace apps/server" },
		servers[1]!,
	],
});
