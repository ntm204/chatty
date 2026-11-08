# chat feature

Create subfolders only when there is something to put in them — empty scaffolding is noise.
The full shape a feature may grow into (`pages/`, `components/`, `hooks/`, `utils/`, `constants/`,
`types/`) is documented in [docs/conventions/frontend.md](../../../../../docs/conventions/frontend.md).

## What is here

`pages/chat-page.tsx` is the route component and owns all the state: the conversation list, the
selected conversation, and the loaded messages. Everything below it is presentational or a hook.

| Folder        | Contents                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/` | conversation list and its avatar, the message list, the input, the header, the new-conversation panel, the group members panel, the current user's avatar control                   |
| `hooks/`      | one hook per realtime concern — `use-socket-event`, `use-presence`, `use-typing-notifier`, `use-typing-participants`, `use-mark-read`, `use-message-scroll`, plus `use-user-search` |
| `utils/`      | pure functions the components call — titles, the direct peer, time formatting, read receipts, the typing sentence                                                                   |
| `constants/`  | page size, typing timings, the unread-badge cap                                                                                                                                     |

`hooks/` and `utils/` each ship an `index.ts`; import through it from outside the folder.

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
