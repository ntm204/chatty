# Changelog

All notable release-level changes are recorded here. The detailed implementation history and trade-offs
remain in [the roadmap](docs/ROADMAP.md) and [architecture decisions](docs/adr/).

This project follows [Semantic Versioning](https://semver.org/) and the repository's
[release conventions](docs/conventions/releases.md).

## Unreleased

- Reorganized conversation details into Messenger's sections (quick actions, Chat info, Customize chat, Media/files/links, Members, Group options, Privacy & support — content, then people, then settings, then the rare/sensitive controls), and added a group photo and a shared theme color — two features that didn't exist before. Nicknames are now shared and per-member, visible to everyone in the conversation, opened in their own modal and edited in place; replaces the previous private whole-conversation label. See [ADR 0022](docs/adr/0022-conversation-customize-and-shared-nicknames.md).
- Shortened the pinned-message bar, gave it a pin icon, and removed its hover color shift. Its dialog no longer resizes as pins are added or removed, and its "…" menu is no longer clipped by the dialog's scroll area. Opening Search no longer closes conversation details. Media/files/links categories now offer a tab row to switch between them without leaving the one that's open; the Saved category and the double-tap reaction (with its Customize chat control) were removed. The invite-policy control is a toggle switch instead of a dropdown, since there are only two states.
- Fixed the invite-policy toggle rendering hollow while hovered (the ghost button's own hover tint was winning over the switch's solid "on" fill) and gave the track a visible border so its off state isn't nearly invisible against the panel. Rename and the group photo now open their own modal instead of an inline field-plus-Save, matching nicknames. Adding people to a group is now search-then-multi-select-then-confirm in its own modal, matching how starting a new conversation already works. A member row's actions menu is portalled above the list instead of pushed inline, so opening it no longer shifts every row below it down. The Members section header no longer repeats the member count.
- Flattened group roles from owner/admin/member to admin/member: any admin now has equal standing over any other, with no senior seat to transfer. See [ADR 0021](docs/adr/0021-flatten-group-roles-to-admin-member.md).
- Added a chime and a per-browser sound toggle for arriving messages, alongside the existing desktop-popup notification setting.
- Fixed the group "seen by" avatar stack rendering oversized and off-ring; it now uses its own small avatar size.

- Fixed pinned-message navigation moving the outer chat layout; added a dedicated pin dialog, attachment previews, unpin controls, and inline pinned markers.

- Limited enter/exit motion to conversation details; images and account settings open and close immediately.
- Reorganized direct/group details, added an invite-policy toggle and compact member actions, and enabled previous/next and list navigation for pinned messages.

- Refined desktop panel framing and added accessible resizable dividers with remembered widths and reset controls.

- Conversation details now dock beside chat on wide screens and become a dedicated view on smaller screens, with clearer shared-content navigation and keyboard focus restoration.

### Changed

- Balance sidebar rows with name/time on the first line and preview/unread below; give the actions
  button separate space and keep unread badges visible on hover.

- Show live draft previews in the conversation sidebar, including reply-only drafts, without hiding
  unread badges or reordering conversations. Restore the ordinary preview when the draft is cleared.

- Show a typing bubble beneath the latest message, sharing gently staggered dots with the
  sidebar and Jump to latest; keep history reading stable and honor reduced motion.

- Refine Jump to latest into a centered 32px arrow with a 44px touch target, gentle entry/exit and width
  transitions, real typing and inline new-message counts. Search return shows loading feedback;
  keyboard activation keeps focus in the thread and reduced motion skips transitions.
- Compact voice messages into a 240×56px player and a 44px recording bar with a real waveform,
  playback controls, keyboard/touch seeking and distinct incoming/outgoing surfaces.
- Give text message runs soft ends and compact joins, with separate corners for media and the
  composer; remove decorative hover backgrounds, reaction scaling and native reaction tooltips.
- Move Restrict/Unrestrict from conversation details to each direct conversation's sidebar menu.
- Send ordinary files immediately on selection, paste or drop without consuming the text/reply
  draft; keep failed uploads available for retry or removal.

### Fixed

- Align sidebar preview text and smaller timestamps on a shared baseline.

- Preserve an unrelated text draft and its sidebar indicator when sending a sticker.

- Preserve composer drafts through StrictMode restoration, rapid conversation switches and page reload;
  flush pending text on pagehide and prevent cleared drafts from being restored by stale save timers.

- Fit sent and received file cards to their filename instead of reserving a fixed 256px width;
  preserve truncation on narrow screens and full-width cards in the shared-content panel.

- Retract typing on message arrival, cleared input, offline presence and disconnect; deduplicate
  typing identities and suppress the viewer's own typing in the header.

- Fit wrapped text bubbles to their visible lines, remove excess message/system spacing and wrap
  long links in full without clipping their labels or changing their destinations.
- Handle voice playback failures, buffering and stale play requests; release late microphone
  permissions safely and keep recordings available after upload failures.
- Remove instructional captions from the demo file fixtures so they match standalone file sending.
- Show the latest-message activity control after leaving the 120px near-bottom zone, update it when the chat
  layout changes, and hide it within 80px to avoid flicker. Preserve reading position across new arrivals,
  prepended pages and changing media; retarget a smooth jump as content grows and let scrolling cancel it.
- Keep search targets from repeatedly recentering, discard stale navigation responses, preserve arrivals
  during latest-page loading and keep historical paging from skipping gaps after live messages arrive.
- Preserve unrelated conversation references on presence events and memoise individual message rows
  with current action callbacks, so ordinary edits and reactions skip unchanged rows.
- Refuse an occupied local web port instead of silently changing the API's allowed origin.
- Cover opaque downloads above the compression threshold, including exact full and range responses,
  and verify that attachment URL pairs perform one signing operation.
- Correct attachment bandwidth claims and document coordinated classic/sharded Redis adapter
  upgrades and rollbacks, along with the separate development, Docker and E2E entry points.

## [0.2.0-rc.1] — 2026-09-05

### Added

- Durable IndexedDB conversation snapshots and an idempotent offline message outbox.
- Owner/admin/member group controls and owner-selectable invitation policy.
- Bandwidth-aware image uploads, thread thumbnails and compressed HTTP responses.
- Protected Prometheus-compatible metrics for HTTP, messages, images, database queries and sockets.
- A two-instance zero-cost deployment topology, Cloudflare Tunnel option, encrypted backup/restore
  tooling and realistic long mixed-media demo data.

### Changed

- Local verification now follows changed files while release/CI gates retain complete coverage.
- CI runs static analysis, server test shards, web tests and cached container builds in parallel.
- Production media policy, logging rotation, health checks and dependency-layer caching are hardened.

### Fixed

- Replayed message sends converge on one durable row instead of producing duplicates.
- Group roles remain impossible in direct conversations at the database boundary.
- Production audio is permitted by the web Content Security Policy.

[0.2.0-rc.1]: https://github.com/ntm204/chatty/releases/tag/v0.2.0-rc.1
