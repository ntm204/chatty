import { fileURLToPath, URL } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		{
			name: "chatty-offline-shell",
			apply: "build",
			enforce: "post",
			generateBundle(_options, bundle) {
				const paths = [
					"/theme.js",
					"/favicon.svg",
					...Object.keys(bundle)
						.filter((path) => path !== "index.html")
						.map((path) => `/${path}`),
				];
				const version = createHash("sha256")
					.update(JSON.stringify(bundle))
					.update(readFileSync(fileURLToPath(new URL("./public/theme.js", import.meta.url))))
					.digest("hex")
					.slice(0, 16);
				const html = bundle["index.html"];
				if (!html || html.type !== "asset") throw new Error("Offline shell requires the generated HTML");
				const source = readFileSync(fileURLToPath(new URL("./public/sw.js", import.meta.url)), "utf8")
					.replace('"__SHELL_VERSION__"', JSON.stringify(version))
					.replace('"__SHELL_HTML__"', () => JSON.stringify(String(html.source)))
					.replace('["__SHELL_ASSETS__"]', JSON.stringify(paths));
				this.emitFile({ type: "asset", fileName: "sw.js", source });
			},
		},
	],
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
