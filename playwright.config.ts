import { defineConfig, devices } from "@playwright/test";
import { E2E_WORKERS, e2eApiUrl, e2eDatabaseUrl, e2eUploadDir, e2eWebUrl } from "./e2e/database.js";

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

/**
 * This worker's web server. The config is re-loaded inside each worker after
 * Playwright sets its slot, so every worker gets its own `baseURL` here. Worker 0
 * keeps 4100/5273, so the built-asset configs (which replace the web server with
 * a preview fixed to those ports) still line up with it.
 */
export const WEB_URL = e2eWebUrl();

/** One API server per worker, each on its own port, database and upload directory. */
function serverEnv(worker: number) {
	return {
		DATABASE_URL: e2eDatabaseUrl(worker),
		JWT_SECRET: "e2e-secret-not-used-anywhere-real",
		PORT: new URL(e2eApiUrl(worker)).port,
		CORS_ORIGIN: e2eWebUrl(worker),
		PUBLIC_URL: e2eApiUrl(worker),
		// Its own upload directory, for the same reason as the database.
		UPLOAD_DIR: e2eUploadDir(worker),
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
}

/**
 * API then web for each worker, worker 0 first: the derived configs read
 * `webServer[0]` as the API and `webServer[1]` as the web server. Playwright
 * starts these one after another, so the Vite servers never pre-bundle into
 * their shared cache at the same moment.
 */
const workerServers = Array.from({ length: E2E_WORKERS }, (_, worker) => [
	{
		command: "npm run dev --workspace apps/server",
		url: `${e2eApiUrl(worker)}/health`,
		env: serverEnv(worker),
		// Never reuse: a server already listening on this port is one whose
		// environment nobody here chose.
		reuseExistingServer: false,
		timeout: 60_000,
	},
	{
		command: `npm run dev --workspace apps/web -- --port ${new URL(e2eWebUrl(worker)).port} --strictPort`,
		url: e2eWebUrl(worker),
		env: { VITE_API_URL: e2eApiUrl(worker) },
		reuseExistingServer: false,
		timeout: 60_000,
	},
]).flat();

export default defineConfig({
	testDir: "./e2e",
	testIgnore: ["**/production-media.spec.ts", "**/performance-measurement.spec.ts"],
	// A plain relative path, resolved against this file. `import.meta.url` would
	// read better and does not work: the root package.json has no `"type":
	// "module"`, so Playwright transpiles this config to CommonJS before running it.
	globalSetup: "./e2e/global-setup.ts",
	// One file per worker at a time, and never two workers on one server: each has
	// its own API, web server and database (see e2e/database.ts), so a "who is
	// online" assertion cannot depend on which other spec has a browser open.
	// Tests inside a file stay serial — they share accounts and sockets.
	workers: E2E_WORKERS,
	fullyParallel: false,
	// A retry hides a race rather than fixing one, and a realtime app is made of
	// races. A flake here is a finding.
	retries: 0,
	globalTimeout: 840_000,
	maxFailures: process.env.CI ? 0 : 3,
	reporter: [["list"]],
	use: {
		baseURL: WEB_URL,
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				// Playwright launches Chromium with smooth scrolling off, so every
				// `behavior: "smooth"` landed in one frame and the glide to the latest
				// message (phase 53) could not be observed or interrupted.
				launchOptions: { args: ["--enable-smooth-scrolling"] },
			},
		},
	],
	webServer: workerServers,
});
