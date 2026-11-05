import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { URL } from "node:url";
import { runSteps } from "../run-check.mjs";

const node = (code) => [process.execPath, "-e", code];

test("a failed step keeps its exit code and never starts the next step", async () => {
	const code = await runSteps([node("process.exit(7)"), node("process.exit(99)")], { budgetMs: 2_000 });
	assert.equal(code, 7);
});

test("a missing executable fails instead of hanging or passing", async () => {
	assert.equal(await runSteps([["chatty-nonexistent-command"]], { budgetMs: 1_000 }), 1);
});

test("the time budget is shared across steps", async () => {
	const started = Date.now();
	const code = await runSteps([node("setTimeout(() => {}, 250)"), node("setInterval(() => {}, 100)")], {
		budgetMs: 500,
		graceMs: 50,
	});
	assert.equal(code, 124);
	assert.ok(Date.now() - started < 2_000);
});

test("timeout kills a resistant child and its detached descendants", async () => {
	const dir = await mkdtemp(join(tmpdir(), "chatty-check-"));
	const marker = join(dir, "leaked-worker");
	const pidFile = join(dir, "pid");
	const descendant = `process.on('SIGINT', () => {}); setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'leaked'), 1200)`;
	try {
		const code = await runSteps(
			[
				node(`
				const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore', detached: true });
				require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
				process.on('SIGINT', () => {});
				setInterval(() => {}, 100);
			`),
			],
			{ budgetMs: 600, graceMs: 100 },
		);
		assert.equal(code, 124);
		assert.ok(Number(await readFile(pidFile, "utf8")) > 0);
		await setTimeout(900);
		await assert.rejects(access(marker), { code: "ENOENT" });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("SIGINT cancels the run and does not launch another step", { skip: process.platform === "win32" }, async () => {
	const moduleUrl = new URL("../run-check.mjs", import.meta.url).href;
	const child = spawn(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
		import { runSteps } from ${JSON.stringify(moduleUrl)};
		process.exitCode = await runSteps([
			[process.execPath, '-e', "console.log('ready'); setInterval(() => {}, 100)"],
			[process.execPath, '-e', "console.log('must not run')"],
		], { budgetMs: 5000, graceMs: 100 });
	`,
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	let output = "";
	let hasInterrupted = false;
	child.stdout.on("data", (chunk) => {
		output += chunk;
		if (!hasInterrupted && output.includes("\nready\n")) {
			hasInterrupted = true;
			child.kill("SIGINT");
		}
	});
	child.stderr.resume();
	const code = await new Promise((resolve) => child.on("exit", resolve));
	assert.equal(code, 130);
	assert.ok(!output.includes("\nmust not run\n"));
});
