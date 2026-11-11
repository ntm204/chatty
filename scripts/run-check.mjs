import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout, clearTimeout } from "node:timers";

const npm = (...args) => [process.execPath, process.env.npm_execpath, ...args];
const node = (...args) => [process.execPath, ...args];

// A deadline covers setup, every step and teardown; a failed run never widens or retries itself.
export async function runSteps(steps, { budgetMs, graceMs = 5_000, label = "check" }) {
	const started = Date.now();
	process.stdout.write(`[${label}] Budget: ${budgetMs / 1000}s. Stops on the first failed step.\n`);
	for (const step of steps) {
		const remaining = budgetMs - (Date.now() - started);
		if (remaining <= 0) return 124;
		const stepStarted = Date.now();
		// A step is one command, or `{ parallel: [...] }`: independent commands
		// run together, and the step fails if any of them does.
		const group = Array.isArray(step) ? [step] : step.parallel;
		const codes = await Promise.all(group.map((command) => runCommand(command, remaining)));
		const code = codes.find((exitCode) => exitCode !== 0) ?? 0;
		process.stdout.write(`[${label}] Step: ${((Date.now() - stepStarted) / 1000).toFixed(1)}s; exit ${code}.\n`);
		if (code !== 0) return code;
	}
	process.stdout.write(`[${label}] Passed in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`);

	return 0;

	function runCommand([command, ...args], remaining) {
		process.stdout.write(`[${label}] ${[command, ...args].join(" ")}\n`);

		return new Promise((resolveCode) => {
			const child = spawn(command, args, { stdio: "inherit", detached: process.platform !== "win32" });
			let stoppedCode;
			let killTimer;
			const descendants = new Set();
			function killTree(signal) {
				if (!child.pid) return;
				if (process.platform === "win32") {
					spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", timeout: 5_000 });
				} else {
					// Playwright gives browsers and web servers their own process groups.
					// Remember their PIDs before the launcher exits and they are reparented.
					const snapshot = spawnSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8", timeout: 1_000 });
					if (snapshot.status === 0) {
						const rows = snapshot.stdout
							.trim()
							.split("\n")
							.map((row) => row.trim().split(/\s+/u).map(Number));
						let added;
						do {
							added = false;
							for (const [pid, ppid] of rows) {
								if (!descendants.has(pid) && (ppid === child.pid || descendants.has(ppid))) {
									descendants.add(pid);
									added = true;
								}
							}
						} while (added);
					} else {
						process.stderr.write(
							`[${label}] Could not inspect detached descendants; check test processes after stopping.\n`,
						);
					}
					for (const pid of [child.pid, ...descendants]) {
						for (const target of [-pid, pid]) {
							try {
								process.kill(target, signal);
								break;
							} catch (error) {
								if (error.code !== "ESRCH") process.stderr.write(`${error.message}\n`);
							}
						}
					}
				}
			}
			function stop(code) {
				if (stoppedCode !== undefined) return;
				stoppedCode = code;
				process.stderr.write(
					`[${label}] ${code === 124 ? "Time budget exceeded" : "Cancelled"}; stopping this run.\n`,
				);
				killTree("SIGINT");
				killTimer = setTimeout(() => killTree("SIGKILL"), graceMs);
			}
			const onInterrupt = () => stop(130);
			const onTerminate = () => stop(143);
			process.on("SIGINT", onInterrupt);
			process.on("SIGTERM", onTerminate);
			const deadline = setTimeout(() => stop(124), remaining);
			function finish(code) {
				clearTimeout(deadline);
				clearTimeout(killTimer);
				process.off("SIGINT", onInterrupt);
				process.off("SIGTERM", onTerminate);
				// The launcher can exit before its children; do not leave workers behind on cancellation.
				if (stoppedCode !== undefined) killTree("SIGKILL");
				resolveCode(stoppedCode ?? code);
			}
			child.once("error", (error) => {
				process.stderr.write(`[${label}] ${error.message}\n`);
				finish(1);
			});
			child.once("exit", (code) => finish(code ?? 1));
		});
	}
}

function profile(name, args) {
	const staticSteps = [
		npm("run", "version:check"),
		node("scripts/check-experience-progress.mjs", "--json"),
		npm("run", "test:tooling"),
		npm("run", "typecheck"),
		npm("run", "lint"),
		npm("run", "format:check"),
	];
	// Server and web suites share nothing, so they run at the same time.
	const tests = (changed) => ({
		parallel: ["apps/server", "apps/web"].map((workspace) =>
			npm("run", changed ? "test:changed" : "test", "--workspace", workspace),
		),
	});
	const browser = (config, budgetMs) => ({
		budgetMs,
		steps: [node("node_modules/@playwright/test/cli.js", "test", ...(config ? ["--config", config] : []), ...args)],
	});
	switch (name) {
		case "verify":
		case "verify:full":
			return {
				budgetMs: name === "verify" ? 300_000 : 600_000,
				steps: [...staticSteps, tests(name === "verify"), npm("run", "verify:audit")],
			};
		case "test":
		case "test:changed":
			return { budgetMs: name === "test" ? 600_000 : 300_000, steps: [tests(name === "test:changed")] };
		case "test:e2e":
			return browser(undefined, 900_000);
		case "test:e2e:smoke":
			return browser("playwright.smoke.config.ts", 180_000);
		case "test:e2e:built":
			return browser("playwright.built.config.ts", 300_000);
		default:
			throw new Error(`Unknown check: ${name}`);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [name, ...args] = process.argv.slice(2);
	try {
		if (!process.env.npm_execpath)
			throw new Error("Run checks through npm run so the same npm installation is used.");
		const selected = profile(name, args);
		process.exitCode = await runSteps(selected.steps, { budgetMs: selected.budgetMs, label: name });
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		process.exitCode = 1;
	}
}
