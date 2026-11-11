import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL, TEST_WORKERS } from "./tests/test-database-url.js";

/**
 * Tests run against a separate database on the same Postgres instance as dev.
 * Injected here rather than read from .env so the suite cannot silently run
 * against the dev database — and tests/setup.ts refuses to start if the name
 * does not end in `_test`.
 */
export default defineConfig({
	test: {
		environment: "node",
		env: {
			DATABASE_URL: TEST_DATABASE_URL,
			JWT_SECRET: "test-secret",
			CORS_ORIGIN: "http://localhost:5173",
			NODE_ENV: "test",
			// Its own directory, for the same reason as the database above: the
			// avatar tests write and delete files, and pointing them at the dev
			// upload directory would delete pictures uploaded by hand while testing.
			UPLOAD_DIR: ".data/test-uploads",
			// Pinned rather than left to the default, so a test asserting the shape
			// of an avatar URL does not silently depend on how the dev app is served.
			PUBLIC_URL: "http://api.test",
			// The suite spies on `mailer.send` and never lets a real one run, so the
			// transport only has to be a valid choice. `console` is that, and it
			// cannot accidentally reach a network — an `smtp` value here would mean
			// a mistake in a test opens a socket to whatever the URL pointed at.
			MAIL_TRANSPORT: "console",
			METRICS_TOKEN: "test-metrics-token-at-least-32-characters",
		},
		globalSetup: ["./tests/global-setup.ts"],
		setupFiles: ["./tests/setup.ts"],
		// Changed-file mode follows static imports. These files shape every test
		// without necessarily appearing in that graph, so touching one deliberately
		// escalates the fast local check to the complete server suite.
		forceRerunTriggers: [
			"**/package-lock.json",
			"**/package.json",
			"**/tsconfig*.json",
			"**/vitest.config.*",
			"**/prisma/schema.prisma",
			"**/prisma/migrations/**",
			"**/tests/global-setup.ts",
			"**/tests/setup.ts",
		],
		// Files run side by side, one worker per cloned database (see
		// tests/global-setup.ts); tests within a file still run in order.
		maxWorkers: TEST_WORKERS,
	},
});
