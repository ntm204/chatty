import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		// `@/` -> apps/web/src. Keep in sync with the `paths` entry in tsconfig.json:
		// Vite resolves at build time, TypeScript resolves at type-check time, and
		// they do not read each other's config.
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		port: 5173,
		// The API allows this exact origin. A silent port fallback breaks that contract.
		strictPort: true,
	},
});
