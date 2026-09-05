# Architecture

## Overview

```
apps/web (React) ──HTTP──► apps/server (Express)
       │                          │
       └──────WebSocket──────────►│  (Socket.io)
                                   │
                                   ▼
                              PostgreSQL
```

- **HTTP (REST)** handles one-shot actions: auth, fetching conversation history, creating a conversation.
- **WebSocket** is a persistent connection used to push events the client didn't ask for: a new message arriving, a user going online, someone typing.

A client authenticates once via HTTP and gets **two** tokens: a short-lived access JWT, which goes on every request and opens the WebSocket, and a long-lived refresh token, which is the session. Persistent commands use HTTP; their deltas arrive over the socket rather than through polling.

**Why two.** A JWT is valid because it says so, and nothing can take it back before it expires. That made the old seven-day token *the session*, so signing out cleared one browser's copy and left every other copy working for the rest of the week. The access token is now fifteen minutes, so a copied one is worth minutes; the session is a `RefreshToken` row, which `revokedAt` can end. `POST /auth/refresh` trades a refresh token for a new pair — rotating it, so a stolen one works at most once — and `POST /auth/logout` revokes it. Both are unauthenticated, because a client calls them exactly when its access token has expired.

**Which transport writes what.** Anything that persists goes over HTTP and comes back to everyone as a server event: sending a message, marking a conversation read. One write path is easier to secure, and it means the sender's UI renders from the same event everyone else does, so a broadcast bug cannot hide from the person testing it.

**Which writes compete.** Sending, adding/removing a participant and renaming all lock the same
`Conversation` row before they re-check authorization and write. That makes a send versus kick, or
two people leaving, one ordered history rather than two stale snapshots racing to commit. A group
state change and its system messages share one database transaction; socket effects run only after
commit. See [ADR 0010](adr/0010-serialize-conversation-writes.md).

Typing is the one exception, and it proves the rule — it is not written anywhere, it fires several times a sentence, and it expires in seconds. On HTTP it would be a request per keystroke, each with its own round trip and auth check. So `typing:start` / `typing:stop` are the only client→server socket events, and their membership check reads `socket.rooms` rather than the database for the same reason.

## Message delivery and bandwidth

The thread is an initial HTTP snapshot plus incremental Socket.IO events. History is keyset-paged 50
messages at a time, the browser retains a bounded window, and reconnecting refetches only the newest
page to repair changes missed while the socket was down. Text sends render optimistically under a
client id; PostgreSQL stores that id under a per-author unique index, so replaying an IndexedDB outbox
command returns the original row rather than writing or broadcasting a duplicate. The browser caches
the bounded recent snapshot and unsent text/image bytes in IndexedDB, paints it before HTTP on reload,
and retries failed drafts on reconnect. Signed media URLs are replaced by inert local placeholders in
the snapshot because they expire; the online refresh mints fresh ones. See
[ADR 0017](adr/0017-durable-local-message-outbox.md).

Large JSON responses are compressed above 1KB. WebSocket compression is deliberately off: its frames
are already deltas and Socket.IO documents substantial CPU/memory overhead for `permessage-deflate`.
Binary encoding remains a measured future optimisation, not a default complexity cost.

Images follow a separate path. The browser fits a picked image inside 1600px and tries a quality-0.86
WebP, using it only when it is smaller; the optimistic bubble is already visible while this happens.
The server still treats every upload as untrusted and performs the authoritative decode, orientation,
pixel-limit check, metadata removal and WebP re-encode. A 480px derivative is used in threads and
grids; the 1600px stored image is fetched only when the viewer opens or the image is saved. See
[ADR 0016](adr/0016-bandwidth-first-message-delivery.md) for the complete pipeline and the measured
conditions that justify object storage, a durable delta log, delivery queues or a binary protocol.

## Server layering (`apps/server/src`)

Each feature lives in `modules/<feature>/` with three files:

- `*.routes.ts` — wires HTTP routes to controller functions. No logic here.
- `*.controller.ts` — reads the request, calls the service, shapes the response. No business logic here either.
- `*.service.ts` — the actual business logic and database calls. This is what you unit test.

Why split it this way: a controller shouldn't know *how* something is done (that's the service's job), and a service shouldn't know it's being called from HTTP (so the same service can be reused from a socket event handler). This is the layer that will feel like overhead on a tiny feature and pay off the moment two entry points (HTTP + socket) need the same logic.

`sockets/` holds WebSocket event handlers, following the same principle: handlers stay thin and call into the same `*.service.ts` files the HTTP controllers use.

`lib/` is for cross-cutting infrastructure (the Prisma client singleton, the logger) — nothing feature-specific belongs here.

## Data model (`apps/server/prisma/schema.prisma`)

Core persistence includes:

- `User` — account + profile
- `Conversation` — a 1-1 or group thread (no separate "DM" vs "group" table; a 1-1 chat is just a conversation with two participants)
- `ConversationParticipant` — join table between `User` and `Conversation`, and where per-user state lives: `lastReadMessageId` is here, not on `Message`, because "read" is a fact about a person and a group of ten has ten different answers for the same message. It has a twin, `lastSharedReadMessageId`, and only the twin ever leaves the process: it stops advancing when its owner turns read receipts off, so hiding them is a value that was never written rather than a filter applied on the way out — and switching them back on therefore reveals nothing about the period in between (phase 13). `role` is here too: exactly one participant of a non-empty group is its `OWNER`, with optional `ADMIN` rows for naming and ordinary-member moderation. Only the owner manages roles, ownership and invite policy ([ADR 0018](adr/0018-group-admins-and-invite-policy.md)). PostgreSQL enforces the single owner with a partial unique index and deferred aggregate trigger because Prisma cannot express a cross-row constraint ([ADR 0010](adr/0010-serialize-conversation-writes.md))
- `Message` — belongs to a `Conversation`, authored by a `User`. `content` is an empty string when the message is only an image. `clientId` is the sending device's optional idempotency key, unique per non-null author so an offline replay converges on one row ([ADR 0017](adr/0017-durable-local-message-outbox.md)). A `kind = SYSTEM` message is the exception with no author at all: it is the group event log ("An added Binh"), stored as a message so it survives a reload and sits in order among the messages around it ([ADR 0009](adr/0009-system-messages.md)). A database check rejects the contradictory shape (`SYSTEM` with an author). A `USER` message *without* one is not a contradiction: since phase 13 an account can be deleted, and its messages stay behind with `authorId` null — the relation is `ON DELETE SET NULL` rather than cascade, because deleting them would empty other people's conversations and remove rows that read markers and paging cursors point at. `kind`, not the null, is what tells a system line from an orphaned message
- `PasswordResetToken` — a one-time link, stored only as a SHA-256 of the token that was mailed
- `RefreshToken` — one signed-in session, and the only thing here that can be revoked. Stored as a SHA-256 for the same reason the reset link is: a leaked database must not be a drawer full of working sessions. Single use — a refresh spends the row and creates its replacement in one transaction, claimed with a conditional update so two tabs waking together cannot turn one session into two
- `MessageReaction` — one person's reaction to one message, **at most one**. The primary key `(messageId, userId)` *is* that rule: the database cannot hold two reactions from the same person on the same message however the service is called, so picking a second emoji is an update rather than an insert — which is what Messenger, Instagram and Telegram all do. It used to include `kind` and store a Postgres enum of five; phase 29 opened the set, and with an open set the old key is not merely different but unbounded, since one person could put forty distinct chips under one sentence. `emoji` is a `VarChar(64)` and the argument that made it an enum is now enforced at the request boundary instead: `toggleReactionSchema` admits a single fully-qualified RGI emoji (`\p{RGI_Emoji}` under the `v` flag) and nothing else, so `❤` is a 400 and only `❤️` reaches the column — which is what keeps "the same reaction" decidable. Unique among the things pointing at a `User` here, it is `ON DELETE CASCADE`: a reaction carries no history worth keeping without the person who left it, nothing points at it, and the count simply drops by one. The DTO names everyone (`userIds`) rather than counting, because the message is broadcast to the whole room as one payload — anything answering "is this mine?" would be answering it for whoever triggered the write, and it is also what the reactor list is built from
- `Message.replyToId` — a self-relation, not a copy of the quoted text. A copy goes stale the moment the original is edited and keeps showing words its author has since retracted; resolving the quote on every read means an edited parent re-quotes with its new text, an image parent carries a fresh signed thumbnail URL, and a deleted one quotes as a tombstone. The parent must be in the **same conversation**, which is a rule no foreign key can express — it spans two columns of the parent row — so `sendMessage` enforces it inside the same transaction that writes the message, scoped by conversation rather than fetched and compared, so a miss never confirms that an id exists somewhere the sender cannot see
- `Sticker` — an image somebody saved to send again. Its own table rather than a flag on `Attachment`, because the lifetimes differ: an attachment dies with its message, a sticker outlives every message it was sent in. Sending one **copies** its bytes into a fresh attachment for exactly that reason — clearing the tray must not blank pictures out of conversations it was already sent to. Served through the attachment path, signed token and all
- `Attachment` — an image, ordinary file, or voice message. `kind` determines which metadata is valid: image dimensions, a file's normalized display name, or audio duration plus 64 waveform buckets. Images are re-encoded to WebP and get a 480px thumbnail; files are opaque `.bin` downloads; voice is normalized to AAC/MP4. `conversationId` is deliberately denormalized and indexed with kind/time so the vault is one index scan rather than a join on every page. `position` preserves gallery order and `(messageId, position)` remains unique.
- `MessageLink`, `MessageStar`, `MessageMention`, and `PinnedMessage` — the durable indexes behind the vault and small message actions. Links are extracted at send/edit time without fetching their target; stars are per viewer; mentions store stable user ids rather than reparsing handles after a rename; and a conversation holds at most three pinned messages.

Modeling 1-1 chat as a conversation with exactly two participants (rather than a separate table) means group chat isn't a bolt-on later — it's the same code path from day one.

Two things deliberately have **no** table:

- **Typing.** It fires several times a sentence and is worthless a few seconds later.
- **Presence.** A stored "online" flag is a lie waiting to happen — the process that would clear it is exactly the one that crashed, and every stale row then shows someone as online forever. It is derived from live socket connections instead, which cannot go stale because there is no state to forget.

## Files (`lib/avatar-storage.ts`, `lib/attachment-storage.ts`)

Avatars and message attachments are deliberately separate modules rather than one shared store. An avatar is one image per user, overwritten in place, public and cached forever; an attachment is one immutable private object reached through a signed URL. Attachments now include images, opaque files and normalized voice audio, so storage chooses a fixed server extension from the stored kind rather than trusting an uploaded name.

Images share the re-encode and its security reason. Arbitrary files cannot.

### Avatars

The URL for an avatar is **derived, never stored**. The database keeps `User.avatarUpdatedAt`; the server builds `{PUBLIC_URL}/users/:id/avatar?v=<timestamp>` from it.

That is the same shape Rocket.Chat and Mattermost use, and it buys two things a stored URL cannot: the version parameter changes the moment a picture does, so browsers can cache avatars indefinitely without ever showing a stale one; and no row contains a storage path, so swapping local disk for S3 is a change to `lib/avatar-storage.ts` and nothing else.

Uploads are decoded and re-encoded to WebP rather than stored as they arrived. That is a security control, not a size optimisation: a browser decides what a file is by sniffing its bytes, so anything that survives a MIME check could otherwise be served back from this origin as something other than an image. It also drops metadata, which for a photo straight off a phone is a GPS fix.

### Attachments

An attachment is private content inside a conversation, so "addressed by an id nobody can guess" — which is enough for a public profile picture — is not enough here. `AttachmentDTO.url` carries a signed token scoped to that one attachment, minted per response and expiring after an hour, and `GET /attachments/:id` is the app's second and last unauthenticated route. A bad token answers 404 rather than 401, so the endpoint never confirms that an id exists.

Images are opportunistically resized and encoded in the browser to save upstream bytes, then decoded
to pixels and re-encoded to WebP again on the server because only that pass is a security boundary. An
ordinary file cannot use that control: its bytes are sniffed, browser-interpretable types are demoted,
and the response is always a download with `nosniff` and a sandbox CSP ([ADR 0013](adr/0013-safe-arbitrary-file-downloads.md)). Voice uploads are decoded for validation, duration and waveform, then normalized to AAC/MP4 so Safari and Chromium play the same stored file ([ADR 0014](adr/0014-portable-voice-message-format.md)). This is deliberately not described as antivirus.

Both kinds of token are signed with `JWT_SECRET`, so attachment tokens carry a `typ` claim and `requireAuth` rejects any token that has one — otherwise an attachment token presented as a bearer token would authenticate as a user whose id is an attachment id.

### Password reset

Issuing a link locks the `User` row while it spends previous links and creates the replacement, so
two simultaneous requests leave only one current token. Redeeming uses a conditional claim inside
the same transaction as the password update; only one request can change a still-unused, unexpired
row.

Known and unknown addresses both receive an empty 204 after a 300ms response floor. Mail delivery is
started only after the token commits and is not awaited, because provider latency and failure exist
only on the known-account path and would otherwise reveal membership. The development console
transport is process-local. A production provider needs a durable outbox/worker so a process crash
between commit and delivery can be retried without putting delivery back on the HTTP path.

See [ADR 0007](adr/0007-signed-attachment-urls.md) for the alternatives that were rejected and what this costs.

## Running more than one instance

Two things in this app keep state outside the database, and both are per-process by default:
rate-limit counters, and the Socket.io room registry. Neither is a problem until there is a second
instance, at which point each keeps its own tally and a message broadcast by one reaches nobody
connected to the other — including presence, which asks the adapter who is connected.

Setting `REDIS_URL` moves both into Redis: `rate-limit-redis` for the counters,
`@socket.io/redis-adapter` for the rooms. Everything else is already stateless — the JWT carries the
session, uploads go to a directory both instances share, and presence is derived rather than stored,
so there is no per-process state left to reconcile.

The adapter is the **sharded** one (phase 46). The classic adapter already publishes single-room
emits on room channels, but every node subscribes to the namespace wildcard. Sharded dynamic mode
subscribes only nodes holding members of that public room to its channel, reducing Redis fanout.
Multi-room broadcasts and `fetchSockets()` requests still use the namespace-wide channel.
Redis 7 is required. Classic and sharded adapters do not exchange events; upgrades and rollbacks
must switch the whole API pool together. See [the transition procedure](DEPLOYMENT.md#changing-the-socketio-adapter).

Each auth flow owns a distinct Redis key namespace (`login`, `register`, `refresh`, and so on).
Redis stores only the generated identity such as an IP or user id; without the flow namespace,
otherwise unrelated requests from the same identity would consume one another's quota even though
their limits and windows differ.

It is optional rather than required so that `npm run verify` and a plain `npm run dev:server` need
one container instead of two. `docker-compose.prod.yml` always sets it, runs two API instances to
keep the single-instance assumptions from creeping back, and the server refuses to boot in production
when neither Redis nor an explicit `SINGLE_INSTANCE="true"` declaration exists.

The uploads directory is the remaining shared-filesystem dependency: both instances mount one volume,
because an avatar uploaded through one has to be servable by the other. Object storage is what
replaces it, and [ADR 0004](adr/0004-avatar-storage.md) and [ADR 0007](adr/0007-signed-attachment-urls.md)
are both written so that swap touches one module each.

`docker-compose.prod.yml` routes both instances through one internal Caddy gateway. The browser uses
WebSocket-only Socket.IO, so a connected socket stays on the upstream that accepted it and HTTP
polling affinity is unnecessary. Public ingress is an optional Cloudflare Tunnel container: it joins
the same Docker network, maps separate web/API hostnames, and makes only outbound connections. Host
ports bind to loopback so public traffic cannot bypass that edge. See
[DEPLOYMENT.md](DEPLOYMENT.md) for the zero-monthly-bill boundary and external launch conditions.

## Provider-free observability

Each API process exposes `GET /metrics` in Prometheus's text format when `METRICS_TOKEN` is set; it is
mandatory in production and accepted only as a bearer token. The registry covers process resources,
bounded HTTP route groups, request payload size, message sends, image normalisation, Prisma queries
and socket connections. Labels are deliberately finite — no URL, id, handle or error string — so
observability cannot become a user-data leak or a time-series-per-conversation memory leak.

Registries are process-local. A collector must scrape `api-1` and `api-2` independently and aggregate
them; scraping through Caddy would randomly read only one process on each interval. Pino remains the
structured log, Prometheus supplies time-series and percentile calculations, and neither requires a
hosted provider or DSN.

## Shared types (`packages/shared-types`)

Both `apps/server` and `apps/web` depend on this workspace package for the shapes that cross the wire (API request/response bodies, socket event payloads). When you change what a message looks like over the wire, you change it in one place and both sides get a compile error if they're out of sync — instead of finding out at runtime.

## Web structure (`apps/web/src`)

The frontend is organized the opposite way from the server: **by feature, not by layer**.

```
features/<name>/{pages,components,hooks,utils,constants,types}   # one feature owns its code
components/ hooks/ utils/ lib/ api/ constants/ types/ styles/    # shared across 2+ features
```

The two apps deliberately do not share a structure. The server's work is a small set of operations
applied to every resource (validate → authorize → persist), so splitting by layer keeps that pipeline
visible. The web app's work is a handful of independent user-facing surfaces, so splitting by feature
keeps each surface deletable in one folder.

The rule that keeps it honest: **never import across features.** If `chat` and `auth` both need
something, it moves up into the shared folders. See
[conventions/frontend.md](conventions/frontend.md).

## Conventions

Three rules matter enough to repeat here; the full set lives in [`conventions/`](conventions/):

- **Validation at the boundary**: every route handler validates `req.body`/`req.params` with a Zod schema before it touches a controller. Never trust client input past that point.
- **Errors**: services throw typed errors (e.g. `NotFoundError`, `ValidationError`); a single error-handling middleware in `middlewares/` turns those into HTTP responses. Handlers don't `try/catch` and format errors individually.
- **No business logic in routes or controllers.** If you're writing an `if` that isn't about parsing input or picking a status code, it belongs in a service.

| Document | Scope |
| --- | --- |
| [conventions/frontend.md](conventions/frontend.md) | React / TypeScript rules for `apps/web` |
| [conventions/backend.md](conventions/backend.md) | Node / Express / Prisma rules for `apps/server` |
| [conventions/git-and-workflow.md](conventions/git-and-workflow.md) | Commits, branches, PR checklist |
| [`../CLAUDE.md`](../CLAUDE.md) | The conventions block those files resolve against |
