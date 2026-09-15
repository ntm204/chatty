import { readFile } from "node:fs/promises";
import process from "node:process";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { preview } from "vite";

const apiOrigin = "http://localhost:4100";
const build = spawn("npm", ["run", "build", "--workspace", "apps/web"], {
	stdio: "inherit",
	env: { ...process.env, VITE_API_URL: apiOrigin },
	shell: process.platform === "win32",
});
const exitCode = await new Promise((resolveExit, reject) => {
	build.on("error", reject);
	build.on("exit", resolveExit);
});
if (exitCode !== 0) process.exit(exitCode ?? 1);

// Use the deployed policy itself, so a preview-only allowance cannot hide a regression.
const template = await readFile("apps/web/nginx.conf.template", "utf8");
const policy = template.match(/set \$csp "([^"]+)";/)?.[1];
if (!policy) throw new Error("The production CSP could not be read");
const server = await preview({
	root: resolve("apps/web"),
	configFile: resolve("apps/web/vite.config.ts"),
	preview: {
		port: 5273,
		strictPort: true,
		headers: {
			"Content-Security-Policy": policy
				.replaceAll("${API_ORIGIN}", apiOrigin)
				.replaceAll("${API_WS_ORIGIN}", apiOrigin.replace("http:", "ws:")),
		},
	},
});
server.printUrls();
