import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveAttachment, saveFileAttachment } from "./attachment-storage.js";
import { ValidationError } from "./errors.js";

/**
 * Story videos (ADR 0025): re-encoded to one portable shape before they are
 * kept — H.264 + AAC in MP4 with the index up front, at most 720 px wide and
 * 15 seconds long — plus a poster frame through the image pipeline.
 *
 * Files rather than pipes, unlike voice: phones write MP4 with its index at the
 * end, which ffmpeg can only read from a seekable input, and `+faststart`
 * needs a seekable output to move the index to the front so playback starts
 * before the whole file has arrived.
 */

/** Longer clips are trimmed, not refused: the first 15 seconds is the story. */
export const STORY_VIDEO_MAX_SECONDS = 15;
const STORY_VIDEO_MAX_WIDTH = 720;
const FFMPEG_TIMEOUT_MS = 90_000;
const require = createRequire(import.meta.url);
const loadedFfmpegPath: unknown = require("ffmpeg-static");
const ffmpegPath = typeof loadedFfmpegPath === "string" ? loadedFfmpegPath : null;

export interface StoredStoryVideo {
	width: number;
	height: number;
	durationMs: number;
	byteSize: number;
}

function runFfmpeg(args: string[]): Promise<string> {
	if (!ffmpegPath) throw new ValidationError("Video stories are not available on this server");

	return new Promise((resolve, reject) => {
		const process = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
		let log = "";
		const timeout = setTimeout(() => {
			process.kill("SIGKILL");
			reject(new ValidationError("That video took too long to process"));
		}, FFMPEG_TIMEOUT_MS);
		process.stderr.on("data", (chunk: Buffer) => {
			log += chunk.toString();
		});
		process.on("error", () => {
			clearTimeout(timeout);
			reject(new ValidationError("That video could not be read"));
		});
		process.on("close", (code) => {
			clearTimeout(timeout);
			if (code === 0) resolve(log);
			else reject(new ValidationError("That video could not be read"));
		});
	});
}

/** "Duration: 00:00:12.34" from ffmpeg's report on its input, in milliseconds. */
export function parseDurationMs(log: string): number | null {
	const match = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/u.exec(log);
	if (!match) return null;

	return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
}

export async function saveStoryVideo(mediaId: string, upload: Buffer): Promise<StoredStoryVideo> {
	const directory = await mkdtemp(join(tmpdir(), "chatty-story-"));
	try {
		const input = join(directory, "input");
		const output = join(directory, "story.mp4");
		const poster = join(directory, "poster.png");
		await writeFile(input, upload);

		const log = await runFfmpeg([
			"-hide_banner",
			"-i",
			input,
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-t",
			String(STORY_VIDEO_MAX_SECONDS),
			"-vf",
			`scale='min(${STORY_VIDEO_MAX_WIDTH},trunc(iw/2)*2)':-2,format=yuv420p`,
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"26",
			"-maxrate",
			"1800k",
			"-bufsize",
			"3600k",
			"-c:a",
			"aac",
			"-b:a",
			"96k",
			"-movflags",
			"+faststart",
			"-y",
			output,
		]);
		await runFfmpeg(["-hide_banner", "-loglevel", "error", "-i", output, "-frames:v", "1", "-y", poster]);

		const stored = await saveAttachment(mediaId, await readFile(poster));
		const { byteSize } = await saveFileAttachment(mediaId, await readFile(output));
		const sourceMs = parseDurationMs(log) ?? STORY_VIDEO_MAX_SECONDS * 1000;

		return {
			width: stored.width,
			height: stored.height,
			durationMs: Math.min(sourceMs, STORY_VIDEO_MAX_SECONDS * 1000),
			byteSize,
		};
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
