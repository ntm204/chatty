# Implementation plans

## Active plan

| Plan | Scope | Status |
| --- | --- | --- |
| [Experience polish](experience-polish.md) | 60 tasks in 12 batches for existing workflows, interface details and recovery from errors; includes acceptance criteria and implementation order | Planned; XP-01 and XP-11 are next |

The active plan follows the current workflow in [CLAUDE.md](../../CLAUDE.md). Public launch and large
feature additions are deferred. The specifications below are the historical record of phases 24–28;
their exclusions describe that earlier scope, not the complete state of today's application.

## Historical plans — phases 24 to 28

Specifications written **before** the work, for the four gaps a real user named after phase 23:
there is no way to browse what a conversation has accumulated, no way to send anything that is not a
picture, no voice, and a list of small things every other messenger has.

These files are not the roadmap. [ROADMAP.md](../ROADMAP.md) records what is *done* and why it ended
up that way; these record what is *intended* and what each decision costs, so the implementer argues
with the plan rather than discovering the argument halfway through a migration. When a phase ships,
its outcome goes into ROADMAP.md in the same commit and the plan file stays as the record of what was
decided in advance — including the parts that turned out wrong.

| Phase | File | What it unblocks | Size |
| --- | --- | --- | --- |
| 24 | [phase-24-any-file-attachments.md](phase-24-any-file-attachments.md) | `Attachment` stops meaning "image". Everything below depends on it. | L |
| 25 | [phase-25-voice-messages.md](phase-25-voice-messages.md) | Voice notes, on phase 24's storage and a new re-encode. | L |
| 26 | [phase-26-conversation-vault.md](phase-26-conversation-vault.md) | "Kho lưu trữ": media, files, voice, links and saved messages of one conversation. | M |
| 27 | [phase-27-sidebar-organisation.md](phase-27-sidebar-organisation.md) | Archive, pin, mute — and the incremental sidebar that item 80 has been waiting for. | M |
| 28 | [phase-28-small-things.md](phase-28-small-things.md) | Eleven small features, each independently shippable. | S each |

**Order matters for 24 → 25 → 26 only.** Phase 27 touches no attachment code and can be built in
parallel by a second pair of hands; phase 28's items are independent of everything including each
other, and are the right thing to pick up when a large phase is blocked on review.

---

## Rules that apply to every phase below

Read [CLAUDE.md](../../CLAUDE.md) first — this section adds to it, it does not replace it.

1. **One phase, one branch, one review.** Each phase in these files is sized to be reviewable in one
   sitting. A phase that grows a sixth item during implementation has found a phase 29, not a sixth
   item.
2. **A schema change carries its invariant into the database.** This project has a habit, recorded in
   phase 7 and repeated in phases 8 and 13: when a rule spans rows or columns that the application
   could get wrong, PostgreSQL enforces it too. Every new column below says which constraint it
   arrives with, and "none" is stated rather than left blank.
3. **Every new per-viewer field is a trap.** `conversation:updated` is broadcast to a room, so it may
   never carry a value that differs per recipient. `unreadCount` taught this in phase 3 and phase 27
   adds three more fields with the same property. The rule: per-viewer state travels to
   `userRoom(userId)`, never to the conversation room.
4. **Serving bytes is where the security lives.** Phases 4 and 23 leaned on one control — every
   uploaded image is decoded and re-encoded, so nothing of the input format survives. Phase 24 breaks
   that assumption on purpose and has to replace it; see ADR 0013 in that file. Nothing in phases 24-28
   may serve an uploaded byte inline unless this server produced those bytes itself.
5. **Verification is the appropriate `verify`/`verify:full` gate plus running the thing.** Every phase below names the endpoint
   test it needs, because this repository has shipped a 500 with a green suite twice (the avatar route,
   the sticker URL) and both times the missing test was at the HTTP boundary rather than under it.
6. **Update what describes the behaviour in the same commit** — ROADMAP.md, README.md, `.env.example`,
   the ADR index. Grep the old wording before saying it is done.

## What is deliberately not in any of these phases

Recorded here so it is a decision rather than an oversight, and so nobody adds it "while they are in
there":

- **Link previews that fetch the URL.** Unfurling a pasted link means this server makes an outbound
  request to an address a user chose, which is an SSRF surface pointed straight at the deployment's
  own network — it needs a DNS/IP allow-list, a redirect cap, a byte cap, a timeout, and a cache
  before it is safe, and every one of those is a way to get it subtly wrong. Phase 26 collects the
  links; it does not open them.
- **Malware scanning.** Phase 24 refuses executables by extension and forces every download as an
  attachment. That is not antivirus and the plan says so out loud rather than implying a protection
  that does not exist.
- **Threads, polls and scheduled messages.** All real features, none of them small, none of them
  asked for.
- **Web Push / a service worker.** Still blocked on VAPID keys, the same class as the mail provider —
  see ROADMAP.md, "Known gaps".
