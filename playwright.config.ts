import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./e2e/database.js";

/**
 * End-to-end tests: a real browser, against a real server, against a real
 * database.
 *
 * These exist because the two suites below them cannot see the thing this app
 * is actually for. A service test proves what `sendMessage` asks the socket
 * layer to broadcast; a component test proves what `MessageList` renders given
 * an array. Neither can answer "does a message typed by one person appear on
 * another person's screen", which is the entire product — and which has broken
 * twice in this project's history in ways every green test missed.
 *
 * Until now that gap was covered by scripts written, run, and deleted by hand.
 */

const API_PORT = 4100;
const WEB_PORT = 5273;

/**
 * Deliberately not 4000/5173. A developer usually has the dev servers running,
 * and an e2e run that quietly attached to them would drive tests against the
 * dev database — the one thing `e2e/global-setup.ts` truncates.
 */
export const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;

const serverEnv = {
	DATABASE_URL: E2E_DATABASE_URL,
	JWT_SECRET: "e2e-secret-not-used-anywhere-real",
	PORT: String(API_PORT),
	CORS_ORIGIN: WEB_URL,
	PUBLIC_URL: API_URL,
	// Its own upload directory, for the same reason as the database.
	UPLOAD_DIR: ".data/e2e-uploads",
	// "test" switches the rate limiters off, and that is the right trade here.
	//
	// It was "development" first, so the browser would meet the same middleware a
	// user does. What that actually bought was a ceiling: `/auth/register` allows
	// 10 per hour per IP and every spec registers its own accounts, so the suite
	// could hold about eight tests before the ninth started failing on a 429 that
	// from inside the browser looks like a sign-up form which simply does not
	// submit. No spec ever asserted a limit, so the coverage was imaginary and the
	// trap was real. The limiters are exercised by hand instead — see the roadmap,
	// phase 3 item 9.
	NODE_ENV: "test",
	// No SMTP container is required to run this suite, and no spec reads a
	// mailbox. `console` keeps the browser tests independent of whether Mailpit
	// happens to be up — and `MAIL_TRANSPORT` has no default, so leaving it out
	// would stop the server booting at all.
	MAIL_TRANSPORT: "console",
};

export default defineConfig({
	testDir: "./e2e",
	testIgnore: ["**/production-media.spec.ts", "**/performance-measurement.spec.ts"],
	// A plain relative path, resolved against this file. `import.meta.url` would
	// read better and does not work: the root package.json has no `"type":
	// "module"`, so Playwright transpiles this config to CommonJS before running it.
	globalSetup: "./e2e/global-setup.ts",
	// One at a time. The specs share one database and one server; running them in
	// parallel would make a "who is online" assertion depend on which other spec
	// happened to have a browser open.
	workers: 1,
	fullyParallel: false,
	// A retry hides a race rather than fixing one, and a realtime app is made of
	// races. A flake here is a finding.
	retries: 0,
	reporter: [["list"]],
	use: {
		baseURL: WEB_URL,
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			command: "npm run dev --workspace apps/server",
			url: `${API_URL}/health`,
			env: serverEnv,
			// Never reuse: a server already listening on this port is one whose
			// environment nobody here chose.
			reuseExistingServer: false,
			timeout: 60_000,
		},
		{
			command: `npm run dev --workspace apps/web -- --port ${WEB_PORT} --strictPort`,
			url: WEB_URL,
			env: { VITE_API_URL: API_URL },
			reuseExistingServer: false,
			timeout: 60_000,
		},
	],
});
