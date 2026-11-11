# chat feature

Create subfolders only when there is something to put in them — empty scaffolding is noise.
The full shape a feature may grow into (`pages/`, `components/`, `hooks/`, `utils/`, `constants/`,
`types/`) is documented in [docs/conventions/frontend.md](../../../../../docs/conventions/frontend.md).

## What is here

`pages/chat-page.tsx` is the route component and owns all the state: the conversation list, the
selected conversation, and the loaded messages. Everything below it is presentational or a hook.

The root folders hold the **shell** (`chat-page`, `chat-conversation-pane`, `chat-overlays`) and the
pieces two or more sub-features share: realtime and socket hooks, the message store
(`use-conversation-messages` and the history / outbox / live-event hooks it composes), the
conversation-list store, conversation titles and avatars, pins, mute and notification helpers.

Each sub-feature is one capability with its own UI, state and helpers:

| Sub-feature    | Contents                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `thread/`      | the message list, rows and bubbles, scroll and reading position, selection and forwarding      |
| `composer/`    | the message input, attachments, mentions, drafts, typing notifier, voice recording             |
| `sidebar/`     | the sidebar, conversation rows and actions, folders, preview peek, bookmarks, new conversation |
| `details/`     | the details panel: vault tabs, customisation, group members, block and invite controls         |
| `expressions/` | emoji picker, stickers, reactions, emoji bursts                                                |
| `media/`       | attachment viewer and gallery, file cards, voice player and waveform                           |
| `theme/`       | conversation themes, flowing wallpaper, the theme picker and its device preview                |
| `search/`      | in-conversation and global message search                                                      |

A sub-feature imports chat-root code freely, another sub-feature only through its folder barrel
(`../../media/components`), and never its constants or types — those move to the root once shared.
Root code other than the shell never imports a sub-feature.

## The rules that are not obvious from the code

**A send has two acknowledgements and one identity.** The server broadcasts `message:new` to everyone
in the conversation, including the sender, and also answers the POST. The durable draft id travels as
`clientId`; whichever acknowledgement arrives first replaces that draft, and the other deduplicates
by server id. Replaying the same id after a reload returns the existing database row and does not
broadcast again. Never append either path without both checks.

**Typing is the only thing this app sends up the socket.** Everything that persists goes over HTTP.
See `constants/typing.ts`: the three timings are related, and changing one alone breaks the
indicator.

**Read markers only move forward.** The server enforces it, and `use-mark-read` marks the newest
_loaded_ message — so scrolling up to read history never turns a conversation unread again.

**Group management writes over HTTP, renders from a socket event, same as everything else.**
`GroupMembersPanel` calls `api.addParticipant` / `removeParticipant` / `renameConversation` and then
does nothing with the response beyond clearing its own local error state — the member list, the name,
and "you were removed" all come from `conversation:updated` / `conversation:left`, handled once in
`chat-page.tsx`. Adding a second code path in the panel that also patched local state would be exactly
the double-render bug the message-rendering rule above already warns about.

**Group permissions are two roles: admin and member.** Admins name the group, moderate members,
promote admins and set invite policy; a member may always leave and may invite only under open
policy. See [ADR 0021](../../../../../docs/adr/0021-flatten-group-roles-to-admin-member.md).

**Search state is `useUserSearch`, not copied.** `NewConversationPanel` and `GroupMembersPanel` both
need "find someone by name or email" with the same loading/error/results shape; the hook exists so
there is exactly one implementation of that instead of two that could drift.

## Reminders

- Never import from `@/features/auth`. Anything both features need lives in `@/hooks` or `@/components`.
- Subscribe to the socket through `useSocketEvent`, not by calling `getSocket().on(...)` in a
  component — one listener per mounted row leaks handlers on every re-render.
