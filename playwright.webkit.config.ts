import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/** A second browser engine for the everyday acceptance paths. */
export default defineConfig({
	...base,
	projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
});
