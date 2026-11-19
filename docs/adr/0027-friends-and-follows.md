# ADR 0027: Friends and follows, and who sees a note

## Status

Accepted (2026-11-19). Migrations `20261119090000_friends_and_follows` and, for group permissions shipped the
same day, `20261118100000_group_info_policy`.

## Context

Notes reached "everyone you chat with" — a relationship nobody chose, and one that grows with every group
someone adds you to. The owner asked for Facebook's model: add friend, unfriend, follow, and notes shared by
those relationships. A group chat's name and photo were admin-only with no way to open them up, which
Facebook groups allow.

## Decision

- **Three tables**: `Friendship` (one row per pair, smaller id first, a check forbids the reverse),
  `FriendRequest` (one per direction) and `Follow` (one-way).
- **Facebook's rules**: sending a request also follows; if they had already asked you, asking back makes
  you friends; accepting creates the friendship and follows both ways; cancelling or declining deletes the
  request quietly (follows stay until removed); unfriending removes the friendship and both follows;
  following and unfollowing are independent of friendship.
- **Blocks win**: no request or follow across a block in either direction (answered as "not found", like
  search), and blocking severs every friendship, request and follow between the two, in the block's own
  transaction.
- **Realtime**: `relationship:changed { userId }` goes to both people's personal rooms; clients refetch the
  relationship, their friends and their requests.
- **Who sees a note**: `friends` (default) reaches friends who still follow you — unfollowing a friend drops
  their notes from your row, as on Facebook; `followers` reaches everyone following you; `close_friends` is
  the private list. `contacts` remains valid for notes posted before this. The close-friends and hide lists
  draw from everyone you know: people you chat with, friends and followers.
- **API**: `GET /friends`, `GET /friends/requests`, `GET /friends/:userId` (relationship with mutual friend
  count), `PUT|DELETE /friends/:userId/request`, `POST /friends/:userId/accept|decline`,
  `DELETE /friends/:userId`, `PUT|DELETE /friends/:userId/follow`. Each change returns the new relationship.
- **Group info permission**: `Conversation.infoPolicy` (EVERYONE / MANAGERS, default MANAGERS — the old
  behaviour) gates renaming and the group photo; admins change it, announced by name, beside the invite
  policy.

## Consequences

- Mutual friends are counted by intersecting two id lists; fine at personal scale, a join later if lists grow.
- Lists return at most 500 rows; paging comes when someone needs more.
- No friend suggestions or "people you may know": the product contract rules out recommendation.
