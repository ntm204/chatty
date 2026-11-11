# ADR 0016 — Bandwidth-first message delivery

Status: accepted

## Context

Messenger's useful lesson is not a universal image percentage. Meta's mobile-first rewrite replaced
large pull responses with an initial snapshot plus pushed deltas, kept recent delivery independent
from long-term storage through a totally ordered queue, and replaced JSON with a compact wire format.
Its later LightSpeed work put one local database and one sync system behind every feature. Large media
has its own blob path; the message carries a pointer rather than the bytes.

Chatty is much smaller, but the same boundaries still identify waste. It already pages history,
pushes individual changes over one WebSocket, renders an optimistic message, and stores attachment
bytes outside the message row. It was still sending original camera resolution upstream, downloading
the 1600px image into a 380px thread slot, and returning large JSON pages without HTTP compression.

## Decision

Chatty keeps one authoritative write path and makes bytes follow attention:

```text
text:   optimistic row -> HTTP command -> PostgreSQL transaction -> socket delta + HTTP acknowledgement
image:  local preview  -> client resize/WebP -> HTTP multipart -> server validation/WebP -> file store
                                                                  |-> 480px thumbnail -> thread
                                                                  `-> 1600px image ----> viewer/save
```

- Persistent commands remain HTTP. Server-to-client changes and ephemeral typing remain on the
  existing WebSocket. Forcing everything through HTTP polling would add handshakes; moving durable
  writes into socket handlers would create a second authorization and validation path.
- Before upload, a browser that supports `createImageBitmap` and WebP fits an image inside 1600px and
  encodes at quality 0.86. The result is used only when it is smaller. Failure, an unsupported codec,
  or an already efficient image keeps the original, so preprocessing can never make sending less
  compatible.
- The browser's result is never trusted. The server still decodes, rotates, strips metadata, limits
  decoded pixels, fits inside 1600px, and re-encodes at quality 82. Client processing saves uplink
  bytes and some server resize work; server processing remains the security boundary.
- A thread, album stack, vault grid, or thumbnail strip requests the 480px derivative. The full image
  is fetched only when the viewer opens (and for save/download). Media bytes remain separate from
  `MessageDTO`.
- Express compresses compressible responses above its 1KB default threshold, negotiating Brotli,
  gzip, or deflate with the client. Images and other already compressed media are unaffected.
- WebSocket `permessage-deflate` is on for frames of 512 B and more, without context takeover
  (amended 2026-11-11). Measured on real payloads, a `message:new` frame shrinks 41% (632 → 376 B)
  for about 12 µs of CPU, while typing, presence and read events stay below the threshold and raw.
  Without context takeover no zlib state outlives a message, so an idle connection costs nothing —
  the memory overhead Socket.IO warns about is the per-connection context this setting avoids.
- JSON remains the wire format. Measured 2026-11-11 (acceptance report): a schema-style binary
  encoding would save ~13% of an already Brotli-compressed history page and ~280 B per socket
  message, and normalizing repeated `author` objects saves nothing once Brotli has deduplicated them
  (2 027 → 2 041 B). Compressing the one uncompressed path, the socket, captured most of that gain
  with one setting instead of a new codec, schema versioning and unreadable payloads. Revisit only
  if measured non-media egress or parse time becomes a bottleneck.

There is deliberately no claim that every image becomes “25% of the original”. Camera resolution,
texture, source codec and transparency decide the result. A maximum useful dimension, a quality
target, and “only if smaller” are stable rules; a percentage is not.

## Scale boundary

The next architecture is not blocked by code complexity, but it needs evidence or infrastructure:

- **Object storage/direct media upload:** required before API instances no longer share one host or
  one upload volume. It is deliberately deferred, not blocked, in the selected single-host topology.
  When the threshold is crossed, choose the provider, bucket, region, IAM credentials, CORS policy,
  signed-URL method and retention/lifecycle policy.
  At that point the client uploads bytes to the blob store and sends only the resulting key to the
  message command; the server must still arrange trusted normalization rather than accepting an
  arbitrary client object as safe.
- **Durable snapshot + delta cursor:** add an append-only, monotonically ordered event stream when
  reconnect gaps commonly exceed the newest 50-message repair page, offline use becomes a product
  requirement, or multi-region delivery needs independent consumer positions. Until then, the
  current database rows are the source of truth and socket reconnect refetches the newest page.
- **Queue recent delivery apart from long-term storage:** add a durable per-conversation/user queue
  when measurements show storage latency on the send critical path, or independent fan-out/storage
  recovery is required. A queue before that point creates two durable systems and replay semantics
  without removing a demonstrated bottleneck.
- **Local durable client store:** completed in [ADR 0017](0017-durable-local-message-outbox.md).
  IndexedDB holds bounded recent snapshots and unsent commands, while PostgreSQL idempotency makes
  replay converge on one stored message.
- **Binary wire encoding or WebSocket compression:** benchmark representative payload distribution,
  p95 latency, server CPU/memory and total non-media egress first. Adopt only when the saved bytes are
  material after delta delivery and HTTP compression.
- **Observability:** no external provider or DSN is required. Item 126 adds a protected
  Prometheus-compatible endpoint; before declaring any threshold above crossed, production needs
  p50/p95/p99 send latency, error/retry rate, payload sizes, image-normalization time, socket reconnect
  gaps and database query latency.

## Consequences

- Typical phone photos cross the uplink at chat resolution rather than camera resolution, while
  optimistic rendering still uses the local original immediately.
- Scrolling a message page no longer downloads full-size media that may never be opened.
- Large JSON history/list responses consume less downstream bandwidth with no wire-type change.
- Client encoding uses device CPU and can delay the actual network request, but it runs after the
  optimistic bubble appears and processes a gallery sequentially to avoid a decode-memory spike.
- Local attachment storage remains the limiting deployment assumption. This decision makes it
  explicit; it does not pretend that client compression turns a shared volume into distributed blob
  storage.

## Sources

- [Building Mobile-First Infrastructure for Messenger](https://engineering.fb.com/2014/10/09/production-engineering/building-mobile-first-infrastructure-for-messenger/)
- [@Scale 2014: “MySQL for Messaging” recap and video](https://engineering.fb.com/2014/10/21/core-infra/scale-2014-recap-of-data-track/)
- [Project LightSpeed: Rewriting Messenger to be faster, smaller, and simpler](https://engineering.fb.com/2020/03/02/data-infrastructure/messenger/)
- [Messenger End-to-End Encryption Overview](https://engineering.fb.com/wp-content/uploads/2023/12/MessengerEnd-to-EndEncryptionOverview_12-6-2023.pdf)
- [Socket.IO server options: `perMessageDeflate`](https://socket.io/docs/v4/server-options/#permessagedeflate)
