# ADR 0023: Disappearing and protected messages, without a "secret mode"

## Status

Accepted (2026-11-14). Adds `User.defaultMessageTimerSeconds`, `Conversation.messageTimerSeconds`,
`Message.expiresAt`, `Message.isProtected` and `MessageView` in migration
`20261113090000_disappearing_and_protected_messages`. Does not change [ADR 0020](0020-e2ee-readiness-boundary.md):
none of this is end-to-end encryption, and no lock in the interface claims it is.

## Context

The owner's problem is social, not cryptographic: people confide, and the confidence is screenshotted,
forwarded or kept to be used later. Messenger, Instagram, Telegram, Signal and WhatsApp each answer part
of it, and each leaves a gap this product cares about:

| Product | Answer | Gap for Chatty |
| --- | --- | --- |
| Telegram secret chat | A separate encrypted thread | You have to invite the other person into it — "I don't trust you" said out loud |
| Instagram vanish mode | Swipe up in the same thread; screenshot alerts in the mobile app | Still switched on in front of one person; the alert does not exist on the web |
| Signal | A default disappearing timer for every new chat, set once in settings | Protects whole chats, not the one confession |
| WhatsApp view once | One photo, one viewing, screenshots blocked on phones | Removed from WhatsApp Web in 2022 because a browser cannot block screenshots |
| WhatsApp Advanced Chat Privacy (2025) | Blocks exporting and auto-saving per chat | Documented as not stopping screenshots |

Two constraints follow. **A web page cannot detect or block a screenshot**, or a photo of the screen, so
any "you were screenshotted" alert would be a lie in the exact case it matters. And a **hidden** mode —
one side protected without the other knowing — is unfair to the other side and is the reason the owner
rejected it: privacy features must be visible to everyone they affect.

## Decision

One feature, four parts, each taking the version from the table that fits the gap.

1. **Your habit, not their suspicion** (from Signal). `User.defaultMessageTimerSeconds` applies when *you*
   start a conversation — direct or group, never your own Saved chat, never one that already exists or that
   someone else starts. The system line reads "New messages disappear after 7 days. Minh uses this for new
   chats.": it names the setting as a habit towards everyone, which is what removes the need to say anything
   to the one person.
2. **The same thread, visible to both** (from Instagram, minus the separate mode). `messageTimerSeconds` can
   be changed in place; either person may change it in a direct chat, admins in a group. Every change writes
   a system line by name and the header shows a timer while it applies. Never retroactive: `expiresAt` is
   fixed per message when it is written. Presets only — 24 hours, 7 days, 90 days — enforced by Zod and by
   a database check.
3. **Protect one message** (from view once). `isProtected` on a text and/or photo message:
   - The content is **withheld from every recipient on the wire** — history pages, room broadcasts, sidebar
     rows, reply quotes. `toMessageDTO(row, viewerId)` withholds it unless the viewer is the author, and
     withholds by default when no viewer is known; a protected broadcast is two emits (room minus the
     author's sockets gets the cover, the author's own room gets the content).
   - A recipient reads it only through `POST …/messages/:id/open`, which records a `MessageView` under the
     conversation lock first. The primary key is the "once": a second open is refused. The response is
     `Cache-Control: no-store` and is held only in component memory, never in the thread or IndexedDB.
   - It lasts at most 24 hours (sooner if the chat's timer is shorter); once everyone who was in the
     conversation when it was sent has opened it, it expires 60 seconds later.
   - It cannot be edited, forwarded, saved, pinned or searched; its links are not indexed; its photos never
     appear in the vault; notifications and previews say "Protected message", even to its author.
4. **Deterrence that is true** (Chatty's own, because blocking is impossible). The viewer refuses copy, cut,
   drag, the context menu and printing; it covers itself whenever the page is hidden or the window loses
   focus; and the viewer's own name and handle run across the content, so a capture names who took it. The
   composer notice and the viewer both say: "Chatty can't stop screenshots".

**Expiry is enforced twice.** Every server read path leaves out a message whose `expiresAt` has passed,
from that instant. A sweep every 10 seconds (`FOR UPDATE SKIP LOCKED`, safe on every instance) then
tombstones it (a partial index on `expiresAt` over undeleted rows keeps each pass the size of what is
still pending, not of every tombstone ever made — migration `20261115090000_pending_expiry_index`) — content, attachments and their files, links, mentions, edits, reactions, bookmarks, pins
and views — and emits `message:expired`, which every surface and the local cache treat as gone. Clients
also remove a message at its `expiresAt` on their own clock. History paging moved from Prisma's
`cursor + skip: 1` to an explicit `(createdAt, id)` keyset, because an expired cursor row would otherwise
make `skip: 1` drop a real message.

## Consequences

- No "screenshot detected" alert, no claim of encryption, no hidden mode. A determined recipient can still
  photograph the screen, and the server — which is not end-to-end encrypted — can read every message until
  it expires. The interface says the first; ADR 0020 already says the second.
- After a recipient opens a protected photo, its signed URL remains a bearer link until the message
  expires a minute later ([ADR 0007](0007-signed-attachment-urls.md)).
- The author keeps seeing their own protected words inline until expiry, on their own devices.
- A device that is offline when a message expires keeps it in IndexedDB until it next runs the app, when
  reads filter it out and the next snapshot write drops it.
- Rejected: per-recipient timers that start on read (Signal's receiving side) — one `expiresAt` per message
  keeps a single source of truth the sweep and every query can agree on.
