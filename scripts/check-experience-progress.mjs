import { readFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);
const plan = await readFile(new URL("docs/plans/experience-polish.md", root), "utf8");
const definitions = new Map();
const ledger = new Map();

for (const line of plan.split(/\r?\n/)) {
	const definition = line.match(/^\| (XP-\d{2}) \| \*\*(.+?)\*\* \|/);
	if (definition) {
		if (definitions.has(definition[1])) throw new Error(`Duplicate definition: ${definition[1]}`);
		definitions.set(definition[1], definition[2]);
	}
	const entry = line.match(/^\| (XP-\d{2}) \| (done|partial|planned|in progress|dropped) \|/);
	if (entry) {
		if (ledger.has(entry[1])) throw new Error(`Duplicate ledger entry: ${entry[1]}`);
		ledger.set(entry[1], entry[2]);
	}
}

if (definitions.size !== 60) throw new Error(`Expected 60 XP definitions, found ${definitions.size}`);
for (const id of ledger.keys()) {
	if (!definitions.has(id)) throw new Error(`Ledger entry has no definition: ${id}`);
}

const counts = { done: 0, partial: 0, planned: 0, "in progress": 0, dropped: 0 };
const remaining = [];
for (let index = 1; index <= 60; index += 1) {
	const id = `XP-${String(index).padStart(2, "0")}`;
	if (!definitions.has(id)) throw new Error(`Missing definition: ${id}`);
	const status = ledger.get(id) ?? "planned";
	counts[status] += 1;
	if (status !== "done" && status !== "dropped") remaining.push({ id, status, title: definitions.get(id) });
}

const readme = await readFile(new URL("README.md", root), "utf8");
const summary = readme.match(/\*\*(\d+) of 60 items accepted locally\*\* \((\d+) partial, (\d+) planned\)/);
if (
	!summary ||
	Number(summary[1]) !== counts.done ||
	Number(summary[2]) !== counts.partial ||
	Number(summary[3]) !== counts.planned
) {
	throw new Error(`README progress is out of date. Ledger: ${JSON.stringify(counts)}`);
}

if (process.argv.includes("--json")) {
	process.stdout.write(`${JSON.stringify({ total: 60, counts, remaining }, null, 2)}\n`);
} else {
	process.stdout.write(
		`60 XP: ${Object.entries(counts)
			.map(([status, count]) => `${count} ${status}`)
			.join(" / ")}\n`,
	);
	for (const item of remaining) process.stdout.write(`${item.id} [${item.status}] ${item.title}\n`);
}
