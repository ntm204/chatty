import { Buffer } from "node:buffer";
import process from "node:process";
import { URL } from "node:url";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Fontshare permits self-hosting but not redistribution in a source repository.
// Each checkout obtains the original files from the foundry; browsers use only
// Vite's fingerprinted same-origin assets. Cached downloads also work offline.
// Only what the app uses: the wordmark, in General Sans Bold. Everything else
// is set in the platform's own font.
const fontFiles = [
	[
		"GeneralSans-Bold.woff2",
		"KWXO5X3YW4X7OLUMPO4X24HQJGJU7E2Q/VOWUQZS3YLP66ZHPTXAFSH6YACY4WJHT/NIQ54PVBBIWVK3PFSOIOUJSXIJ5WTNDP",
		"a29eab9b114f3c631cb24d537400dfb8d0ceea8cc9fb514864a68c4ead960490",
	],
];
const DOWNLOAD_ATTEMPTS = 3;

/**
 * The CDN is the one network call in a build, and a CI runner's connection to
 * it fails now and then. Retry a few times with a growing pause before failing
 * the build; a wrong file is still never retried, only an unreachable one.
 */
async function download(url) {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(30_000) });
		} catch (error) {
			if (attempt >= DOWNLOAD_ATTEMPTS) throw error;
			process.stdout.write(`Font download failed (attempt ${attempt}); retrying…\n`);
			await new Promise((resolve) => globalThis.setTimeout(resolve, attempt * 3_000));
		}
	}
}
const directory = new URL("../src/assets/fonts/", import.meta.url);
await mkdir(directory, { recursive: true });
await Promise.all(
	fontFiles.map(async ([filename, source, expectedHash]) => {
		const target = new URL(filename, directory);
		const cached = await readFile(target).catch(() => null);
		if (cached && createHash("sha256").update(cached).digest("hex") === expectedHash) return;
		const response = await download(`https://cdn.fontshare.com/wf/${source}.woff2`);
		if (!response.ok) throw new Error(`Could not download ${filename}: HTTP ${response.status}`);
		const bytes = Buffer.from(await response.arrayBuffer());
		if (bytes.subarray(0, 4).toString() !== "wOF2") throw new Error(`Invalid WOFF2 file: ${filename}`);
		if (createHash("sha256").update(bytes).digest("hex") !== expectedHash) {
			throw new Error(
				`Font integrity mismatch: ${filename}. Check the upstream version before updating the pinned hash.`,
			);
		}
		await writeFile(target, bytes);
		process.stdout.write(`Prepared ${filename} (${bytes.length} bytes)\n`);
	}),
);
