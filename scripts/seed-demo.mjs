#!/usr/bin/env node

import { Buffer } from "node:buffer";
import process from "node:process";
import { URL, URLSearchParams } from "node:url";

const { Blob, FormData, Headers, fetch } = globalThis;

const API_URL = new URL(process.env.CHATTY_API_URL ?? "http://127.0.0.1:4000");
const DEMO_PASSWORD = "ChattyDemo123";
const DIRECT_MESSAGE_COUNT = 125;
const GROUP_MESSAGE_COUNT = 175;
const GROUP_NAME = "Chatty long-run lab";

const DEMO_ACCOUNTS = [
	{ key: "lan", email: "lan.demo@chatty.test", handle: "lan_demo", displayName: "Lan" },
	{ key: "minh", email: "minh.demo@chatty.test", handle: "minh_demo", displayName: "Minh" },
	{ key: "mai", email: "mai.demo@chatty.test", handle: "mai_demo", displayName: "Mai" },
	{ key: "bao", email: "bao.demo@chatty.test", handle: "bao_demo", displayName: "Bảo" },
	{ key: "admin", email: "admin.demo@chatty.test", handle: "admin_demo", displayName: "Admin" },
];

const DIRECT_LINES = [
	"Mình đã nhận được nội dung, đang kiểm tra trên mạng chậm.",
	"Tin nhắn này dùng để kiểm tra cuộn lên và tải trang lịch sử cũ.",
	"Hẹn gặp lúc 19:30 nhé, thử tìm kiếm cả có dấu và không dấu.",
	"Đã xem ảnh và file, bố cục vẫn giữ đúng khi tải lại.",
	"Nếu mất kết nối, bản nháp cần được gửi lại đúng một lần.",
];

const GROUP_LINES = [
	"Cập nhật tiến độ: phần realtime vẫn hoạt động ổn định.",
	"Mọi người kiểm tra unread, read receipt và thứ tự tin nhắn giúp nhé.",
	"Đây là dữ liệu dài để thử phân trang 50 tin mỗi lần.",
	"Mình đang thử trên điện thoại, ảnh nhỏ tải trước và ảnh lớn mở sau.",
	"Ghi chú hiệu năng: chỉ truyền delta mới thay vì tải lại cả cuộc trò chuyện.",
];

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
	const responseText = await response.text();
	let payload = null;
	if (responseText) {
		try {
			payload = JSON.parse(responseText);
		} catch {
			payload = responseText;
		}
	}

	if (!response.ok && !options.allowStatuses?.includes(response.status)) {
		throw new Error(`${options.method ?? "GET"} ${path} returned ${response.status}: ${responseText}`);
	}

	return { status: response.status, payload };
}

async function ensureAccount(account) {
	const login = await request("/auth/login", {
		method: "POST",
		json: { email: account.email, password: DEMO_PASSWORD },
		allowStatuses: [401],
	});
	if (login.status === 200) return { ...account, ...login.payload.user, token: login.payload.token };

	const registration = await request("/auth/register", {
		method: "POST",
		json: { ...account, password: DEMO_PASSWORD },
		allowStatuses: [409],
	});
	if (registration.status === 409) {
		throw new Error(`The demo identity ${account.email} already exists with different credentials.`);
	}

	return { ...account, ...registration.payload.user, token: registration.payload.token };
}

function sameParticipants(conversation, userIds) {
	const actual = conversation.participants.map((participant) => participant.id).sort();
	const expected = [...userIds].sort();

	return actual.length === expected.length && actual.every((userId, index) => userId === expected[index]);
}

async function ensureConversations(accounts) {
	const owner = accounts.lan;
	const page = await request("/conversations?limit=100", { token: owner.token });
	const directUserIds = [accounts.lan.id, accounts.minh.id];
	const groupUserIds = Object.values(accounts).map((account) => account.id);

	let direct = page.payload.items.find(
		(conversation) => !conversation.isGroup && sameParticipants(conversation, directUserIds),
	);
	if (!direct) {
		direct = (
			await request("/conversations", {
				method: "POST",
				token: owner.token,
				json: { participantIds: [accounts.minh.id] },
			})
		).payload;
	}

	let group = page.payload.items.find((conversation) => conversation.isGroup && conversation.name === GROUP_NAME);
	if (group) {
		const expectedUserIds = new Set(groupUserIds);
		const unexpectedParticipants = group.participants.filter((participant) => !expectedUserIds.has(participant.id));
		if (unexpectedParticipants.length > 0) {
			throw new Error(`A group named "${GROUP_NAME}" already exists with a different member set.`);
		}
	}
	if (!group) {
		group = (
			await request("/conversations", {
				method: "POST",
				token: owner.token,
				json: {
					name: GROUP_NAME,
					participantIds: [accounts.minh.id, accounts.mai.id, accounts.bao.id],
				},
			})
		).payload;
	}
	for (const account of Object.values(accounts)) {
		if (group.participants.some((participant) => participant.id === account.id)) continue;
		group = (
			await request(`/conversations/${group.id}/members`, {
				method: "POST",
				token: owner.token,
				json: { userId: account.id },
			})
		).payload;
	}

	// Keep Mai's original role for existing demo users and give the explicitly
	// named account the same permissions, so the seed can evolve in place.
	for (const account of [accounts.mai, accounts.admin]) {
		const participant = group.participants.find((candidate) => candidate.id === account.id);
		if (participant?.role === "admin") continue;
		group = (
			await request(`/conversations/${group.id}/members/${account.id}/role`, {
				method: "PUT",
				token: owner.token,
				json: { role: "admin" },
			})
		).payload;
	}
	if (group.invitePolicy !== "managers") {
		group = (
			await request(`/conversations/${group.id}/invite-policy`, {
				method: "PUT",
				token: owner.token,
				json: { invitePolicy: "managers" },
			})
		).payload;
	}

	return { direct, group };
}

async function sendJsonMessage(account, conversationId, clientId, input) {
	return (
		await request(`/conversations/${conversationId}/messages`, {
			method: "POST",
			token: account.token,
			json: { ...input, clientId },
		})
	).payload;
}

async function seedTextSeries(conversationId, accounts, count, prefix, lines) {
	let replyAnchor = null;
	for (let index = 1; index <= count; index += 1) {
		const account = accounts[(index - 1) % accounts.length];
		const line = lines[(index - 1) % lines.length];
		const message = await sendJsonMessage(account, conversationId, `${prefix}-text-${index}`, {
			content: `[${String(index).padStart(3, "0")}/${String(count)}] ${line}`,
		});
		if (index === Math.floor(count * 0.6)) replyAnchor = message;
		if (index % 50 === 0) process.stdout.write(`  ${prefix}: ${index}/${count} text messages\n`);
	}

	return replyAnchor;
}

function createDemoImage(label, background, accent) {
	const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="${background}"/>
  <circle cx="960" cy="170" r="230" fill="${accent}" opacity="0.75"/>
  <path d="M0 650 L420 280 L720 560 L930 390 L1200 690 V800 H0Z" fill="${accent}" opacity="0.38"/>
  <text x="72" y="118" font-family="sans-serif" font-size="38" fill="#25231f">CHATTY DEMO</text>
  <text x="72" y="210" font-family="sans-serif" font-size="88" font-weight="700" fill="#25231f">${label}</text>
  <text x="76" y="270" font-family="sans-serif" font-size="28" fill="#25231f">1200 × 800 · normalized by the server</text>
</svg>`;

	return new Blob([markup], { type: "image/svg+xml" });
}

function createVoiceSample() {
	const sampleRate = 16_000;
	const durationSeconds = 2.4;
	const sampleCount = Math.round(sampleRate * durationSeconds);
	const wav = Buffer.alloc(44 + sampleCount * 2);
	wav.write("RIFF", 0);
	wav.writeUInt32LE(36 + sampleCount * 2, 4);
	wav.write("WAVEfmt ", 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(sampleRate, 24);
	wav.writeUInt32LE(sampleRate * 2, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write("data", 36);
	wav.writeUInt32LE(sampleCount * 2, 40);

	for (let index = 0; index < sampleCount; index += 1) {
		const time = index / sampleRate;
		const pulse = 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * 2 * 1.8 * time));
		const sample = Math.round(Math.sin(Math.PI * 2 * 440 * time) * pulse * 12_000);
		wav.writeInt16LE(sample, 44 + index * 2);
	}

	return new Blob([wav], { type: "audio/wav" });
}

async function sendMultipartMessage(account, conversationId, clientId, fields) {
	const form = new FormData();
	form.set("clientId", clientId);
	if (fields.content) form.set("content", fields.content);
	for (const [index, image] of (fields.images ?? []).entries()) {
		form.append("attachment", image, `chatty-demo-${index + 1}.svg`);
	}
	if (fields.file) form.set("file", fields.file.blob, fields.file.name);
	if (fields.voice) form.set("voice", fields.voice, "chatty-demo-voice.wav");

	return (
		await request(`/conversations/${conversationId}/messages`, {
			method: "POST",
			token: account.token,
			body: form,
		})
	).payload;
}

async function seedDirectMedia(conversation, accounts, replyAnchor) {
	const imageMessage = await sendMultipartMessage(accounts.lan, conversation.id, "demo-direct-image", {
		content: "Ảnh kiểm tra trong cuộc trò chuyện trực tiếp.",
		images: [createDemoImage("DIRECT IMAGE", "#f3efe3", "#e9684a")],
	});
	const fileMessage = await sendMultipartMessage(accounts.minh, conversation.id, "demo-direct-file", {
		file: {
			name: "ghi-chú-kiểm-thử.txt",
			blob: new Blob(["Chatty demo file\nDirect conversation\nDownload verified through the API.\n"], {
				type: "text/plain",
			}),
		},
	});
	await sendJsonMessage(accounts.lan, conversation.id, "demo-direct-reply", {
		content: "Mình trả lời lại một tin ở trang lịch sử cũ để kiểm tra reply context.",
		replyToId: replyAnchor.id,
	});
	await sendJsonMessage(accounts.minh, conversation.id, "demo-direct-forward", {
		forwardOfMessageId: imageMessage.id,
	});
	await request(`/conversations/${conversation.id}/messages/${fileMessage.id}/star`, {
		method: "PUT",
		token: accounts.lan.token,
	});
}

async function seedGroupMedia(conversation, accounts, replyAnchor) {
	await sendMultipartMessage(accounts.mai, conversation.id, "demo-group-gallery", {
		content: "Bộ ba ảnh để kiểm tra gallery, thumbnail và lightbox.",
		images: [
			createDemoImage("GALLERY 01", "#f4efe3", "#dc6247"),
			createDemoImage("GALLERY 02", "#e8efe9", "#4b7f68"),
			createDemoImage("GALLERY 03", "#ebe8f2", "#705c91"),
		],
	});
	await sendMultipartMessage(accounts.bao, conversation.id, "demo-group-voice", {
		voice: createVoiceSample(),
	});
	const fileMessage = await sendMultipartMessage(accounts.lan, conversation.id, "demo-group-file", {
		file: {
			name: "chatty-demo-checklist.txt",
			blob: new Blob(
				[
					"Chatty long conversation checklist\n",
					"- text pagination\n- image thumbnails\n- voice playback\n- file download\n- replies and mentions\n",
				],
				{ type: "text/plain" },
			),
		},
	});
	const replyMessage = await sendJsonMessage(accounts.lan, conversation.id, "demo-group-reply", {
		content: "@Mai mình đã ghim phần này để mọi người kiểm tra nhanh.",
		replyToId: replyAnchor.id,
		mentionedUserIds: [accounts.mai.id],
	});
	await sendJsonMessage(accounts.minh, conversation.id, "demo-group-link", {
		content: "Link kiểm tra metadata mà server không tự truy cập: https://example.com/chatty-demo",
	});
	await request(`/conversations/${conversation.id}/messages/${fileMessage.id}/star`, {
		method: "PUT",
		token: accounts.mai.token,
	});
	await request(`/conversations/${conversation.id}/messages/${replyMessage.id}/pin`, {
		method: "PUT",
		token: accounts.lan.token,
	});
}

async function inspectConversation(account, conversationId) {
	let before;
	let messageCount = 0;
	const attachmentKinds = new Set();
	let hasReply = false;

	do {
		const query = new URLSearchParams({ limit: "100" });
		if (before) query.set("before", before);
		const page = (await request(`/conversations/${conversationId}/messages?${query}`, { token: account.token }))
			.payload;
		messageCount += page.length;
		for (const message of page) {
			for (const attachment of message.attachments) attachmentKinds.add(attachment.kind);
			if (message.replyTo) hasReply = true;
		}
		before = page.length === 100 ? page.at(-1).id : undefined;
	} while (before);

	return { messageCount, attachmentKinds: [...attachmentKinds].sort(), hasReply };
}

async function main() {
	assertSafeTarget();
	process.stdout.write(`Creating reusable demo data through ${API_URL.origin}\n`);

	const authenticated = await Promise.all(DEMO_ACCOUNTS.map(ensureAccount));
	const accounts = Object.fromEntries(authenticated.map((account) => [account.key, account]));
	const conversations = await ensureConversations(accounts);

	const [directAnchor, groupAnchor] = await Promise.all([
		seedTextSeries(
			conversations.direct.id,
			[accounts.lan, accounts.minh],
			DIRECT_MESSAGE_COUNT,
			"demo-direct",
			DIRECT_LINES,
		),
		seedTextSeries(
			conversations.group.id,
			[accounts.lan, accounts.minh, accounts.mai, accounts.bao],
			GROUP_MESSAGE_COUNT,
			"demo-group",
			GROUP_LINES,
		),
	]);

	await Promise.all([
		seedDirectMedia(conversations.direct, accounts, directAnchor),
		seedGroupMedia(conversations.group, accounts, groupAnchor),
	]);

	const [directSummary, groupSummary] = await Promise.all([
		inspectConversation(accounts.lan, conversations.direct.id),
		inspectConversation(accounts.lan, conversations.group.id),
	]);
	const requiredKinds = ["audio", "file", "image"];
	const observedKinds = new Set([...directSummary.attachmentKinds, ...groupSummary.attachmentKinds]);
	if (directSummary.messageCount < DIRECT_MESSAGE_COUNT || groupSummary.messageCount < GROUP_MESSAGE_COUNT) {
		throw new Error("The long-conversation verification did not find the expected message count.");
	}
	if (!requiredKinds.every((kind) => observedKinds.has(kind)) || !directSummary.hasReply || !groupSummary.hasReply) {
		throw new Error("The mixed-media verification did not find every seeded message shape.");
	}

	process.stdout.write("\nDemo accounts (same password for all):\n");
	for (const account of authenticated) {
		const roleLabel = account.key === "admin" ? "  (admin in Chatty long-run lab)" : "";
		process.stdout.write(`  ${account.email}  @${account.handle}${roleLabel}\n`);
	}
	process.stdout.write(`  password: ${DEMO_PASSWORD}\n\n`);
	process.stdout.write(`Direct conversation: ${directSummary.messageCount} messages\n`);
	process.stdout.write(
		`Group "${GROUP_NAME}": ${groupSummary.messageCount} messages; media=${groupSummary.attachmentKinds.join(",")}\n`,
	);
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
