# ADR 0018: One owner, optional admins, explicit invite policy

## Status

Superseded by [ADR 0021](0021-flatten-group-roles-to-admin-member.md), which removes the single-owner
invariant and the owner-only restrictions this record introduced. Supersedes the two-role permission
table in [ADR 0008](0008-group-owner-role.md); the leave semantics from that record remain.

## Context

A single owner prevented arbitrary kicks but made one person the permanent operations bottleneck.
If they stayed in the group but became inactive, nobody else could rename it or remove an abusive
member. Open invitations also meant any member could add a stranger, including somebody another
participant had blocked in direct messages.

A full permission matrix would be more configuration than this conversation-first product needs.
The useful social-platform pattern is a small, legible hierarchy and one high-value group policy.

## Decision

`ConversationParticipant.role` has three values and `Conversation.invitePolicy` has two:

| Operation | Owner | Admin | Member |
| --- | --- | --- | --- |
| Leave | Yes | Yes | Yes |
| Rename | Yes | Yes | No |
| Remove ordinary member | Yes | Yes | No |
| Remove admin | Yes | No | No |
| Promote/demote admin | Yes | No | No |
| Transfer ownership | Yes | No | No |
| Change invite policy | Yes | No | No |
| Invite under `EVERYONE` | Yes | Yes | Yes |
| Invite under `MANAGERS` | Yes | Yes | No |

There is still exactly one owner, enforced by the existing partial unique index and deferred
constraint trigger. There may be zero or many admins. Owner transfer keeps its dedicated endpoint
because it updates two roles under the conversation lock; admin changes update one non-owner through
`PUT /conversations/:conversationId/members/:userId/role`.

The owner alone chooses `EVERYONE` or `MANAGERS` through an idempotent PUT. Existing groups default
to `EVERYONE`, so deploying the migration does not silently revoke a capability people already had.
Every real role/policy change writes a system line and broadcasts `conversation:updated`; repeating
the current value writes no duplicate line.

When an owner leaves, an existing admin is promoted before an ordinary member. Within the chosen
tier, the longest-standing membership and id tie-break retain the deterministic succession rule.

## Consequences

- A trusted second person can keep a group usable without holding its single ownership seat.
- Admins cannot form an unchecked peer-moderation loop: only the owner can create/remove admins, and
  one admin cannot remove another or the owner.
- Open invitations remain the default, while groups that need tighter safety can make growth a
  manager operation.
- The shared conversation DTO/event carries invite policy so every tab renders the same rule without
  a separate settings request. Roles already travel on participant DTOs.
- Group blocking remains unchanged: members who share a group can still see one another there. The
  invite policy reduces who can introduce someone; it does not pretend direct-message blocking is a
  group-wide ban.
