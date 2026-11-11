#!/usr/bin/env node
// Fills the three seeded test accounts with a short history that shows every message feature once.
// Run `npm run seed --workspace apps/server` first (it resets the database), then `npm run seed:demo`.
// `--long` also adds ~300 plain messages for trying pagination and long scrolls.

import { Buffer } from "node:buffer";
import process from "node:process";
import { URL } from "node:url";

const { Blob, FormData, Headers, fetch } = globalThis;

const API_URL = new URL(process.env.CHATTY_API_URL ?? "http://127.0.0.1:4000");
// The accounts `npm run seed` creates; this script only adds to them.
const DEMO_PASSWORD = "1";
const IS_LONG = process.argv.includes("--long");
const LONG_MESSAGE_COUNT = 300;

const DEMO_ACCOUNTS = [
	{ key: "one", email: "1@test.com" },
	{ key: "two", email: "2@test.com" },
	{ key: "three", email: "3@test.com" },
];

// ── Plumbing ──

function assertSafeTarget() {
	const isLoopback = API_URL.hostname === "127.0.0.1" || API_URL.hostname === "localhost";
	if (!isLoopback && process.env.CHATTY_DEMO_ALLOW_REMOTE !== "seed-demo-data") {
		throw new Error(
			`Refusing to create demo data on ${API_URL.origin}. Set CHATTY_DEMO_ALLOW_REMOTE=seed-demo-data to opt in.`,
		);
	}
}

async function request(path, options = {}) {
	const headers = new Headers(options.headers);
	if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
	if (options.json !== undefined) headers.set("Content-Type", "application/json");

	const response = await fetch(new URL(path, API_URL), {
		method: options.method ?? "GET",
		headers,
		body: options.json === undefined ? options.body : JSON.stringify(options.json),
	});
	const text = await response.text();
	const payload = text ? JSON.parse(text) : null;
	if (!response.ok && !options.allowStatuses?.includes(response.status)) {
		throw new Error(`${options.method ?? "GET"} ${path} returned ${response.status}: ${text}`);
	}

	return { status: response.status, payload };
}

async function signIn(account) {
	const login = await request("/auth/login", {
		method: "POST",
		json: { email: account.email, password: DEMO_PASSWORD },
		allowStatuses: [401],
	});
	if (login.status !== 200) {
		throw new Error(`Cannot sign in as ${account.email}. Run \`npm run seed --workspace apps/server\` first.`);
	}

	return { ...account, ...login.payload.user, token: login.payload.token };
}

let clientCounter = 0;

/** Sends as `account`; text and options as JSON, attachments as multipart. */
async function send(account, conversationId, input = {}) {
	const clientId = `demo-${Date.now()}-${(clientCounter += 1)}`;
	const hasUpload = input.images || input.file || input.voice;
	if (!hasUpload) {
		return (
			await request(`/conversations/${conversationId}/messages`, {
				method: "POST",
				token: account.token,
				json: { ...input, clientId },
			})
		).payload;
	}
	const form = new FormData();
	form.set("clientId", clientId);
	if (input.content) form.set("content", input.content);
	if (input.replyToId) form.set("replyToId", input.replyToId);
	for (const [index, image] of (input.images ?? []).entries())
		form.append("attachment", image, `photo-${index + 1}.svg`);
	if (input.file) form.set("file", input.file.blob, input.file.name);
	if (input.voice) form.set("voice", input.voice, "voice.wav");

	return (
		await request(`/conversations/${conversationId}/messages`, { method: "POST", token: account.token, body: form })
	).payload;
}

const put = (account, path, json) => request(path, { method: "PUT", token: account.token, json });

async function upload(account, path, blob) {
	const form = new FormData();
	form.set("avatar", blob, "avatar.svg");

	return (await request(path, { method: "POST", token: account.token, body: form })).payload;
}

async function createConversation(account, participantIds, name) {
	return (
		await request("/conversations", {
			method: "POST",
			token: account.token,
			json: name ? { name, participantIds } : { participantIds },
		})
	).payload;
}

const markRead = (account, conversationId, message) =>
	request(`/conversations/${conversationId}/read`, {
		method: "POST",
		token: account.token,
		json: { messageId: message.id },
	});

// ── Generated media (no files on disk) ──

/** An illustrated head-and-shoulders portrait, so a real photo shows instead of the grey silhouette. */
function portrait(skin, hair, shirt, from, to) {
	const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <path d="M86 512c12-108 84-164 170-164s158 56 170 164z" fill="${shirt}"/>
  <rect x="222" y="270" width="68" height="90" rx="30" fill="${skin}"/>
  <ellipse cx="256" cy="214" rx="96" ry="108" fill="${skin}"/>
  <path d="M156 214c-6-92 52-138 104-138 70 0 112 48 102 138-18-40-54-62-104-66-46 4-82 26-102 66z" fill="${hair}"/>
  <circle cx="222" cy="226" r="9" fill="#2b2633"/><circle cx="292" cy="226" r="9" fill="#2b2633"/>
  <path d="M228 274q28 22 56 0" stroke="#2b2633" stroke-width="8" fill="none" stroke-linecap="round"/>
</svg>`;

	return new Blob([markup], { type: "image/svg+xml" });
}

/** A group picture drawn as a painter's palette — shapes only, since the server's SVG renderer has no emoji font. */
function groupBadge(from, to) {
	const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <path d="M256 120c-86 0-150 58-150 132 0 66 52 116 112 116 26 0 34-18 30-34-4-18 6-34 28-34h38c52 0 92-34 92-82 0-56-66-98-150-98z" fill="#fffdf8"/>
  <circle cx="190" cy="220" r="20" fill="#e9684a"/><circle cx="246" cy="180" r="20" fill="#f2b84b"/>
  <circle cx="310" cy="196" r="20" fill="#4b7f68"/><circle cx="340" cy="256" r="20" fill="#705c91"/>
</svg>`;

	return new Blob([markup], { type: "image/svg+xml" });
}

function photo(label, background, accent, width = 1200, height = 800) {
	const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
  <rect width="1200" height="800" fill="${background}"/>
  <circle cx="930" cy="190" r="210" fill="${accent}" opacity="0.8"/>
  <path d="M0 640 L380 300 L700 580 L920 400 L1200 700 V800 H0Z" fill="${accent}" opacity="0.4"/>
  <text x="72" y="140" font-family="sans-serif" font-size="80" font-weight="700" fill="#25231f">${label}</text>
</svg>`;

	return new Blob([markup], { type: "image/svg+xml" });
}

/** A short spoken-sounding clip: a tone shaped into syllables with pauses, so the waveform has peaks. */
function voiceClip(seconds) {
	const sampleRate = 16_000;
	const count = Math.round(sampleRate * seconds);
	const wav = Buffer.alloc(44 + count * 2);
	wav.write("RIFF", 0);
	wav.writeUInt32LE(36 + count * 2, 4);
	wav.write("WAVEfmt ", 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(sampleRate, 24);
	wav.writeUInt32LE(sampleRate * 2, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write("data", 36);
	wav.writeUInt32LE(count * 2, 40);
	for (let index = 0; index < count; index += 1) {
		const time = index / sampleRate;
		const syllable = Math.max(0, Math.sin(Math.PI * 2 * 2.6 * time)) * (0.4 + 0.6 * Math.abs(Math.sin(time * 1.7)));
		const sample = Math.round(Math.sin(Math.PI * 2 * (180 + 40 * Math.sin(time * 9)) * time) * syllable * 14_000);
		wav.writeInt16LE(sample, 44 + index * 2);
	}

	return new Blob([wav], { type: "audio/wav" });
}

const textFile = (name, lines) => ({ name, blob: new Blob([lines.join("\n")], { type: "text/plain" }) });

// ── Scenes, each showing a set of features ──

/** Faces: User 2 and User 3 get photos; User 1 keeps the silhouette, so both looks appear. */
async function seedProfiles({ two, three }) {
	await upload(two, "/users/me/avatar", portrait("#f1c7a5", "#3b2a24", "#e9684a", "#ffe6c7", "#f7b9a6"));
	await upload(three, "/users/me/avatar", portrait("#e4b493", "#1f2a3a", "#4b7f68", "#d7f0e6", "#a8d8f0"));
}

/** 1 ↔ 2: every kind of message once — the thread to check bubbles, media and actions. */
async function seedShowcase({ one, two }) {
	const chat = await createConversation(one, [two.id]);
	const id = chat.id;
	const hello = await send(one, id, { content: "Cuối tuần này rảnh không? 😊" });
	await send(two, id, { content: "Rảnh nè, có kế hoạch gì hả?" });
	const plan = await send(one, id, { content: "Đi cà phê rồi ghé hiệu sách nhé, mình gửi địa chỉ sau." });
	await send(two, id, { content: "Ok luôn, nghe hay đó!", replyToId: plan.id });
	await put(two, `/conversations/${id}/messages/${plan.id}/reactions`, { emoji: "❤️" });
	await put(one, `/conversations/${id}/messages/${plan.id}/reactions`, { emoji: "👍" });

	const typo = await send(one, id, { content: "Hẹn 9h sáng thứ bảy nha" });
	await request(`/conversations/${id}/messages/${typo.id}`, {
		method: "PATCH",
		token: one.token,
		json: { content: "Hẹn 9h30 sáng thứ bảy nha" },
	});
	const oops = await send(two, id, { content: "Gửi nhầm tin này" });
	await request(`/conversations/${id}/messages/${oops.id}`, { method: "DELETE", token: two.token });

	await send(two, id, { content: "Địa chỉ quán đây: https://example.com/ca-phe-sach" });
	await send(two, id, {
		content: "Ảnh quán hôm trước mình chụp",
		images: [photo("Quán cà phê", "#f4efe3", "#dc6247"), photo("Góc sách", "#e8efe9", "#4b7f68")],
	});
	await send(one, id, { images: [photo("Hoàng hôn", "#fbe3d4", "#e9684a", 800, 1100)] });
	const list = await send(one, id, {
		file: textFile("danh-sach-sach.txt", [
			"Danh sách sách muốn mua",
			"- Nhà giả kim",
			"- Đắc nhân tâm",
			"- Sapiens",
		]),
	});
	await send(two, id, { voice: voiceClip(6) });
	await send(one, id, { voice: voiceClip(14) });
	await send(two, id, { stickerKey: "party" });
	await send(one, id, { content: "🎉" });
	const last = await send(two, id, { content: "Thứ bảy gặp nhé!" });

	await put(one, `/conversations/${id}/messages/${hello.id}/pin`);
	await put(two, `/conversations/${id}/messages/${plan.id}/pin`);
	await put(one, `/conversations/${id}/messages/${list.id}/star`);
	await markRead(one, id, last);
	await markRead(two, id, last);
	await put(one, `/conversations/${id}/theme`, { theme: "iris" });

	return { chat, plan };
}

/**
 * A group with no picture of its own, so it shows two members' faces; mentions,
 * a gallery, a forward in, read receipts — and a run of unread for User 1, long
 * enough that the "new messages" rule starts off screen.
 */
async function seedGroup({ one, two, three }, forwardFrom) {
	// `npm run seed` already made this group and its opening question; carry the story on there.
	const existing = (await request("/conversations?limit=50", { token: one.token })).payload.items.find(
		(conversation) => conversation.isGroup && conversation.name === "Weekend football",
	);
	const group = existing ?? (await createConversation(one, [two.id, three.id], "Weekend football"));
	const id = group.id;
	await put(one, `/conversations/${id}/members/${three.id}/role`, { role: "admin" });
	if (!existing) await send(three, id, { content: "Cuối tuần này đá không mọi người?" });
	const vote = await send(one, id, { content: "Mình ok, sân cũ 7h tối nhé" });
	await put(two, `/conversations/${id}/messages/${vote.id}/reactions`, { emoji: "👍" });
	await put(three, `/conversations/${id}/messages/${vote.id}/reactions`, { emoji: "👍" });
	await send(two, id, {
		content: "@user1 nhớ mang bóng nha",
		mentionedUserIds: [one.id],
		replyToId: vote.id,
	});
	await send(three, id, {
		content: "Ảnh trận tuần trước",
		images: [
			photo("Trận 1", "#e8efe9", "#4b7f68"),
			photo("Trận 2", "#ebe8f2", "#705c91"),
			photo("Trận 3", "#f4efe3", "#dc6247"),
		],
	});
	await send(one, id, { forwardOfMessageId: forwardFrom.id });
	const seen = await send(one, id, { content: "Chốt 7h nhé, ai đến trước giữ sân giúp" });
	await markRead(two, id, seen);
	await markRead(three, id, seen);
	await markRead(one, id, seen);

	const unread = [
		"Mình có thể đến muộn 10 phút",
		"Ai có áo đấu màu xanh không?",
		"Sân báo đổi giờ sang 7h30 nha",
		"Vậy 7h30 nhé mọi người",
		"Nhớ mang nước",
		"Có ai đi chung xe không?",
		"Mình đi từ quận 3",
		"Ok mình qua đón",
		"Trời có thể mưa đó, mang áo mưa",
		"Đá xong đi ăn lẩu không?",
		"Lẩu thái nha 🍲",
		"Chốt kèo!",
	];
	for (const [index, line] of unread.entries()) await send(index % 2 ? two : three, id, { content: line });
	await send(three, id, { voice: voiceClip(4) });

	return group;
}

/** A group with its own picture, muted by User 1 with unread waiting — the grey count. */
async function seedMutedGroup({ one, two, three }) {
	const group = await createConversation(two, [one.id, three.id], "Design team");
	await upload(two, `/conversations/${group.id}/avatar`, groupBadge("#ebe8f2", "#c9bff0"));
	await put(one, `/conversations/${group.id}/mute`, { until: "9999-12-31T23:59:59.999Z" });
	await send(two, group.id, { content: "Bản thiết kế mới đã lên nhé" });
	await send(three, group.id, { content: "Đẹp quá, mình góp ý chút trong file" });
	await send(two, group.id, { content: "Ok, cảm ơn 🙏" });
}

/** 1 ↔ 3 pinned at the top, with a nickname; plus an archived chat and private notes. */
async function seedSidebarStates({ one, two, three }) {
	const pinned = await createConversation(one, [three.id]);
	await put(one, `/conversations/${pinned.id}/members/${three.id}/nickname`, { nickname: "Ba" });
	const reply = await send(three, pinned.id, { content: "Mai họp lúc mấy giờ ấy nhỉ?" });
	await send(one, pinned.id, { content: "10h nha", replyToId: reply.id });
	await put(one, `/conversations/${pinned.id}/pin`, { pinned: true });

	const old = await createConversation(two, [one.id, three.id], "Old project");
	await send(two, old.id, { content: "Dự án này xong rồi, cảm ơn mọi người!" });
	await put(one, `/conversations/${old.id}/archive`, { archived: true });

	const notes = await createConversation(one, [one.id]);
	await send(one, notes.id, { content: "Ghi chú riêng: mua quà sinh nhật cho mẹ 🎁" });
}

async function seedLongHistory({ one, two }, conversationId) {
	for (let index = 1; index <= LONG_MESSAGE_COUNT; index += 1) {
		await send(index % 2 ? one : two, conversationId, {
			content: `Tin nhắn dài số ${index} để thử cuộn và phân trang.`,
		});
		if (index % 100 === 0) process.stdout.write(`  long history: ${index}/${LONG_MESSAGE_COUNT}\n`);
	}
}

async function main() {
	assertSafeTarget();
	process.stdout.write(`Creating demo data through ${API_URL.origin}\n`);
	const accounts = Object.fromEntries((await Promise.all(DEMO_ACCOUNTS.map(signIn))).map((a) => [a.key, a]));

	await seedProfiles(accounts);
	const { chat, plan } = await seedShowcase(accounts);
	await seedGroup(accounts, plan);
	await seedMutedGroup(accounts);
	await seedSidebarStates(accounts);
	if (IS_LONG) await seedLongHistory(accounts, chat.id);

	process.stdout.write(`
Sign in as 1, 2 or 3 (password: ${DEMO_PASSWORD}). As User 1 you will see:
  User 3 (pinned, nickname "Ba")       reply
  User 2                               text, reply, reactions, edit, delete, link, album, portrait photo,
                                       file, two voice notes, sticker, 🎉, two pins, a bookmark, theme
  Weekend football (12+ unread)        two members' faces as its picture, @mention, gallery, forward,
                                       "Seen by", the jump-to-unread pill
  Design team (muted, unread)          its own picture, grey unread count
  Archived: Old project · Saved: your notes
`);
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
