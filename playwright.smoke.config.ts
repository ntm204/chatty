import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Reuse real core scenarios: realtime, search, media, send recovery and durable replay. */
export default defineConfig({
	...base,
	testMatch: ["**/chat.spec.ts", "**/sending.spec.ts", "**/outbox-tabs.spec.ts"],
	globalTimeout: 150_000,
	maxFailures: 1,
});
