import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.built.config";

/** The built shell, production CSP and offline paths on the second engine (XP-58). */
export default defineConfig({
	...base,
	projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
});
