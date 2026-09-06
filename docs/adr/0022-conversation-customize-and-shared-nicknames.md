# ADR 0022: Messenger-style "Customize chat" — photo, theme, quick reaction, and shared nicknames

## Status

Accepted. Reorganizes the conversation-details panel introduced by the "Conversation details and
pinned navigation" work (see `docs/ROADMAP.md`) into Messenger's section layout, and replaces the
nickname behavior that record shipped with a different, incompatible one.

## Context

The panel's rename field, invite-policy dropdown and nickname editor were scattered: rename and
invite policy were nested inside the member list, and nickname editing lived inline in the
name-display header — a place that reads the name, not one that changes what everyone sees. Asked
to make the panel look like Messenger's, the honest answer had two parts. Reorganizing what already
existed (pinned messages, rename, invite policy, members, media/files/links, block) into Messenger's
named sections is a UI change. But three of Messenger's "Customize chat" rows — a group photo, a
shared theme color, a shared quick-reaction emoji — had no feature behind them at all, and a fourth,
nicknames, existed with the wrong semantics: a private label for the *whole conversation*, visible
only to whoever set it, rather than a label for *one member*, visible to everyone.

## Decision

**The panel now mirrors Messenger's structure**: quick actions (mute, search) under the identity
header, then Chat info (pinned messages), Customize chat, Group options (group-only), Members
(group-only), Media/files/links, Privacy & support — each a collapsible section except Chat info.
Customize chat starts expanded; the rest start collapsed.

**Two permission tiers inside Customize chat, not one.** Rename and the group photo change the
group's identity the way its name always has, so they stay admin-gated like renaming already was.
Theme, the quick reaction, and nicknames are cosmetic — personal taste, not moderation — so *any
participant* may change them, including in a direct conversation, matching Messenger's actual
behavior rather than this app's existing admin-gated pattern for group settings.

**Nicknames are now shared, not private.** `ConversationParticipant.nickname` needed no schema
change — it was already keyed by `(conversationId, userId)`, exactly the shape a per-member label
needs — only its *meaning* changed. It now means "how everyone in this conversation sees this
member labeled," settable by any participant for any participant (including themselves), broadcast
on `conversation:updated` like the rest of a conversation's shared state. This replaces the old
"private label for the whole thread," which does not survive the change: there is no longer a way
to privately rename a conversation for just yourself. Messenger does not have that feature either —
only per-member nicknames plus the group's real name — so this is intentional parity, not an
oversight. Every site that names a participant inside a conversation (message byline, "seen by",
member rows, typing indicator, a 1-1's title/avatar) now prefers the nickname over the real name.
System messages are the one exception: they are baked-in plain text at write time and cannot
retroactively reflect a nickname set afterward, the same way they already cannot reflect a later
display-name change.

**Theme color is restricted to the avatar-tint tokens already in the design palette** — no new
colors. It recolors the "mine" surface (outgoing bubble, voice player, the reacted-by-me chip) for
*everyone* in the conversation, because the theme is one shared value: each person's own messages
render in it, the same way `bg-block` already meant "a message you sent" before this.

**A group's photo reuses the user-avatar pipeline exactly** — same sharp resize/re-encode, same
public unsigned URL with a `?v=` cache-bust — under its own storage key and route
(`GET /conversations/:id/avatar`). A group photo is no more sensitive than a user's public profile
picture, so it gets the same trade Rocket.Chat makes serving `/avatar/:username` openly, not the
signed-URL scheme private attachments use.

## Consequences

- The old `PUT /conversations/:id/nickname` (self-only) becomes
  `PUT /conversations/:id/members/:userId/nickname` (any participant, any target) — mirroring the
  role-change route's shape. `ConversationSelfUpdatedEvent` loses `nickname`; `ParticipantDTO` gains
  it, since it is now safe to broadcast to a whole room.
- `Conversation` gains `avatarUpdatedAt`, `themeColor`, `quickReactionEmoji` — one migration, purely
  additive, no data backfill.
- The sharp resize pipeline is shared (`normalizeAvatarImage`) between user avatars and group
  photos, rather than duplicated.
- Nobody can privately relabel a conversation for themselves alone anymore. Anyone relying on that
  (the old inline nickname editor and the sidebar's "⋯" menu nickname item, both removed) loses it
  in exchange for the real per-member feature.

## Update

The quick-reaction emoji (the "double-tap reaction" row in Customize chat, and the double-click
gesture on a bubble it configured) was removed from the UI shortly after this ADR, at the user's
request: double-tap is a mobile-touch gesture, and this product is desktop-first — the feature had
no clear audience. `Conversation.quickReactionEmoji` stays in the schema unused rather than as a
migration to drop it; nothing reads or writes it from the client any more. Theme and nicknames are
unaffected — this update narrows the "two permission tiers" decision above to rename/photo
(admin-gated) and theme/nicknames (cosmetic, any participant).

The section order above was also revised: Group options and Members were reordered after
Media/files/links, so the panel reads content → people → settings → the rare, sensitive controls,
rather than interleaving a settings section between two content sections. Rename, the group photo
and nicknames each moved from an inline field-plus-Save into their own modal, for the same reason
pinned messages already use one — see conventions/frontend.md. Adding a member to a group moved
from a single always-visible search box into a search-then-multi-select-then-confirm modal matching
`NewConversationPanel`'s existing shape, rather than adding on the first click.
