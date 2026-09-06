# ADR 0008: One owner per group — kicking and renaming are theirs

## Status

Superseded by [ADR 0018](0018-group-admins-and-invite-policy.md), itself superseded by
[ADR 0021](0021-flatten-group-roles-to-admin-member.md), which removes the single-owner invariant this
record introduced. This record superseded the decision in
[ADR 0006](0006-flat-group-permissions.md); the leaving/removal shape and groups reaching zero
participants still stand.

## Context

ADR 0006 gave every participant the same powers: anyone could rename a group, add anyone, and remove
anyone. It said so out loud, and it named the consequence it was accepting — *"any member can remove
every other member, or add strangers, with no cooldown and no way to be stopped short of leaving
themselves"* — on the grounds that this is a learning project rather than a product with adversarial
users.

The first person to open the group panel asked the same question in the first minute: *is everyone
the owner? can anyone kick anyone?* That is the answer to a design question arriving as surprise,
which is the signal that the default was wrong rather than merely undocumented. Every messenger this
app is measured against — Messenger, Zalo, Telegram, Slack — distinguishes the person who made the
group from the people in it, and the distinction is not decoration: it is what stops one bad
afternoon from emptying a group nobody can rebuild.

ADR 0006 also predicted how this would be fixed: *"cheap to add a role to later, because every check
funnels through one function that would only need one more condition, not a rewrite."* That held.

## Decision

**`ConversationParticipant.role` is `OWNER` or `MEMBER`, and it gates exactly two operations.**

| Operation | Who | Why |
| --- | --- | --- |
| Rename the group | Owner | The name is the one part of a group everybody sees, and it is what a sidebar row is recognised by. |
| Remove **someone else** | Owner | The operation ADR 0006 named as griefing. |
| Remove **yourself** (leave) | Anyone | An owner who could keep people in a group would be a worse failure than an ownerless one. |
| Add a member | Anyone | Inviting is how a group grows. Gating it makes one person a bottleneck for the thing groups are *for*, and the worst case — an unwanted arrival — is one the owner can undo. |

**The creator of a group owns it.** `createConversation` writes `role: OWNER` for the caller when
`isGroup`. A direct conversation gives nobody a role: two people have nothing to administer between
them, and an owner there would only be a role every screen has to remember not to show.

**An owner who leaves hands the group to the longest-standing member left.** Oldest `joinedAt`,
ties broken by id — arbitrary but stable, and the same rule the migration's backfill used for groups
that predate the column. The alternative, letting a group go ownerless, is a group nobody can ever
rename or moderate again, because no code path would exist to grant the role. When the last
participant leaves there is nobody to promote and the group simply ends, which ADR 0006 already
allowed.

**Every transition writes a system message** — see [ADR 0009](0009-system-messages.md). "An removed
Binh" and "An is now the group owner" are in the log where the people affected can see them, rather
than being a state change that happens silently.

## Consequences

- **403, not 404.** `assertOwner` throws `ForbiddenError`, a status this codebase did not have
  before. `assertParticipant` hides a conversation you are not in behind a 404 so ids cannot be
  probed; a member who is not the owner can already see the group perfectly well, so there is nothing
  left to hide and a 404 would leave the UI unable to say why the button did nothing.
- **The UI shows the rule rather than enforcing it silently.** The rename field is disabled with a
  line of text saying who can change it, the remove buttons are absent for members, and the owner's
  row carries an "Owner" badge so it is obvious who to ask. A disabled control with no explanation
  reads as a bug.
- **Manual hand-over, added in phase 13.** This consequence used to read "no manual hand-over —
  additive when it is wanted: one endpoint and one button, with the same `assertOwner` check already
  in place." That is exactly what it cost: `PUT /conversations/:id/owner` demotes the caller and
  promotes a member who is already in the group, under the same lock and with a system line. No
  schema change was needed — the deferred constraint trigger was written in anticipation of a
  transaction that briefly has zero owners, which is what this is.

  Two hand-overs racing do not reach the constraint: the row lock orders them, and the second finds
  it is no longer the owner and gets the same 403 a non-owner gets.
- **Second admins and invite policy arrived in phase 42.** ADR 0018 answers the rule this record left
  open: admins operate on ordinary members but not one another, and the owner chooses whether every
  member or only managers may invite.
- **Pre-existing groups needed a backfill.** They have no recorded creator, so the migration promotes
  the longest-standing participant of every group. Without it, every group created before this change
  would be permanently ownerless — unrenameable, unmoderatable, with no path in the app to grant the
  role.
- **Phase 7 moved the promise into PostgreSQL.** An OWNER-only partial unique index and deferred
  constraint trigger now reject two owners, an ownerless non-empty group, or an owner in a direct
  conversation at commit time. Group mutations share one row lock and transaction so owner transfer
  remains valid under concurrent leaves; see [ADR 0010](0010-serialize-conversation-writes.md).
