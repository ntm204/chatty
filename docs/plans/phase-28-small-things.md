# Phase 28 — the small ones

*"Thiếu rất nhiều mấy cái nhỏ con nhưng hay ho."* Each item here is independent, small, and ships on
its own. Two of them close gaps this repository has already written down under
[ROADMAP.md, "Known gaps"](../ROADMAP.md) — those are marked **(gap)** and should go first, because a
recorded gap is a bug somebody already agreed to be surprised by.

Take them in the order listed; stop whenever the next one stops being worth it.

| # | Item | Size | Why it is worth a line of code |
| --- | --- | --- | --- |
| 109 | Drafts that survive leaving the conversation **(gap)** | S | |
| 110 | Jump to latest, and an unread divider | S | |
| 111 | Drag-and-drop and paste-to-attach | S | |
| 112 | Links in a message are links | S | |
| 113 | Forward a message | M | |
| 114 | @mentions in groups | M | |
| 115 | Pin a message in a conversation | M | |
| 116 | A reply quote jumps to what it answers | S | |
| 117 | Keyboard shortcuts | S | |
| 118 | Typing, in the sidebar **(gap)** | S | |
| 119 | Who has seen it, in a group | S | |

---

### 109 — drafts (gap)

The recorded gap: *"a failed draft is lost when you switch conversations"* — the thread's message array
is replaced on every conversation change and a "Not sent" message goes with it, taking its text.

Draft text (and the reply target's id) per conversation in `localStorage`, keyed
`chatty:draft:<conversationId>`, written debounced and cleared on a successful send. `localStorage`
rather than the server, deliberately: a draft is not sent, it belongs to the device it was typed on, and
syncing unsent text between devices is a promise this app should not make quietly. State that in the
hook.

Restore on open, including the reply target if the message is still there.

### 110 — jump to latest, and the unread divider

Two small things that belong together because both are about "where am I".

This is the original plan. Roadmap phase 50 now uses a centered 32px down-arrow control inside a 44px
touch target, appearing beyond 120px and hiding within 80px. Its animated pill tracks actual typing
and new arrivals while reading above the live thread; the opening unread divider keeps its own semantics.
Search return shares the action and exposes loading/failure. See phase 50 for interruption and race handling.

- A floating "↓" button once the thread is scrolled more than a screen from the bottom, with the unread
  count on it when there is one. `useMessageScroll` already tracks the position it needs.
- A "N new messages" rule drawn above the first unread message on open, from the read marker that is
  already on the participant row. It does **not** move while the conversation is open — a divider that
  chases the marker is a divider that vanishes as you read past it, which is the one moment it was
  useful.

### 111 — drag and drop, paste

Drop files anywhere over the thread; paste an image from the clipboard into the composer. Both feed the
exact same `handleFilesSelected` the file picker does, including its limit checks — this is a new *entry
point*, not a new path. A drop target that highlights the thread, and nothing that swallows a drag of
text.

Screenshot-to-chat is the single most-used shortcut in every messenger and this app has no way to do it.

### 112 — links in a message are links

Auto-linkify URLs in rendered text: `<a target="_blank" rel="noopener noreferrer nofollow">`, truncated
in the middle if long. `rel` is not optional — `noopener` because a new tab gets a handle on this one
without it, and `nofollow` because this is user-submitted text.

The client renderer is its own small util; the extraction that feeds phase 26's vault stays on the
server. Two implementations, one of them cosmetic, and the file says so.

### 113 — forward a message

`POST /conversations/:id/messages` gains `forwardOfMessageId`, which:

- checks the caller is a participant of **both** conversations — the source check is the one that will
  be forgotten, and without it forwarding is a read primitive for any message id;
- **copies** the content and the attachment files into new rows, rather than referencing them. This is
  settled precedent: a sticker is copied for exactly this reason (phase 23), and a reference would mean
  deleting the original blanks a picture out of a conversation the deleter is not even in;
- sets `isForwarded` on the new message so the bubble can say "Forwarded" — without it the copy claims
  to be the sender's own words.

UI: the existing message overflow menu → a conversation picker reusing `useUserSearch`'s shape.

### 114 — @mentions in groups

- Composer autocomplete on `@`, matching participants of this conversation only.
- Stored in a `MessageMention { messageId, userId }` table written in the send transaction — **not**
  parsed out of the text at read time. Two reasons: handles can change, so a text match would silently
  stop being a mention; and the notification rule needs a set it can trust rather than a regex run on
  the client.
- Rendered from the *current* display name resolved through the id, the same rule `MessageDTO.author`
  follows (phase 6, item 16). A renamed person's old mentions keep working.
- **A mention notifies even when the conversation is muted** (phase 27, item 107), and highlights the
  row in the sidebar. That is the entire reason mentions exist in a group.
- `@all` is not in scope — it needs a rule about who may use it.

### 115 — pin a message

`PinnedMessage { conversationId, messageId, pinnedById, pinnedAt }`, max 3 per conversation, shown as a
one-line banner under the header that scrolls to the message when tapped.

Who may pin: **any participant**, and any participant may unpin. This follows ADR 0006/0008's grain —
the group's permission model has one distinction, "may act on others", and pinning acts on nobody. A
system line records each pin, the way every other group event does (ADR 0009), which is what makes an
open permission acceptable.

### 116 — a reply quote jumps to what it answers

Tapping `MessageReplyQuote` scrolls to the parent and flashes it. If it is not in the loaded page, use
`GET .../messages/:messageId/context` — which already exists, built in phase 15 for search, and is the
reason this item is small.

### 117 — keyboard shortcuts

`Esc` closes the open panel, then cancels a reply, then cancels an edit — in that order, one level per
press. `↑` in an empty composer edits your last message (inside the eight-hour window; outside it, do
nothing rather than show an error). `Ctrl/⌘+K` focuses global search, `Ctrl/⌘+F` opens in-conversation
search. A `?` overlay listing them, so they are discoverable rather than folklore.

Keep them in one `use-keyboard-shortcuts.ts` with the map in `constants/`, not scattered across the
components that respond to them.

### 118 — typing, in the sidebar (gap)

The recorded gap: the event already arrives for every conversation you are in and
`use-typing-participants` drops all but the open one, on the grounds that a badge for something that
expires in seconds is mostly flicker. Every real messenger shows it. Show it — replace the preview line
with "Đang nhập…"/"typing…" for as long as the event is live, keeping the same debounce the header uses,
and let the judgement call be settled by trying it.

### 119 — who has seen it, in a group

The read markers are already on every participant row and already drive "Seen" for direct messages.
In a group, show a small stack of the avatars of everyone whose marker is at or past the message, and
tap for the list. No new endpoint, no new column: this is rendering data the client already has.

---

## Cheap, and deliberately refused

- **Scheduled send, polls and threads** — each is a phase.
- **Read receipts per message in large groups** — the stack in item 119 is the affordable version.
- **Multi-select messages for bulk delete/forward** — a selection mode is a second interaction model
  over the whole thread; worth doing when one of forward or delete is being used enough to ask for it.
- **Custom notification sounds, chat wallpapers, themes** — this app has one palette on purpose
  (phase 16), and per-conversation decoration is the first thing that erodes it.

## Verification for every item here

`npm run verify`, plus the specific thing: each item above is small enough that its test is obvious and
therefore easy to skip. The rule for this phase is that **an item without a test is not done** — these
are the changes most likely to be broken by the next refactor precisely because they are small.

Update the ROADMAP row and, for items 109 and 118, **delete the Known-gap bullet they close** in the
same commit. A gap list that keeps entries after they are fixed is the failure CLAUDE.md's last section
is about.
