# Product direction

Chatty is a **fast, colorful, relationship-first messenger**. It combines proven interaction ideas from
social products without copying their identity, growth loops or infrastructure. A feature belongs
only when it improves a conversation, trust between people, or the cost of delivering those two.

This is the filter for future roadmap decisions. “Platform X has it” is evidence that an interaction
is familiar; it is not, on its own, a reason to build it.

## Current implementation focus

The owner's current priority is to refine the features and interface people already use: fewer
unnecessary steps, preserved drafts and reading position, clear failure recovery, discoverable
search/Saved, and consistent touch/keyboard behaviour. The
[experience polish plan](plans/experience-polish.md) is the active backlog and defines the scope and
acceptance criteria of each small batch.

Public launch and large product additions are deferred for this sequence. Local built-web checks
remain relevant where they prove existing previews, offline behaviour or navigation; they do not
require a public deployment. The foundations below remain context for future decisions.

## Product contract

1. **Conversation before content consumption.** Chatty opens on people and threads, not an addictive
   recommendation feed. There are no ads, engagement streaks or infinite public scroll in the core.
2. **Immediate feedback, durable truth.** A send appears immediately, survives a transient failure as
   a retryable draft, and eventually reconciles to one server record. The interface never hides a
   disconnected or failed state.
3. **Private by default, honest about guarantees.** Blocking, restriction, session revocation and
   signed media are enforced server-side. Chatty will not claim end-to-end encryption until a
   reviewed protocol, multi-device key model and recovery story exist.
4. **Useful on ordinary phones and networks.** Delta delivery, bounded history, thumbnails and
   client-side image reduction are product behaviour, not deployment trivia.
5. **Zero recurring vendor bill first.** The first public version may require a domain and free
   accounts. A paid dependency needs a measured limit, an explicit budget and a migration reason.
6. **One recognisable Chatty interface.** Familiar placement is good; copying another product's
   visual identity is not. Nostalgic maximalism is the visual language: colorful stationery,
   collaged welcome artwork, crisp ink edges and restrained motion. Reading surfaces stay calm,
   with accessible text contrast and distinct action, notification and presence colors.
   See [visual direction](design/maximalism.md).

## What is worth carrying forward

| Source | Value to keep | Chatty expression | What not to copy |
| --- | --- | --- | --- |
| Messenger | Instant sends, snapshot plus deltas, media fetched by attention | Optimistic bubbles, HTTP snapshots, socket events, 480px thread images and full viewer images | Infrastructure for billions before measurements require it |
| Telegram | Fast multi-device history, search, saved messages, media/file utility | Keyset history, Vietnamese-friendly search, personal and conversation vaults, forwarding, pins, stickers | A crowded settings surface or every power feature in the composer |
| WhatsApp | A simple conversation-first mental model and clear group safety | Mobile list-to-thread navigation, read/typing state, blocking, explicit invite permissions and shared admins | Phone-number identity as a mandatory product constraint |
| Signal | Privacy as an architectural property | Short/revocable sessions, metadata-conscious uploads, next: a written E2EE protocol decision before code | Home-grown cryptography or a lock icon before the guarantee is true |
| Discord | Durable communities, roles and discoverable context | A small owner/admin/member hierarchy; channels only when groups demonstrate that need | Server/channel complexity in ordinary private chats |
| Instagram | Media composition and direct manipulation | Compact albums, reactions, captions, zoom/pan/rotate, forwarding and saving | A recommendation feed or attention-maximising counters |
| Zalo | Vietnamese usage and tolerance of constrained devices/networks | Accent-insensitive search, Vietnamese emoji keywords and bandwidth-first media | Tying the experience to one market-specific account system |

These are design references, not a checklist. When two platforms solve the same need differently,
Chatty picks the version that scores best against the rubric below.

## Feature selection rubric

Score a proposal from 0–3 on each axis before it becomes a roadmap item:

- **Daily value:** how often does it remove friction from a real conversation?
- **Trust:** does it make control, privacy or failure more truthful?
- **Network/device fit:** does it improve or at least preserve low-bandwidth and mid-range-device use?
- **Zero-cost operation:** can the first version run on the chosen single-host stack without a new
  recurring bill?
- **Complexity discipline:** is there one source of truth and a bounded failure model?
- **Chatty fit:** can it use this product's interaction and visual language rather than arrive as a
  foreign mini-app?

Trust is a veto, not an average: a high-engagement feature that weakens privacy or lies about delivery
does not ship. New infrastructure also needs the measurement threshold in
[ADR 0016](adr/0016-bandwidth-first-message-delivery.md), even when its software is free; operator
time and memory are costs too.

## Interface rules

- **Keep the thread central.** Desktop may use a split pane; mobile moves list -> thread -> details
  and always offers an obvious way back.
- **Show one primary action per surface.** Secondary actions live close to their object and appear
  progressively; the composer is not a toolbar for every future feature.
- **Content owns the shape.** Text uses message clusters, photographs stay photographs, voice exposes
  a waveform, and files look downloadable. Text has soft outer corners and smaller facing joins;
  media and the composer have their own radii. One universal bubble would erase useful distinctions.
- **Keep everyday surfaces compact.** Wrapped text should hug its visible lines; message padding
  and system notices should not create empty slabs. Voice keeps playback, seeking, speed and preview
  in a small footprint with distinct controls and visible focus, without enlarging the whole thread.
- **Hover stays quiet.** Reveal nearby action icons and strengthen their colour without adding a
  decorative background tile, scaling reactions or zooming vault thumbnails. Selected and focused
  states must remain clear.
- **Choosing a file is the send action.** Ordinary files send immediately as standalone messages,
  preserving any text and reply draft. Keep progress and an explicit retry/remove path on failure;
  images retain their composition preview.
- **Put conversation controls where people manage conversations.** Restrict/unrestrict belongs in
  the direct conversation's sidebar menu. Conversation details focuses on shared content and group
  information; the account's restricted-people list remains available in settings.
- **Reading history must be stable.** Incoming messages do not pull someone away from older content.
  Use a small centered down-arrow control above the composer with a generous invisible touch target.
  Actual typing and new arrivals can expand it into a quiet pill; only actual typing animates the dots.
  Entry, exit and width changes should settle gently, with separate show/hide distances to avoid flicker.
  Honor reduced motion and follow new content while already at the bottom. Returning remains explicit,
  follows a moving destination and yields to deliberate scrolling. Historical search uses the same
  action, with loading feedback and a retryable error if latest cannot be fetched.
- **Voice is an interaction, not a decorative equalizer.** Draw the captured waveform, make seeking
  work with touch and keyboard, keep play/pause easy to reach, and show real loading/error states.
  Recording and preview use the same visual language; a failed send preserves the recording in-session.
- **Latency has a visible answer.** Optimistic, uploading, retrying, disconnected and unread are real
  states. Motion can clarify a transition but cannot be the only carrier of meaning.
- **Touch, keyboard and accessibility are peers.** Every hover-only control needs a reachable touch
  path; focus stays visible; reduced-motion and contrast are part of the component, not a later pass.
- **Density grows by disclosure, not by shrinking targets.** Panels and dialogs expose depth without
  turning the default thread into a control board.

## Foundations and longer-term direction

1. **Measure the real system without a paid provider — done.** The protected Prometheus-compatible
   endpoint covers request/payload, send, image, database and socket behaviour. Logs remain structured
   Pino output; Grafana OSS is optional once graphs become useful.
2. **Durable local outbox and offline reading — done.** IndexedDB is the local source for the bounded
   recent snapshot and unsent text/image commands. Reconnect replays one durable client id against a
   server-side uniqueness rule. This carries a valuable Telegram/Messenger property into Chatty
   without a new service bill.
3. **Group trust controls — done.** Any admin handles naming, membership, roles and invite policy,
   with equal standing over every other admin — no senior seat to fight over or hand off. This closes
   the known safety gap before channels or large communities make it worse.
4. **Privacy protocol decision — done.** MLS is the target, with explicit device verification,
   no-history-by-default enrollment, client-encrypted attachments and recovery-key backups. Current
   browser libraries do not yet clear Chatty's support/audit gate, so E2EE implementation and every
   encryption badge remain unavailable; see [ADR 0020](adr/0020-e2ee-readiness-boundary.md).
5. **Channels/communities only from evidence.** Add them when real groups need separated topics and
   moderation, not because Discord has them.

## Explicit non-goals for now

- A public algorithmic feed, ads, vanity-score optimisation or engagement dark patterns.
- Kafka, microservices, multi-region writes or binary wire formats without the measurements that make
  them simpler than the current system.
- Paid managed services while a safe free/self-hosted option stays inside its measured capacity.
- Custom cryptography or a partial E2EE badge.
