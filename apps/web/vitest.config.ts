import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Separate from vite.config.ts so the dev/build config stays free of test
 * concerns. The alias is repeated rather than imported because both files must
 * resolve `@/` on their own — Vitest does not read the app's vite config here.
 */
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		// Browser storage belongs to jsdom. Newer Node globals otherwise shadow it with
		// process-level storage (or undefined when no --localstorage-file is supplied).
		execArgv: process.allowedNodeEnvironmentFlags.has("--no-experimental-webstorage")
			? ["--no-experimental-webstorage"]
			: [],
		// Bound memory locally; CI can spend the isolated runner on the complete suite.
		maxWorkers: process.env.VITEST_MAX_WORKERS
			? Number(process.env.VITEST_MAX_WORKERS)
			: process.env.CI
				? undefined
				: 2,
		// Components touch the DOM; jsdom gives them one without a browser.
		environment: "jsdom",
		globals: true,
		setupFiles: ["./tests/setup.ts"],
		// Config and dependency changes can affect every test without being part of
		// a runtime import graph, so changed-file mode must widen for them.
		forceRerunTriggers: [
			"**/package-lock.json",
			"**/package.json",
			"**/tsconfig*.json",
			"**/vitest.config.*",
			"**/tests/setup.ts",
		],
	},
});
