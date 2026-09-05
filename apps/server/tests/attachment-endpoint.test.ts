import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { signAttachmentToken } from "../src/lib/attachment-token.js";
import { prisma } from "../src/lib/prisma.js";
import { installFakeIO } from "./fake-io.js";

/**
 * `POST /conversations/:id/messages` with a file, and `GET /attachments/:id`,
 * over real HTTP.
 *
 * Three things only exist above the service layer and so can only fail here:
 * multer turning a multipart body into `req.file`, `sendFile` actually finding a
 * path under a dot directory, and the fact that both kinds of JWT in this app
 * are signed with the same secret. That last one is a vulnerability rather than
 * a bug — an attachment token accepted by `requireAuth` would authenticate as a
 * user whose id is an attachment id — and nothing below this layer can see it.
 */

const UPLOAD_DIR = ".data/test-uploads";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	// Port 0: the OS picks a free one, so this cannot collide with a dev server.
	server = createServer(createApp()).listen(0);
	await once(server, "listening");
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
	installFakeIO();
});

afterAll(async () => {
	server.close();
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

async function makeImage(width = 800, height = 400): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: { r: 9, g: 9, b: 9 } } })
		.png()
		.toBuffer();
}

/** A registered user in a conversation with one other person, plus their token. */
async function makeSender(): Promise<{ token: string; conversationId: string }> {
	const response = await fetch(`${baseUrl}/auth/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: "minh@chatty.test",
			password: "SuperSecret123",
			handle: "minh_test",
			displayName: "Minh",
		}),
	});
	const { token, user } = (await response.json()) as { token: string; user: { id: string } };

	const peer = await prisma.user.create({
		data: { email: "an@chatty.test", handle: "an_test", displayName: "An", passwordHash: "x" },
		select: { id: true },
	});
	const conversation = await prisma.conversation.create({
		data: { participants: { create: [{ userId: user.id }, { userId: peer.id }] } },
		select: { id: true },
	});

	return { token, conversationId: conversation.id };
}

/** Sends one image and returns the created message. */
async function sendImage(
	token: string,
	conversationId: string,
	options: { caption?: string; file?: Blob } = {},
): Promise<Response> {
	const body = new FormData();
	body.append("attachment", options.file ?? new Blob([await makeImage()], { type: "image/png" }), "photo.png");
	if (options.caption !== undefined) body.append("content", options.caption);

	// No Content-Type header set by hand: the browser (and undici) has to add the
	// multipart boundary, and declaring JSON over the top makes the body unparseable.
	return fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
		body,
	});
}

async function sendFile(
	token: string,
	conversationId: string,
	bytes: Buffer,
	fileName: string,
	mediaType = "application/octet-stream",
): Promise<Response> {
	const body = new FormData();
	body.append("file", new Blob([bytes], { type: mediaType }), fileName);

	return fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
		body,
	});
}

function makeWave(durationSeconds = 1): Buffer {
	const sampleRate = 8_000;
	const dataSize = sampleRate * durationSeconds * 2;
	const wave = Buffer.alloc(44 + dataSize);
	wave.write("RIFF", 0);
	wave.writeUInt32LE(36 + dataSize, 4);
	wave.write("WAVEfmt ", 8);
	wave.writeUInt32LE(16, 16);
	wave.writeUInt16LE(1, 20);
	wave.writeUInt16LE(1, 22);
	wave.writeUInt32LE(sampleRate, 24);
	wave.writeUInt32LE(sampleRate * 2, 28);
	wave.writeUInt16LE(2, 32);
	wave.writeUInt16LE(16, 34);
	wave.write("data", 36);
	wave.writeUInt32LE(dataSize, 40);
	for (let sample = 0; sample < sampleRate * durationSeconds; sample += 1) {
		wave.writeInt16LE(Math.round(Math.sin((sample / sampleRate) * Math.PI * 440 * 2) * 8_000), 44 + sample * 2);
	}

	return wave;
}

function onTestServer(url: string): string {
	return `${baseUrl}${new URL(url).pathname}${new URL(url).search}`;
}

describe("POST /conversations/:id/messages with an image", () => {
	it("creates a message carrying the attachment", async () => {
		const { token, conversationId } = await makeSender();

		const response = await sendImage(token, conversationId, { caption: "look at this" });

		expect(response.status).toBe(201);
		const message = (await response.json()) as {
			content: string;
			attachments: { id: string; width: number }[];
		};
		expect(message.content).toBe("look at this");
		expect(message.attachments).toHaveLength(1);
		expect(message.attachments[0]!.width).toBe(800);
	});

	it("accepts an image with no caption", async () => {
		const { token, conversationId } = await makeSender();

		expect((await sendImage(token, conversationId)).status).toBe(201);
	});

	it("still accepts a plain JSON text message on the same route", async () => {
		// The upload middleware has to pass a non-multipart body straight through,
		// or adding attachments breaks every message that does not have one.
		const { token, conversationId } = await makeSender();

		const response = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ content: "just text" }),
		});

		expect(response.status).toBe(201);
		expect(((await response.json()) as { attachments: unknown[] }).attachments).toEqual([]);
	});

	it("400s on a message with neither text nor image", async () => {
		const { token, conversationId } = await makeSender();

		const response = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ content: "   " }),
		});

		expect(response.status).toBe(400);
	});

	it("400s on a file that is not an image", async () => {
		const { token, conversationId } = await makeSender();

		const response = await sendImage(token, conversationId, {
			file: new Blob([Buffer.from("%PDF-1.4 not an image")], { type: "application/pdf" }),
		});

		expect(response.status).toBe(400);
	});
});

describe("POST /conversations/:id/messages with several images", () => {
	/** Repeats the same field name once per file — how multipart carries a list. */
	async function sendImages(token: string, conversationId: string, count: number): Promise<Response> {
		const body = new FormData();
		for (let index = 0; index < count; index += 1) {
			// Distinct sizes, so the response's order can be checked against the
			// order they were appended in rather than assumed.
			const bytes = await makeImage(200 + index * 100, 200);
			body.append("attachment", new Blob([bytes], { type: "image/png" }), `photo-${index}.png`);
		}

		return fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
			body,
		});
	}

	it("accepts a repeated field and keeps the order it arrived in", async () => {
		// Nothing below this layer can check it: multer's `array()` parse and the
		// order it hands the buffers over are exactly what a service test stubs.
		const { token, conversationId } = await makeSender();

		const response = await sendImages(token, conversationId, 3);
		const message = (await response.json()) as { attachments: { width: number }[] };

		expect(response.status).toBe(201);
		expect(message.attachments.map((attachment) => attachment.width)).toEqual([200, 300, 400]);
	});

	it("refuses more than the cap with a sentence rather than a 500", async () => {
		// Multer aborts with LIMIT_FILE_COUNT, which reaches the error middleware
		// as an unrecognised error unless it is mapped — "something broke"
		// instead of "that is too many pictures".
		const { token, conversationId } = await makeSender();

		const response = await sendImages(token, conversationId, 11);

		expect(response.status).toBe(400);
		expect(((await response.json()) as { message: string }).message).toMatch(/at most 10 images/i);
	});
});

describe("POST /conversations/:id/messages with a file", () => {
	it("stores one file and serves it only as a download", async () => {
		const { token, conversationId } = await makeSender();
		const response = await sendFile(
			token,
			conversationId,
			Buffer.from("%PDF-1.4 chatty"),
			"Tài liệu.pdf",
			"application/pdf",
		);

		expect(response.status).toBe(201);
		const message = (await response.json()) as {
			attachments: { kind: string; fileName: string; mediaType: string; url: string }[];
		};
		expect(message.attachments[0]).toMatchObject({
			kind: "file",
			fileName: "Tài liệu.pdf",
			mediaType: "application/pdf",
		});

		const download = await fetch(onTestServer(message.attachments[0]!.url));
		expect(download.status).toBe(200);
		expect(download.headers.get("content-disposition")).toContain("attachment;");
		expect(download.headers.get("content-disposition")).toContain("filename*=UTF-8''");
		expect(download.headers.get("x-content-type-options")).toBe("nosniff");
		expect(download.headers.get("content-security-policy")).toContain("sandbox");
	});

	it("refuses executable extensions at the HTTP boundary", async () => {
		const { token, conversationId } = await makeSender();

		const response = await sendFile(token, conversationId, Buffer.from("echo nope"), "installer.cmd", "text/plain");

		expect(response.status).toBe(400);
		expect(((await response.json()) as { message: string }).message).toMatch(/executable/i);
		expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
	});

	it("demotes browser-interpretable text to an opaque download type", async () => {
		const { token, conversationId } = await makeSender();

		const response = await sendFile(
			token,
			conversationId,
			Buffer.from("<!doctype html><script>alert(1)</script>"),
			"notes.txt",
			"text/plain",
		);
		const message = (await response.json()) as { attachments: { mediaType: string; url: string }[] };

		expect(message.attachments[0]?.mediaType).toBe("application/octet-stream");
		expect((await fetch(onTestServer(message.attachments[0]!.url))).headers.get("content-type")).toBe(
			"application/octet-stream",
		);
	});

	it("streams a downloaded file uncompressed, so it keeps its length", async () => {
		// Exceed the 1 KB threshold so removing the filter makes this test fail.
		const { token, conversationId } = await makeSender();

		const bytes = Buffer.alloc(8192, "a");
		const response = await sendFile(token, conversationId, bytes, "notes.bin");
		const message = (await response.json()) as { attachments: { url: string }[] };
		const download = await fetch(onTestServer(message.attachments[0]!.url), {
			headers: { "Accept-Encoding": "gzip, deflate, br" },
		});

		expect(download.status).toBe(200);
		expect(download.headers.get("content-encoding")).toBeNull();
		expect(download.headers.get("content-length")).toBe(String(bytes.length));
		expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);

		const ranged = await fetch(onTestServer(message.attachments[0]!.url), {
			headers: { "Accept-Encoding": "gzip, deflate, br", Range: "bytes=1024-3071" },
		});
		expect(ranged.status).toBe(206);
		expect(ranged.headers.get("content-encoding")).toBeNull();
		expect(ranged.headers.get("content-length")).toBe("2048");
		expect(ranged.headers.get("content-range")).toBe("bytes 1024-3071/8192");
		expect(Buffer.from(await ranged.arrayBuffer())).toEqual(bytes.subarray(1024, 3072));
	});

	it("refuses mixed image and file fields before either can become a message", async () => {
		const { token, conversationId } = await makeSender();
		const body = new FormData();
		body.append("attachment", new Blob([await makeImage()], { type: "image/png" }), "photo.png");
		body.append("file", new Blob([Buffer.from("document")]), "notes.txt");

		const response = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
			body,
		});

		expect(response.status).toBe(400);
		expect(((await response.json()) as { message: string }).message).toMatch(/not a mixture/i);
		expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
	});
});

describe("POST /conversations/:id/messages with voice", () => {
	it("normalizes a recording to AAC/MP4 with duration and waveform metadata", async () => {
		const { token, conversationId } = await makeSender();
		const body = new FormData();
		body.append("voice", new Blob([makeWave()], { type: "audio/wav" }), "recording.wav");

		const response = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
			body,
		});
		expect(response.status).toBe(201);
		const message = (await response.json()) as {
			attachments: { kind: string; mediaType: string; durationMs: number; waveform: number[]; url: string }[];
		};
		expect(message.attachments[0]).toMatchObject({ kind: "audio", mediaType: "audio/mp4" });
		expect(message.attachments[0]!.durationMs).toBeGreaterThanOrEqual(900);
		expect(message.attachments[0]!.waveform).toHaveLength(64);

		const ranged = await fetch(onTestServer(message.attachments[0]!.url), { headers: { Range: "bytes=0-31" } });
		expect(ranged.status).toBe(206);
		expect(ranged.headers.get("content-type")).toBe("audio/mp4");
		expect(ranged.headers.get("content-disposition")).toContain("inline");
	});

	it("refuses audio whose decoded duration exceeds the server tolerance", async () => {
		const { token, conversationId } = await makeSender();
		const body = new FormData();
		body.append("voice", new Blob([makeWave(360)], { type: "audio/wav" }), "too-long.wav");

		const response = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
			body,
		});

		expect(response.status).toBe(400);
		expect(((await response.json()) as { message: string }).message).toMatch(/at most 5 minutes/i);
	});
});

describe("GET /attachments/:attachmentId", () => {
	async function sendAndGetUrl(): Promise<{ url: string; attachmentId: string; token: string }> {
		const { token, conversationId } = await makeSender();
		const response = await sendImage(token, conversationId);
		const message = (await response.json()) as { attachments: { id: string; url: string }[] };

		return { url: message.attachments[0]!.url, attachmentId: message.attachments[0]!.id, token };
	}

	it("serves the re-encoded image", async () => {
		const { url } = await sendAndGetUrl();

		const response = await fetch(onTestServer(url));

		expect(response.status).toBe(200);
		// WebP whatever went in — the PNG that was uploaded no longer exists.
		expect(response.headers.get("content-type")).toBe("image/webp");
		expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	it("serves the image thumbnail with the same signed token", async () => {
		const { url } = await sendAndGetUrl();

		const response = await fetch(`${onTestServer(url)}&size=thumb`);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/webp");
		expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	it("serves it without an Authorization header", async () => {
		// The whole point of the signed URL: an <img> tag cannot send one.
		const { url } = await sendAndGetUrl();

		expect((await fetch(onTestServer(url))).status).toBe(200);
	});

	it("never lets a shared cache hold it", async () => {
		const { url } = await sendAndGetUrl();

		expect((await fetch(onTestServer(url))).headers.get("cache-control")).toContain("private");
	});

	it("404s on a token minted for a different attachment", async () => {
		const { attachmentId } = await sendAndGetUrl();

		const response = await fetch(
			`${baseUrl}/attachments/${attachmentId}?token=${signAttachmentToken("some-other-id")}`,
		);

		expect(response.status).toBe(404);
	});

	it("404s rather than 401s on a bad token, so the id is not confirmed", async () => {
		const { attachmentId } = await sendAndGetUrl();

		expect((await fetch(`${baseUrl}/attachments/${attachmentId}?token=nonsense`)).status).toBe(404);
	});

	it("400s when no token is given at all", async () => {
		const { attachmentId } = await sendAndGetUrl();

		expect((await fetch(`${baseUrl}/attachments/${attachmentId}`)).status).toBe(400);
	});

	it("rejects an id shaped like a path escape", async () => {
		const response = await fetch(
			`${baseUrl}/attachments/${encodeURIComponent("../../etc/passwd")}?token=${signAttachmentToken("x")}`,
		);

		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.status).toBeLessThan(500);
	});
});

describe("the two kinds of token cannot be swapped", () => {
	it("refuses a user's access token as an attachment token", async () => {
		const { token, conversationId } = await makeSender();
		const message = (await (await sendImage(token, conversationId)).json()) as { attachments: { id: string }[] };

		// Signed with the same secret and verifies fine — only the `typ` claim and
		// the `sub` comparison tell them apart.
		const response = await fetch(`${baseUrl}/attachments/${message.attachments[0]!.id}?token=${token}`);

		expect(response.status).toBe(404);
	});

	it("refuses an attachment token as a bearer token", async () => {
		// Without the guard in requireAuth this would authenticate as a user whose
		// id is an attachment id, and every downstream query would run for them.
		const attachmentToken = signAttachmentToken("some-attachment-id");

		const response = await fetch(`${baseUrl}/users/me`, {
			headers: { Authorization: `Bearer ${attachmentToken}` },
		});

		expect(response.status).toBe(401);
	});
});
