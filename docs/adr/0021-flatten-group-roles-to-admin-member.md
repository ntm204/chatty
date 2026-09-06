# ADR 0021: Flatten group roles to admin/member — no owner

## Status

Accepted. Supersedes the owner/admin/member hierarchy in [ADR 0008](0008-group-owner-role.md) and
[ADR 0018](0018-group-admins-and-invite-policy.md). The single-tier-below-admin shape, the leave/kick
split, and "a non-empty group always keeps someone who can administer it" remain — only who that
someone can be, and how many of them there can be, changes.

## Context

Every messenger this app is measured against — Messenger, WhatsApp — presents group permissions as
exactly two tiers: admin and member, with any admin equal to any other. Chatty had three: a single
OWNER who alone could change roles, invite policy or hand off their seat; an optional ADMIN tier that
shared day-to-day moderation but could not touch another admin or the owner; and MEMBER. A user
opening the group panel for the first time found a "Transfer ownership" button, an "Owner" badge, and
an admin who could remove an ordinary member but not another admin — more hierarchy than a small-group
chat app needs, and not the shape any comparable product uses.

## Decision

`ConversationParticipant.role` has two values: `ADMIN` and `MEMBER`. Every admin has equal standing:

| Operation | Admin | Member |
| --- | --- | --- |
| Leave | Yes | Yes |
| Rename | Yes | No |
| Remove anyone else, admin included | Yes | No |
| Promote/demote anyone else, admin included | Yes | No |
| Change invite policy | Yes | No |
| Invite under `EVERYONE` | Yes | Yes |
| Invite under `MANAGERS` | Yes | No |

**The creator of a group starts as its admin**, same as before, but there is no longer a distinct seat
to hand off — a second admin is promoted the same way the first one arrived, through
`setParticipantRole`, and there is no dedicated transfer endpoint.

**A non-empty group always keeps at least one admin**, not exactly one. Removing or demoting the last
remaining admin auto-promotes the longest-standing remaining participant in the same transaction —
`promoteNextAdmin`, the direct descendant of the old owner-succession rule, unconditioned on role
because there is only one tier left to promote into. If another admin already remains, nothing is
promoted: multiple admins coexisting is normal, not a state requiring resolution.

PostgreSQL enforces the floor with the same mechanism as before — a deferred constraint trigger,
re-checked at commit — but the partial unique index that refused a second OWNER is gone along with it:
nothing here refuses a second, third, or fourth ADMIN.

## Consequences

- **One migration, one direction.** Existing OWNER rows become ADMIN; the enum is recreated without
  the value rather than edited in place, since PostgreSQL cannot drop an enum member. The invariant
  functions and triggers are dropped and recreated under new names rather than patched, so a reader
  never has to reconcile an "owner invariant" function with a role that no longer exists.
- **No more senior admin.** Any admin may demote or remove any other admin, including the group's
  original creator. ADR 0018's "one admin cannot remove another or the owner" is gone; nothing here
  replaces it, on purpose — a small hierarchy was the whole complaint.
- **`transferGroupOwnership` and its endpoint are deleted, not deprecated.** `setParticipantRole`
  already does everything a hand-off needs once no seat is exclusive.
- **The UI has one fewer control and one fewer badge.** No "Transfer ownership" button, no "Owner"
  badge — every admin's row looks the same as every other admin's.
