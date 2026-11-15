# ADR 0025: Stories that continue conversations

## Status

Accepted (2026-11-15). Batch 1: photo and text stories. Adds `Story`, `StoryView`, `CloseFriend`,
`StoryHiddenFrom` and `Message.replyToStoryId` / `Message.isStoryReply` in migration `20261115120000_stories`.
Batch 2, the same day: video stories and a choice of lifetime (`20261115140000_story_video_and_lifetimes`,
`20261115150000_story_lifetime_upper_bound`).

## Context

The owner asked for 24-hour stories. The product contract (docs/PRODUCT-DIRECTION.md) rules out an
algorithmic feed, public discovery and attention-maximising loops, so the question was which shape of
stories is relationship-first. Telegram Stories, WhatsApp Status and Instagram Stories were compared:
audience lists (contacts, close friends, hidden), a viewers list, replies that go to a private chat, and a
fixed lifetime are common to all of them; ranking and public reach are what Chatty does not want.

## Decision

- **Audience**: everyone who shares a conversation with the author (`listContactIds`, the same set presence
  uses), or the author's close friends. Always excluded: either side of a block, people the author restricted,
  and the author's "hide stories from" list. Both lists are private, drawn only from contacts, and changeable
  at any time; a live story's audience can change too. One `viewableStoryWhere` filter is the single rule
  every read uses.
- **The row**: yours first, then people with something unseen, then by latest post — finite, chronological,
  nothing recommended. Opening plays one person's stories, then the next person's, then closes. The viewer
  freezes the order it opened with, so a refetch that re-sorts the row cannot swap who is on screen.
- **Lifetime**: 6, 12, 24 (default) or 48 hours, chosen when posting (`STORY_DURATION_HOURS`, Telegram's set);
  a database check refuses anything past 48 hours. Expired stories are excluded on every read,
  hard-deleted with their photo by a 30-second sweep, and dropped on the client clock. Nothing is archived.
- **Photos** use the attachment pipeline (EXIF orientation, WebP, thumbnail, browser-side reduction) and its
  signed tokens, but a separate route, `GET /stories/media/:mediaId`, which also checks the story is still live
  and sends `no-store` — an attachment token lasts an hour, a story may have minutes left. The orphan sweep
  treats `Story.mediaId` as a reference.
- **Video** (batch 2): one clip per story, at most 50 MB uploaded, re-encoded by the bundled ffmpeg to H.264/AAC
  MP4, at most 720 px wide and trimmed to 15 seconds, CRF 26 capped at 1.8 Mbit/s, with `+faststart` so playback
  starts before the file has arrived; served with Range support. The first frame becomes the poster and thumbnail
  through the image pipeline. Input goes through temporary files, not pipes: phone MP4s put their index at the
  end, which only a seekable input can read. The viewer's clock runs for the video's own length, holds while it
  buffers, pauses it with the story, and falls back to muted when the browser refuses sound; only the next
  story's picture or poster is prefetched. `Story.mediaByteSize` records what each story stores.
  **Measured** (2026-11-15, this machine, 15 s portrait clips): a clean synthetic source 37.7 MB → 1.8 MB
  (0.96 Mbit/s, encoded in 0.7 s); a heavily noisy source standing in for the worst camera footage → 3.7 MB
  (1.97 Mbit/s, the rate cap, 3.1 s). So a video story costs 2–4 MB of storage for its lifetime and the same to
  each viewer who watches it through, against ~0.1 MB for a photo story.
- **Interactions**: a reply or one of six quick reactions becomes a direct message in the author's direct
  conversation (created if needed, subject to blocks), quoting the story while it lives and "Story expired"
  afterwards. There is no comment section.
- **Views** are recorded once per viewer; whether the author can see them follows the viewer's read receipts,
  and an author with receipts off gets no viewers list — the same symmetry as "Seen" in chats. An author who
  turned off "Allow forwarding" gets no save on their photos (ADR 0024).
- **Realtime**: `story:changed { authorId }` goes only to the personal rooms of the story's audience, computed
  with the same rules as the row, so nobody learns that a story they cannot see exists. Clients refetch,
  debounced.
- **Viewer**: five seconds per story on a CSS-driven progress fill (pausing is `animation-play-state`); hold,
  typing a reply, the viewers list or the window losing focus pauses it; a long press never also counts as a
  tap. Left third back, the rest forward, arrow keys and Escape.

## Consequences

- Video encoding costs the API process up to a few seconds of CPU per post, bounded by a 90-second timeout;
  a busier deployment would move it to a worker. The 50 MB upload is buffered in memory before it is written
  to a temporary file, like the other uploads.
- No screenshot alerts or blocking, for the reason in ADR 0023.
- Audience nudges cost one contacts query per post; the row itself is one indexed query per fetch.
