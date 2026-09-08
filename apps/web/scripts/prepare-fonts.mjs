import { Buffer } from "node:buffer";
import process from "node:process";
import { URL } from "node:url";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Fontshare permits self-hosting but not redistribution in a source repository.
// Each checkout obtains the original files from the foundry; browsers use only
// Vite's fingerprinted same-origin assets. Cached downloads also work offline.
const fontFiles = [
	[
		"ClashDisplay-Bold.woff2",
		"BFBSY7LX5W2U2EROCLVVTQP4VS7S4PC3/IIUX4FGTMD2LK2VWD3RVTAS4SSMUN7B5/53RZKGODFYDW3QHTIL7IPOWTBCSUEZK7",
		"532795f825c5a28b807c0323e27939c638e6289d5870c05b962b6c0916407476",
	],
	[
		"GeneralSans-Regular.woff2",
		"MFQT7HFGCR2L5ULQTW6YXYZXXHMPKLJ3/YWQ244D6TACUX5JBKATPOW5I5MGJ3G73/7YY3ZAAE3TRV2LANYOLXNHTPHLXVWTKH",
		"3ec2be771caf168b077ca05af4df1dace77088e2b3a27da570036e61be58a039",
	],
	[
		"GeneralSans-Medium.woff2",
		"3RZHWSNONLLWJK3RLPEKUZOMM56GO4LJ/BPDRY7AHVI3MCDXXVXTQQ76H3UXA63S3/SB2OEB6IKZPRR6JT4GFJ2TFT6HBB6AZN",
		"c30377df1de8444d07161725c751f458beec07c28034df2fd275d1aa587a239f",
	],
	[
		"GeneralSans-Semibold.woff2",
		"K46YRH762FH3QJ25IQM3VAXAKCHEXXW4/ISLWQPUZHZF33LRIOTBMFOJL57GBGQ4B/3ZLMEXZEQPLTEPMHTQDAUXP5ZZXCZAEN",
		"94a2a0e1ef59728eb65498ed7fe26e5af7e2858a3a4a278a89ac1f83a0544945",
	],
	[
		"GeneralSans-Bold.woff2",
		"KWXO5X3YW4X7OLUMPO4X24HQJGJU7E2Q/VOWUQZS3YLP66ZHPTXAFSH6YACY4WJHT/NIQ54PVBBIWVK3PFSOIOUJSXIJ5WTNDP",
		"a29eab9b114f3c631cb24d537400dfb8d0ceea8cc9fb514864a68c4ead960490",
	],
];
const directory = new URL("../src/assets/fonts/", import.meta.url);
await mkdir(directory, { recursive: true });
await Promise.all(
	fontFiles.map(async ([filename, source, expectedHash]) => {
		const target = new URL(filename, directory);
		const cached = await readFile(target).catch(() => null);
		if (cached && createHash("sha256").update(cached).digest("hex") === expectedHash) return;
		const response = await globalThis.fetch(`https://cdn.fontshare.com/wf/${source}.woff2`, {
			signal: globalThis.AbortSignal.timeout(30_000),
		});
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
