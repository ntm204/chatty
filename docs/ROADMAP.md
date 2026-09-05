# Roadmap

What is built, what is next, and why in this order. Update this file **in the same commit** as the
work it describes — a roadmap that lags behind the code is worse than none, because it is believed.

Status: `done` · `next` · `planned` · `blocked` · `dropped`

---

## Phase 1 — Fix what is wrong — `done`

Not new features: three things that were broken or silently incomplete.

| # | Item | Why it came first |
| --- | --- | --- |
| 1 | Unique handles (`@minh`) | Display names are not unique and search deliberately hides emails, so two people with the same name were indistinguishable. Touched the schema, so the longer it waited the more data would need migrating. |
| 2 | `conversation:new` socket event | Joining a room only decides where future messages land. A brand-new conversation has none, so it stayed invisible in the sidebar until someone sent the first message — or until a reload. |
| 3 | Load older messages on scroll | The API had cursor pagination from the start; the client only ever fetched the newest page, so older history was silently unreachable. |

Also done along the way, each because it was found while doing the above:

- **Rate limiting** on `/auth/register` and `/auth/login` — the mitigation the docs already claimed
  existed for register's unavoidable "email taken" disclosure.
- **Tests are typechecked.** `tsconfig.json` used to `include: ["src"]` only. Adding `tests`
  surfaced 18 pre-existing type errors that nothing had ever reported. Build now uses
  `tsconfig.build.json` so tests stay out of `dist/`.
- **Auth request/response types moved to `packages/shared-types`.** The client used to declare its
  own request shape, so adding a required field server-side compiled fine on both sides and failed
  at runtime with a 400.
- **One Vitest version across the monorepo.** Two copies meant two module instances, so
  `expect.extend` in a setup file landed on one while tests ran on the other and every jest-dom
  matcher silently vanished. Run `npm dedupe` after adding a workspace.
- **Seed script** (`npm run db:seed --workspace apps/server`) — e2e scripts had been writing junk
  into the dev database, leaving a search full of duplicate "Minh" accounts.

---

## Phase 2 — Core chat features — `done`

| # | Item | How it ended up |
| --- | --- | --- |
| 4 | Avatars | Upload, re-encode, display. The `avatarUrl` **column was replaced** by `avatarUpdatedAt` — see below. |
| 5 | Read receipts | `lastReadMessageId` on `ConversationParticipant`, `POST /conversations/:id/read`, `conversation:read` broadcast, per-viewer `unreadCount` on `ConversationDTO`. |
| 6 | Typing indicator | The first client→server socket events (`typing:start` / `typing:stop`). Nothing persisted. |
| 7 | Online / offline presence | Derived from connections, never stored. Announced on the first connect and the last disconnect, so extra tabs are not events. |

### Avatars: why the schema changed

The roadmap said `avatarUrl` was "already in the schema". It was, as a free-text column — and storing
a URL there is wrong for two reasons that only show up later:

- **Browsers cache images hard.** A user who replaces their picture keeps seeing the old one unless
  the URL changes, so the column would have to hold a new path per upload — which leaves every
  previous picture on disk forever.
- **The storage backend is in the URL.** Moving files to S3 in phase 5 would mean rewriting every row.

Rocket.Chat, Mattermost and Slack all avoid both the same way: serve avatars from an app-controlled
endpoint keyed by user, and cache-bust with a version parameter. So the column is now
`avatarUpdatedAt` (Mattermost calls it `last_picture_update`), and `UserDTO.avatarUrl` is **derived**
by the server as `{PUBLIC_URL}/users/:id/avatar?v=<timestamp>`. The wire type did not change.

Also part of item 4:

- **Uploads are re-encoded, not stored.** `lib/avatar-storage.ts` decodes to pixels and writes WebP
  256×256. The MIME type a client sends proves nothing — the re-encode is what stops a file being
  served back from this origin as something other than an image. It also strips EXIF, so an avatar
  cannot publish the GPS coordinates the phone put in it.
- **`GET /users/:id/avatar` is the one unauthenticated route.** An `<img>` cannot send an
  Authorization header, and this app keeps its token in localStorage rather than a cookie.

Also done along the way:

- **Typing was echoing back to the typist's own other devices.** Found later, by noticing that typing
  was the only phase 2 feature with no entry under "Known gaps" and going to look for one.
  `socket.to(room)` excludes the socket that sent the event, not the *person* — so someone typing on
  their phone watched their own laptop announce "Minh is typing…" back at them. Fixed with
  `.except(userRoom(userId))`, the same personal room presence already uses for exactly this. The
  roadmap had flagged multi-device as the hard part of presence; it was the hard part of typing too,
  and only presence got the care.
- **`tests/typing.socket.test.ts`, the first test over a real socket connection.** The bug above was
  invisible from below: service tests use a fake io, which proves what a service *asks* to broadcast
  and can say nothing about who receives it. Room membership, exclusions and the handshake all live
  above that line. Same lesson as the avatar endpoint, one layer up.
- **One HTTP-level test, in `tests/avatar-endpoint.test.ts`.** Every avatar `GET` returned 500 while
  all 75 service tests passed: Express's `send` treats a path segment starting with a dot as a hidden
  file and refuses it, and the upload directory is `.data/uploads`. Nothing that tests a service can
  see that. The endpoint now has a test that fails without the fix.
- **`assertParticipant` moved to the conversations service** and is now imported by messages and the
  socket layer. It had been a private copy in `messages.service.ts`; two copies of an authorization
  check are two chances for one of them to be relaxed alone.
- **Unread counts are one raw SQL query**, not one per conversation. Each conversation counts from
  its own read cursor, which Prisma's `groupBy` cannot express.
- **Test fixtures moved to `apps/web/tests/factories.ts`.** Adding `unreadCount` and
  `lastReadMessageId` broke a hand-written fixture in three files at once.
- **Node 22 is now required** to run the web tests — jsdom 30 declares `>=22.22.2`, and on Node 20 the
  suite dies inside undici with `markAsUncloneable is not a function`. Recorded in `engines`.
- **Five convention breaches `scripts/audit-rules.sh` could not see**, found by reading the checklist
  against the new code rather than trusting the script. It greps for constant *arrays* in feature
  component files, so `sizeClasses` maps and a bare `MAX_BADGE_COUNT` slipped through; it checks
  boolean *state* for an `is`/`has` prefix, so a plain `const startsRun` did too. Fixed by moving the
  constants to `constants/`, their types to `types/`, and renaming.
- **`npm run verify`, and three new audit sections, so that does not depend on anyone remembering.**
  Sections 26-28 close exactly the gaps above — any constant in a component file, any non-`Props`
  type in a component file, any boolean `const` without the prefix. Turning them on found one more
  breach in code nobody had touched (`prependedOlder` → `didPrependOlder`); a new rule that reports a
  hit on day one is a rule people learn to ignore, so it was fixed rather than grandfathered.
  `verify` chains typecheck → lint → format:check → test → audit and runs the audit with a new
  `--gate` flag that makes a hit fail the command. On its own `audit:rules` stays a report and exits
  0, because a heuristic that blocks work is a heuristic people route around. The remaining rule is
  in CLAUDE.md, under "Definition of done": a green `verify` is evidence, not proof — it does not run
  the app, and it does not read prose.
- **`npm run format` is now safe to run.** It was not: `tabWidth: 4` is meant for TypeScript, and YAML
  cannot contain tabs, so prettier would silently reindent `docker-compose.yml` from two spaces to
  four. A `.prettierrc` override pins YAML to two. Markdown and `.prisma` are in a new
  `.prettierignore` — prettier pads markdown tables using byte counts, which *misaligns* the
  em-dashes these docs are full of, and it does not know the Prisma schema language at all
  (`npx prisma format` does). `npx prettier --check .` now exits clean.

## Phase 3 — Group and account management — `done`

| # | Item | How it ended up |
| --- | --- | --- |
| 8 | Group: add/remove member, leave, rename | `done` — see below, and revisited in phase 6 |
| 9 | Edit profile, change password | `done` — see below |
| 10 | Password reset (needs outbound email) | `done` — stepped over here, finished last; see below |

### Item 8: group management

`POST /conversations/:id/members`, `DELETE /conversations/:id/members/:userId`, `PATCH
/conversations/:id`. All three follow the same shape as everything else in this app: write over HTTP,
render from a socket event, one source of truth. Two new events carry it —
`conversation:updated` (participants or name changed) and `conversation:left` (you were removed, or
you left).

**No admin role — any participant can add, remove, or rename.** Recorded in
[ADR 0006](adr/0006-flat-group-permissions.md) rather than left as an unstated default, because it is
the kind of thing that looks like an oversight if it isn't written down. **Phase 6 changed this**:
groups now have an owner, and ADR 0006's decision is superseded by
[ADR 0008](adr/0008-group-owner-role.md). It was not an oversight, and it was still the wrong
default — the first person to open the panel asked "is everyone the owner?" within a minute. Leaving and being removed are
the same function call with the target set to yourself; a group is allowed to end up with zero
participants, the same way a conversation is never deleted.

**`conversation:new` now fires when someone is added to an existing group**, not only at creation —
this was a known gap on the roadmap since phase 2 and is now closed: `addParticipant` sends it to the
new member specifically, after joining their live sockets to the room, the same ordering
`createConversation` already used.

**`conversation:updated` deliberately cannot carry `unreadCount` or `lastMessage`.** Both are
per-viewer, and one payload broadcast to a whole room cannot correctly answer "unread to whom?" for
everyone in it at once — sending the actor's own count to the room would have leaked it into every
other participant's UI. Caught while designing the event, not after shipping it; see the type's doc
comment in `packages/shared-types` and ADR 0006's consequences section.

**Group management lives inline, not in a modal.** The app has no modal/dialog primitive declared
anywhere in its conventions; `GroupMembersPanel` follows the same pattern `NewConversationPanel`
already established — render inline, toggled from a button in `ConversationHeader` — rather than
introduce one. **Phase 16 introduced one** (`hooks/use-dialog.ts`) and this panel deliberately did
not move into it: group management acts on the conversation on screen, and a dialog that covers the
conversation you are editing the membership of is worse than a panel above it.

**`useUserSearch` extracted from `NewConversationPanel`.** Adding a member needed the exact same
search-loading-error state machine a second time; per "no duplicate helper," the first copy was
refactored to use the extracted hook rather than left to drift from the second.

**One flaky-test bug, found and root-caused rather than retried.** The new suite passed repeatedly,
then the full run started failing 48-61 tests at random across files that had nothing to do with
group management — "user does not exist", "email already registered". The cause was this file's own
fixtures: four `register()` calls per test, each a bcrypt hash at cost 12, pushed the slowest tests
past Vitest's default 5s `testTimeout`. Vitest abandons such a test but cannot stop its promise
chain, so it kept querying while the *next* test's `TRUNCATE` wiped the tables — and the wreckage
surfaced in whichever file ran next. Fixed by creating fixture rows directly with `prisma` instead of
going through `register()` (these tests never sign in): 25-61ms per test instead of 300-1400ms, and
green on three consecutive full runs at the default timeout. The trap is now documented in
`tests/setup.ts`, next to the TRUNCATE that springs it.

Known, deliberately deferred rather than missed (the second and third were **closed by phase 6**):

- No confirmation dialog before removing someone or leaving. Nothing else in the app has one either.
- ~~No system message in the chat log for "X added Y" / "X left" / "renamed to Z".~~ Done in phase 6:
  the schema decision it was waiting on — a message with no author — was made there.
- Adding a participant does not backfill their `unreadCount` from before they joined — a newly added
  member's marker starts null, so the existing read-count query treats all prior history as unread,
  same as it would for anyone with an unset marker. Not special-cased; see Known gaps.

### Item 9: profile and password

`PATCH /users/me` changes a display name, a handle, or both. `POST /auth/password` changes a
password, given the current one. Two endpoints rather than one because they are not the same kind of
operation: one edits a resource and answers with it, the other verifies a credential and returns the
replacement access token required after it invalidates every older session.

**Password change lives in the auth module, not with the rest of the profile.** It is the only place
besides `register` that may hash a password, and `PASSWORD_HASH_ROUNDS` having one home is what keeps
the cost factor from quietly differing between the two.

**Its error message is specific — "Current password is incorrect" — where `login`'s is deliberately
vague.** Vagueness there exists to stop an attacker learning which emails have accounts; by the time
this endpoint runs the caller has already proved they hold the account's token, so there is nothing
left to enumerate and precision is what a user needs to try again.

**Its rate limiter is keyed by user id, not IP,** which is why `createAuthLimiter` grew a
`keyGenerator` option. `requireAuth` runs first, so every counted request belongs to a known account:
an attacker cannot spend a victim's budget from somewhere else, and an office behind one NAT does not
share one. Verified by hand against a running server — the limiter's `skip` turns it off when
`NODE_ENV` is "test", so no test in the suite can see it.

**Three rules that two forms both needed were lifted rather than copied.** `displayNameSchema` and
`passwordSchema` came out of `registerSchema` so a profile edit cannot validate a name differently
from a signup; on the web side `constants/validation.ts` moved from `features/auth` to `src/`, and
`CurrentUserAvatar` from `features/chat/components` to `src/components`, because the profile screen
needs both and features may not import from each other.

**Profile settings are a route (`/profile`), not an inline panel.** Everything else secondary in this
app renders inline — starting a conversation, managing a group — but those act on the conversation on
screen. This one edits the account, and putting it in the chat sidebar would mean `features/chat`
importing from `features/profile`, which the frontend conventions rule out.

**Phase 16 kept the route and stopped it replacing the screen.** `/profile` now renders `ChatPage`
and a dialog over it, composed as siblings in `app.tsx` — which is the one place both are in scope,
so the cross-feature import is still not made. The URL is unchanged, so the deep link still works and
Back closes the dialog.

**Only the changed field is sent.** The server accepts both, but a request carrying a field nobody
touched can overwrite an edit made in another tab.

Known at the end of item 9, then closed by item 10:

- ~~Changing a password does not sign other sessions out.~~ Both password-change paths now update
  `passwordChangedAt`, disconnect live sockets and issue the caller a replacement token.

Still deliberately deferred rather than missed:

- ~~Email cannot be changed.~~ Built in phase 13, once the outbound-email machinery item 10 was
  waiting on existed. It is not a field on this form and never will be: it takes effect when a link
  in the new mailbox is opened, not when the request returns, so it has its own form and its own two
  endpoints under `/auth`.
- The handle uniqueness check is read-then-write, the same shape `register` uses, and carries the
  same small race. The unique index is what actually prevents a collision; the loser gets a 500
  rather than a 409.

### Item 10: password reset, stepped over and then finished

It was the only item on this roadmap that cannot be *finished* outside a deployment: a reset link has
to reach an inbox, which means a provider, a verified sending domain and credentials, none of which a
test can stand in for. So phases 4 and 5 went first, and the flow was then built against the shape
this file predicted — a `Mailer` interface with a console transport, so the provider is one file
(`lib/mailer.ts`) rather than a dependency threaded through the service.

`POST /auth/password-reset` always answers 204, whether or not the address has an account: a
different status, message or delay is a way to ask who is registered here. `POST
/auth/password-reset/confirm` redeems the link — 32 random bytes, stored only as a SHA-256, single
use, one hour. SHA-256 rather than bcrypt because what is being hashed is already unguessable; a slow
hash defends against nothing here.

**It also closed the largest gap on this list.** A reset exists for "someone else has my account",
which is worth nothing if the sessions they opened keep working. `User.passwordChangedAt` is now
written by both the reset and the ordinary password change, `verifyAccessToken` refuses any JWT whose
`iat` is older than it, and the same check runs in the socket handshake — with the account's live
sockets disconnected on the spot. The caller gets a replacement token in the response, because their
own session is one of the ones that just ended.

## Phase 4 — Attachments — `done`

| # | Item | How it ended up |
| --- | --- | --- |
| 11 | `Attachment` table, upload, image rendering in the message list | `done` — see below |

### Item 11: image attachments

One image per message (**relaxed to ten in phase 22**), sent through the **same**
`POST /conversations/:id/messages` that text goes
through — JSON when there is no file, multipart when there is. The upload middleware passes a
non-multipart body straight through, so one route serves both without a branch in front of it, and
there is still exactly one write path where membership is checked and one broadcast everyone renders
from.

**Serving them needed a decision avatars did not, and it got an ADR.** A profile picture is public and
an unguessable URL is enough; a picture inside a conversation is the content, sent to a specific set
of people. `AttachmentDTO.url` therefore carries a signed token, scoped to that one attachment id,
minted per response, expiring in an hour — see [ADR 0007](adr/0007-signed-attachment-urls.md). A bad
token answers **404 rather than 401**, because 401 would confirm the id exists.

**Both kinds of JWT are signed with the same secret, so they had to be told apart.** An attachment
token presented as a bearer token would otherwise authenticate as a user whose id is an attachment
id. Attachment tokens carry a `typ` claim and `requireAuth` rejects any token that has one; two tests
assert each kind is refused where the other belongs. This is the sort of thing that is invisible from
below — no service test can see it — and it is why the endpoint suite exists.

**The re-encode is the same security control avatars use, and it was verified end to end rather than
assumed.** A JPEG carrying an EXIF marker was uploaded against a running server and fetched back: the
marker is in the input file and absent from the stored WebP. For a photo sent into a group chat that
metadata is a GPS fix.

**`messageSelect` and `toMessageDTO` moved into a fifth file, `messages.mapper.ts`.** The conventions
describe a module as four files, and this is a deliberate exception with a reason: `conversations`
selects a `lastMessage` and must produce the same shape, but `messages.service` already imports
`assertParticipant` from `conversations.service`. Importing back the other way is not merely untidy —
`conversationSelect` is a module-level const built from `messageSelect`, so whichever module loaded
second would read it during the other's temporal dead zone and crash on a startup ordering nobody
chose. Splitting the mapper out breaks the cycle rather than hiding it. Recorded in
[backend.md](conventions/backend.md).

**One test taught something worth keeping.** An assertion that the same attachment gets a different
URL on every read failed: a JWT's `iat` has one-second resolution, so two tokens signed in the same
second are byte-identical. The wire contract had claimed the stronger thing; both it and the test now
say the true one, which is more useful anyway — the URL is *sometimes* stable, which is the worst
case for anything keyed on it.

Known, deliberately deferred rather than missed:

- ~~One attachment per message, enforced by a unique on `messageId`.~~ **Closed in phase 22**, and the
  prediction held exactly: dropping the unique relaxed it without moving any data. The gallery and
  the caption question were the real work, not the schema.
- Images only. The MIME filter and the re-encode both assume it, and a general file type would need
  a download flow rather than an `<img>`.
- No lightbox — a picture is shown at up to 320×400 in the bubble and cannot be opened full size.
- No upload progress. A 10MB photo on a slow connection shows a disabled button and nothing else.

## Phase 5 — Production readiness — `done`

| # | Item | How it ended up |
| --- | --- | --- |
| 12 | Redis-backed rate limiting | `done` — and the socket adapter with it |
| 13 | Dockerfile + production compose | `done` |
| 14 | CI running `npm run verify` | `done` |
| 15 | Automated e2e (Playwright) | `done` — and it immediately found a real bug |

### Item 12: Redis, for rate limits *and* rooms

The roadmap said "rate limiting", but that was only half of what blocked a second instance. Socket.io
keeps its room registry in process memory too, so a message broadcast by one instance would reach
nobody connected to the other — and `fetchSockets()`, which is how presence answers "who is online",
would only ever see half the users. Both are fixed by `@socket.io/redis-adapter`, and doing one
without the other would have produced a system that scaled its rate limits and silently lost its
messages.

**`REDIS_URL` is optional, and that is a decision rather than laziness.** Required would mean
`npm run verify` and every `npm run dev:server` needed a Redis container to start. Without it both
mechanisms fall back to process memory — correct for one instance, wrong for two — so
`docker-compose.prod.yml` always sets it and the server logs a loud warning if it is missing in
production.

Each auth limiter has its own Redis namespace. They originally shared `chatty:rl:<identity>`, which
made registration, login, refresh and recovery requests consume the same counter in production even
though their windows and limits differ; the in-memory development stores were separate and hid the
collision.

**Verified by running two instances, not by reading the code.** Both pointed at one Redis:

- The register limiter is 10/hour. Six calls to instance A then six to B: the eleventh request
  overall — the fifth on B — came back 429.
- A message sent over HTTP to A arrived on a socket connected to B.
- The presence snapshot B sent to its own client listed a user connected to A.

The same three were then repeated against the containerised stack from item 13.

### Item 13: images and a production compose

`apps/server/Dockerfile` is multi-stage and ships production dependencies only — the build stage's
`node_modules` holds TypeScript, vitest and every type package, none of it reachable at runtime and
all of it attack surface. It runs as `node`, not root. Debian slim rather than Alpine, deliberately:
`sharp` ships prebuilt binaries for glibc and needs libvips compiled from source on musl.

Migrations run at container startup rather than in the image, because they need a database — which
exists at deploy time, not at build time.

`apps/web/Dockerfile` builds the static bundle and serves it from nginx, with the SPA fallback that
client-side routes need (`/profile` is not a file on disk) and two cache rules that matter:
fingerprinted assets forever, `index.html` never — it is the one filename that does not change and
which points at all the ones that do.

**`docker-compose.prod.yml` runs two API instances on purpose.** Not because two is the right number,
but because one is the number that hides every assumption item 12 just removed.

**One bug in this file, found by running it.** Both compose files derived their project name from the
directory, so both owned a container called `chatty-postgres-1`: starting the production stack
silently replaced the development one, pointed at a different volume. The production file now pins
`name: chatty-prod`.

### Item 14: CI

`.github/workflows/verify.yml` runs `npm run verify` against a real Postgres service on Node 22.22.2 —
pinned to the exact minimum, because `engines` requires it and on anything older the web suite does
not fail a test, it fails to start. A second job builds both images, kept separate so a broken
Dockerfile cannot hide behind a green suite or the other way round.

CI adds no new checks. `verify` already existed; what did not exist was anything making it
unskippable.

### Item 15: Playwright, and the bug it found on its first run

Eleven specs in `e2e/`, driving a real browser against a real server against a real database — its own
database, `chatty_e2e`, because the global setup truncates it.

The centre of it is a two-context test: Alice and Bob register through the actual sign-up form, Alice
starts the conversation, **Bob's sidebar gains it over the socket with no reload**, Bob opens it, and
only then does Alice send. The message cannot have arrived in a page load. Nothing below the browser
can make that assertion — a service test proves what `sendMessage` asked to broadcast, a component
test proves what `MessageList` renders given an array.

**It found a real bug within an hour of existing.** Attaching an image and pressing Enter instead of
clicking send posted a text-only message and silently dropped the picture. The cause was in
`components/button`: it never set `type`, so the HTML default of `submit` applied, and pressing Enter
in a text field activates a form's *first* submit button — which in the composer is the preview's
"Remove attached image". `Button` now defaults to `type="button"`, every real submit already said so
explicitly, and the same trap was open in three other forms. Three unit tests now cover it too, so it
does not need a browser to be caught twice.

Known, deliberately deferred rather than missed:

- **The suite runs with the rate limiters off** (`NODE_ENV: "test"`). It ran as `development` first,
  so the browser would meet the same middleware a user does; what that bought was a ceiling of about
  eight tests, after which `/auth/register`'s 10-per-hour limit turned every new spec into a sign-up
  form that silently would not submit. No spec ever asserted a limit, so the coverage was imaginary
  and the trap was real. The limiters are exercised by hand instead — see phase 3, item 9.
- One browser (chromium). Cross-browser matters for a product and not yet for this.
- `test:e2e` is not part of `verify`. It needs two servers and a browser download, and a definition
  of done that takes a minute is one people stop running.

---

---

## Phase 6 — What the first real user noticed — `done`

Not planned work. Someone opened a group, watched a member leave, and asked three questions in a row:
where is the notice, why did that person's messages lose their face, and is everybody the owner here?
All three were on the list below as known gaps, which is a fair description of what a known gap is —
a bug somebody has already agreed to be surprised by later.

| # | Item | How it ended up |
| --- | --- | --- |
| 16 | A message keeps its author after they leave | `done` — the bug behind the missing avatar |
| 17 | System messages for group events | `done` — [ADR 0009](adr/0009-system-messages.md) |
| 18 | A group owner, and what only they may do | `done` — [ADR 0008](adr/0008-group-owner-role.md) |

### Item 16: a message is not a pointer into the participant list

`MessageDTO` carried `authorId`, and the client resolved it against
`conversation.participants` to find a name and an avatar. That answers "who is in this conversation
now", which is a different question from "who wrote this" — and the two diverge the moment anyone
leaves. Their messages stayed in the log with a blank margin where the avatar had been and, in a
group, no name above the bubble.

`MessageDTO.author` is now the whole `UserDTO`, selected with the message. One join per page of
messages, in exchange for history that keeps its faces. `authorId` is gone rather than kept
alongside: two spellings of the same fact is how they drift.

Two smaller things fell out of it, both real:

- **`isGroup` is a prop, not a headcount.** The message list decided whether to print author names
  with `participants.length > 2`, so a three-person group that lost a member stopped naming
  anybody — dropping the names from exactly the messages that had just become unattributable.
- **One projection for a `UserDTO`.** Three modules had grown their own copy of the same five-line
  mapping (users, conversations, and now messages), and `avatarUrl` — built from a timestamp, with a
  cache-busting `?v=` — is precisely the field a fourth copy forgets. `users.mapper.ts` now owns it,
  the way `messages.mapper.ts` owns a message.

### Item 17: the log says what happened

"An added Binh", "Chi left the group", "An renamed the group to Weekend football" — a real `Message`
row with `kind = SYSTEM` and no author, written with the conversation timestamp and broadcast on the
same `message:new` everyone already listens to. Phase 7 put the surrounding membership/name change
in that transaction too. It survives a reload, sits in
order among the messages around it, and reaches people who were offline when it happened; a notice
rendered client-side from `conversation:updated` does none of the three.

The sentence is rendered once, when the event happens, and stored. The alternative — ids resolved at
read time — has to resolve them against the people in a group event, who are exactly the people most
likely to have left it. That is item 16's bug, wearing a different hat. See
[ADR 0009](adr/0009-system-messages.md) for the trade-off this accepts: an old line does not follow a
later rename.

System lines never count towards an unread badge, and that falls out of the SQL rather than being
special-cased — the unread query compares authors, and `null <> $viewer` is null, not true.

### Item 18: somebody owns the group

The creator owns it. Only the owner renames it or removes anyone else; **anyone may invite, and
anyone may leave** — an owner who could hold people in a group would be a worse failure than a group
with no owner. An owner on their way out hands it to the longest-standing member left, because the
alternative is a group nobody can ever administer again: no code path would exist to grant the role.

Pre-existing groups have no recorded creator, so the migration promotes each group's
longest-standing participant. Without that backfill every group made before this change would have
been permanently ownerless.

The UI states the rule rather than enforcing it silently: the rename field is disabled with a line
saying who can change it, remove buttons are absent for members, and the owner's row carries a badge
so it is obvious who to ask. `assertOwner` throws a new `ForbiddenError` (403) rather than the 404
`assertParticipant` uses — there is nothing left to hide from someone who is already in the group,
and a 404 would leave the UI unable to explain itself.

Known, deliberately deferred rather than missed:

- ~~No manual hand-over.~~ Closed in phase 13.
- ~~No second admin, demotion or invite policy.~~ Closed in phase 42; ADR 0018 defines the hierarchy.
- ~~No confirmation dialog before a kick or leave.~~ Closed in phase 30.

## Phase 7 — Security and consistency under concurrency — `done`

Phase 6 made the visible behaviour right; this phase makes the same behaviour stay right when two
requests arrive together or one database write fails. The trigger was a review of the uncommitted
Phase 6/password-reset work before it entered history, not a new product surface.

| # | Item | How it ended up |
| --- | --- | --- |
| 19 | Password-reset links under concurrency | A per-user row lock serialises issuance; redeem atomically claims a still-unused, still-live token, so exactly one concurrent request can change the password. |
| 20 | Password-reset account-enumeration hardening | Known and unknown addresses share a 300ms response floor; mail delivery is detached from the HTTP path, so provider latency/failure cannot change the generic 204. |
| 21 | Atomic group transitions | Add, kick, leave, rename, owner transfer, system messages and `updatedAt` now commit or roll back together. Socket effects happen only after commit. |
| 22 | Database and authorization invariants | PostgreSQL enforces one owner per non-empty group and `Message.kind`/author consistency; conversation writes share a row lock and re-check membership after it. |

### Reset means one link, even with two requests

The old sequential test proved that a token failed after one completed redemption. It did not prove
two requests could not both read `usedAt = null`, hash different passwords and commit in parallel.
Redemption now claims the token with one conditional update (`usedAt IS NULL`, `expiresAt > now`)
inside the same transaction as the password update. A zero-row claim is the same invalid-link error
as an expired or imaginary token. Fault-injection tests also prove a failed password update rolls the
claim back rather than burning a usable link.

Issuance had the mirror race: two requests could both invalidate the old set before either created a
replacement, leaving two current links. `SELECT ... FOR UPDATE` on the user makes invalidate + create
one ordered transition, and a concurrency test asserts only one unspent row survives.

The endpoint's body and status were already generic, but an unknown address returned immediately
while a known one performed writes and sent mail. Both paths now enter the same transaction and wait
for a 300ms response floor. Delivery starts after the token commits but is not awaited: a provider
only runs for a real account, so allowing its latency or failure to affect HTTP would recreate the
oracle. The current console mailer is process-local; a real provider needs a durable outbox, recorded
below rather than hidden by this response policy.

### A group transition is one fact

All mutations of one conversation take the same `Conversation` row lock. Permission checks run after
that lock, then the membership/name change, system messages, owner hand-over and timestamp update run
inside one interactive Prisma transaction. The result has a clear order under concurrency. If the
owner and their likely successor leave together, one finishes first and the second chooses from the
membership that actually remains.

`sendMessage` joins the same protocol. It keeps a cheap membership check before attachment work, but
re-checks after taking the lock; a send racing a kick either commits before the kick or sees the
completed removal and fails. It cannot pass authorization in one state and write in another.

Socket.IO is deliberately outside the database transaction and runs only after commit. A realtime
event can be lost if the process dies in that narrow window, but durable state never lies and reload
repairs the screen. Guaranteed event delivery would require a transactional outbox — see
[ADR 0010](adr/0010-serialize-conversation-writes.md).

### The database owns the invariant

Application checks are not enough for imports, maintenance scripts or a future code path. Two raw
SQL migrations add the pieces Prisma 5 cannot declare:

- an OWNER-only partial unique index: at most one owner per conversation;
- a deferred constraint trigger: every non-empty group has one owner at commit, direct conversations
  have none, and an empty group remains allowed;
- a `Message` check constraint: `SYSTEM` means no author and `USER` means an author exists.

The owner check is deferred because a hand-over briefly passes through zero owners inside an
otherwise valid transaction. The migration validates existing rows too. Database tests attempt each
invalid state directly, concurrency tests exercise the races, and fault-injection tests force system
message writes to fail and prove no membership/name/socket side effect escapes.

## Phase 8 — A message you can take back — `done`

The largest feature gap the README had listed since phase 1: everything in this app could be sent and
nothing could be changed. A typo stayed a typo, and a photo sent to the wrong group stayed there.

| # | Item | How it ended up |
| --- | --- | --- |
| 23 | Edit your own message | `PATCH .../messages/:messageId`, author-only, text-only. Records `editedAt`; the list marks the bubble "edited". |
| 24 | Delete your own message | `DELETE .../messages/:messageId`, author-only. Tombstones the row, empties the text, and removes the image row *and* its file. |

### Deleting is a tombstone, and that is not squeamishness

The obvious implementation — `DELETE FROM "Message"` — breaks two things in this schema that point at
a message id with no foreign key to protect them:

- `ConversationParticipant.lastReadMessageId` is a plain column on purpose (its own schema comment
  explains why a `SetNull` relation would be worse). `countUnreadByConversation` LEFT JOINs the marker
  and reads a miss as "this person has read nothing", so deleting the newest message in a conversation
  would have relit the badge on its **entire history** for everyone who had finished reading it.
- Paging hands the oldest loaded id back as a Prisma cursor. A cursor row that no longer exists fails
  the request for the next page rather than returning it.

So the row survives with `deletedAt` set, holding its place in the order, and the client renders
"This message was deleted" in it. Both failures have a test: one asserts a reader whose marker pointed
at the deleted message still sees zero unread, the other that the message keeps its position in
`listMessages`.

What does not survive is the content. `content` is emptied in the same write and the attachment row is
deleted, so a client that forgets to check `deletedAt` renders nothing rather than the message. A check
constraint (`"deletedAt" IS NULL OR "content" = ''`) makes that a property of the data instead of a
promise one service keeps — the same argument phase 7 made for the owner invariant. A second
constraint keeps `SYSTEM` messages immutable, because ADR 0009 already treats the group log as history
and nobody authored it to begin with.

Deleting the image also closes half of the "attachment files are not cleaned up" gap below: the file
is removed after the transaction commits, in that order for the same reason `sendMessage` writes it
before the row — a crash leaves an unreferenced file rather than a message showing a broken image. A
failure to unlink is logged rather than thrown: the message *is* deleted, and failing the request
would tell the caller otherwise.

### An edit does not count as activity

`editMessage` deliberately leaves `Conversation.updatedAt` alone. Fixing a typo in something sent last
week is not a reason to throw that thread to the top of everyone's sidebar with nothing new in it. The
sidebar *preview* still changes, because it reads the newest message rather than a stored copy — which
is why the client re-lists conversations on `message:updated` for the text and not for the ordering.

Both operations take the same `Conversation` row lock as every phase 7 mutation and re-check membership
after it, so a delete racing a kick has one honest order. One socket event, `message:updated`, carries
the whole message for both cases: the DTO's own `editedAt` / `deletedAt` say which happened, so a client
replaces by id with nothing to branch on. Deleting twice is idempotent and broadcasts once.

This phase originally left out edit history, a time limit, and "delete for me". Phase 15 closes all
three: edit and delete-for-everyone share an eight-hour author window, history is append-only, and
per-participant visibility is applied consistently to message pages, search, sidebar previews and
unread counts.

## Phase 9 — Mail that survives a crash — `done`

The gap where the code was quietly lying. The README said password reset worked, and at repository
level it did — tokens, expiry, session invalidation, all real. But the link was handed to a
fire-and-forget `void promise.catch(log)`, so one bad minute at the provider, or a process dying at
the wrong moment, lost it with nothing left behind to say it had been owed.

| # | Item | How it ended up |
| --- | --- | --- |
| 25 | Transactional outbox | `OutboxMessage`, written by `enqueueMail` **inside the caller's transaction**. The reset token and the promise to mail it commit or roll back together. |
| 26 | Delivery worker | Polls, claims with `FOR UPDATE SKIP LOCKED`, retries with exponential backoff, gives up after six attempts, and redacts the body on every terminal outcome. |

See [ADR 0011](adr/0011-transactional-outbox-for-mail.md) for the reasoning in full.

### The clock bug this uncovered

The suite passed four runs in five, which is the worst possible result. The cause was not the tests:

`nextAttemptAt` was `@default(now())`, and **Prisma evaluates `now()` in the client**, using the
application's clock. The worker's claim compares that column against PostgreSQL's `NOW()`. Two
clocks. A machine a few milliseconds ahead of its database writes a row that is not due the instant
it is created — and on a real deployment, where the app and the database are different hosts, the
skew is not milliseconds. It would have shipped as mail that sometimes just sits there, with no error
anywhere and a table full of PENDING rows that look perfectly fine.

The rule that came out of it, and that anything scheduled must follow: **every value compared against
the database clock is written by the database.** `nextAttemptAt` is now
`@default(dbgenerated("CURRENT_TIMESTAMP"))` and the retry schedule is `NOW() + make_interval(...)`
in SQL. `createdAt` and `sentAt` are only ever read by people, so they stay ordinary.

A second, smaller version of the same lesson is in the tests: `NOW()` is *transaction start* time, so
two statements issued in order are not guaranteed to see it advance. A test that wants a row to be
due sets it an hour into the past, not to "now".

### What is still not built

Delivery is at-least-once. The claim counts its attempt and takes a two-minute lease in one
statement, so a crash mid-send does not immediately hand the row to another instance — but a crash
*after* the provider accepted and *before* the row is marked sent still duplicates. Closing that
needs an idempotency key the provider honours, which is a provider decision.

And the provider itself is still a `ConsoleMailer`. That is deliberate, not unfinished: `mailer.ts`
refuses to pick a transport from an env var, because a half-configured provider that silently falls
back to the console is exactly how a password reset appears to work in production and reaches nobody.
The swap is now genuinely one file, which it was not before this phase.

## Phase 10 — Mail that actually sends — `done`

Phase 9 built the durable half and stopped one step short: the transport was still `ConsoleMailer`,
so nothing left the process. "Password reset works" was true of everything except the part the user
experiences.

| # | Item | How it ended up |
| --- | --- | --- |
| 27 | A real transport | `SmtpMailer` over nodemailer. SMTP rather than a provider SDK, so the provider is a connection string instead of a dependency. |
| 28 | Configuration that cannot fail quietly | `MAIL_TRANSPORT` has no default; five misconfigurations now stop the boot instead of degrading. |
| 29 | Mailpit in `docker-compose.yml` | A real SMTP server and a web inbox on :8025, so development reads the mail rather than grepping a log. |
| 30 | Stable `Message-ID` | The outbox row id, so an at-least-once retry is recognisably the same message. |
| 31 | Outbox retention | Settled rows swept after 30 days by an hourly timer. PENDING is never touched, whatever its age. |

### Reversing the "no env var" decision, and why that is not a climbdown

`mailer.ts` carried a comment arguing the transport must be a code change, because "a half-configured
provider that silently falls back to the console is how a password reset appears to work in production
and reaches nobody."

That was right about the failure and wrong about its cause. The danger is the **silence**, not the
variable. So the variable exists and the silence does not:

- `MAIL_TRANSPORT` has no default. A deployment that never considered mail fails to start.
- `smtp` without `SMTP_URL` or `MAIL_FROM` fails to start.
- `console` with `NODE_ENV=production` fails to start — that combination writes every reset link to
  stdout.
- `SMTP_URL` must carry an `smtp://` or `smtps://` scheme. **This one was found by its own test.**
  `z.string().url()` accepts `localhost:1025`, because `new URL()` reads `localhost:` as a scheme —
  which is exactly the string someone pastes when they drop the prefix, and it would have failed at
  the first send, hours later, inside a worker.

All five are exercised against the real binary, not only the schema: the process refuses to listen.

### A second bigint cast, in the same shape as the phase 9 clock bug

`make_interval(days => $1)` fails with `function make_interval(days => bigint) does not exist`. Prisma
sends a JS number as `bigint`; `days` is `integer`, and bigint→integer is an *assignment* cast, which
PostgreSQL will not apply implicitly. `secs` is `double precision`, where the implicit cast does
exist — which is why the phase 9 claim query gets away without one and the retention sweep does not.
Both call sites now cast explicitly.

### What is still not closed

Delivery remains at-least-once. `Message-ID` makes a duplicate recognisable to a receiver that
deduplicates, and nothing more — a crash after the SMTP server accepted but before the row is marked
sent still produces a second copy for a receiver that does not. Removing that needs provider-side
idempotency, which SMTP does not define.

## Phase 11 — Refuse to start wrong, and prove two instances — `done`

Everything here is host-independent, which is the point: it was done while the hosting decision was
still open (see [DEPLOYMENT.md](DEPLOYMENT.md)), because none of it depends on the answer.

| # | Item | How it ended up |
| --- | --- | --- |
| 32 | `SINGLE_INSTANCE` declaration | In production, either `REDIS_URL` or `SINGLE_INSTANCE="true"`. Neither, and the server does not boot. |
| 33 | Readiness split from liveness | `/health` says the process answers; `/ready` says the database and Redis do, and returns 503 when they do not. |
| 34 | Security headers | Helmet on the API, with the one default that had to change. |
| 35 | WebSocket-only socket transport | Long-polling cannot survive two instances without session affinity. |
| 36 | `scripts/smoke.sh` | 17 checks against a running deployment, safe to point at production. |
| 37 | The two-instance path, actually run | Not asserted — run, for the first time. |

### The README's largest gap, closed by asking rather than requiring

"Running more than one instance requires `REDIS_URL`, and nothing enforces it" had been the top item
under Known gaps since phase 5. Without Redis, two instances do not fail — they behave as two
separate apps, and a message sent to one never reaches anyone connected to the other. The guard was a
log warning, and a warning is a thing people scroll past.

Requiring Redis in production would have been wrong: a single instance in production is a legitimate
shape, and it is the shape of this project's first deployment. So the rule is a **declaration**, not a
dependency — in production, point at Redis or say out loud that there is only one of you. Both are
fine; saying neither is the case that used to fail silently. Verified through the real
`config/env.ts` in five configurations, not against a copy of the schema.

### Helmet's default that would have broken every picture

`Cross-Origin-Resource-Policy: same-origin` is the right default for a server that renders its own
pages. This one does not: avatars and attachments are served from the API into an `<img>` on the web
app's origin, which is a different origin in every environment this app has. Left alone, every image
in the product stops loading — and the response is still a perfectly good 200, so nothing that
asserts on a response body can see it. Set to `cross-origin`, with a test on the header and a
cross-instance fetch of a real uploaded avatar to prove it.

A CSP is deliberately *not* set on the API: it is a JSON and image server with no pages to govern,
and setting one there would read as though the web app were covered when it is not. The web app's own
CSP is still missing, and is listed under Known gaps rather than half-done.

### What the two-instance run found

`docker-compose.prod.yml` has claimed since phase 5 that two instances behave as one system. Nothing
had ever checked it — the test suite is one process and Playwright talks to one server. Built and
run: two API containers on separate ports, one Postgres, one Redis.

- A socket connected to **api-2** receives a message written through **api-1**. So do edits, deletes
  and presence. The Redis adapter is genuinely carrying broadcasts across processes.
- **Both containers run `prisma migrate deploy` at startup**, which is a race. It resolved correctly —
  one applied every migration, the other reported "No pending migrations to apply" — because Prisma
  takes an advisory lock. Worth knowing rather than assuming; on a host with a release phase, that is
  where migrations belong regardless.
- An avatar uploaded through api-1 is served by api-2, because they share a volume. This is the exact
  behaviour that per-machine disks would break, and it is why object storage is a prerequisite for
  some hosts and not others.
- `smoke.sh` run twice in a minute got a 429 — the shared rate limiter working across instances, and
  a good sign. The script reported it as ten unrelated failures, which was the script's fault: it now
  detects that case and exits 2, distinct from 1.

## Phase 12 — Finding a message — `done`

Editing and deleting were phase 8; finding was the half left over. A chat app without search stops
being useful at exactly the point its history becomes worth keeping.

| # | Item | How it ended up |
| --- | --- | --- |
| 38 | `Message.searchVector` | A **GENERATED** column, `to_tsvector('simple', content)`, with a GIN index. |
| 39 | `GET /search/messages` | Global across every conversation you are in, newest first, cursor-paged. |
| 40 | Search panel in the sidebar | Debounced as you type; a result opens its conversation. |

### A generated column, not a trigger

PostgreSQL keeps `searchVector` in step with `content` by construction. That is not a tidiness
preference — it removes a whole class of bug. There is no backfill for existing rows, no trigger for a
future write path to forget, and no way for the index to disagree with the message it points at.
Phase 8 gets two behaviours for free as a result: an edit changes what the message matches, and a
delete empties `content` so the tombstone stops matching, without either code path knowing search
exists. Both have a test.

### `simple`, and the diacritics it keeps

The `english` text search configuration stems and strips stop words for one language. This app's
messages are mostly Vietnamese, where that is wrong: it would discard "a", "the" and "is" as noise
and do nothing useful to anything else. `simple` lowercases and splits on word boundaries — exactly
right for Vietnamese, and merely unambitious for English, where "running" will not match "run".

What it did **not** do is ignore diacritics, so `hen gap` did not find `hẹn gặp`. The fix was written
out in full in this migration and deferred as a host-level dependency — **closed in phase 20**, where
that reasoning turned out to have expired rather than been overturned.

### Authorization is a join, not a filter

The membership check is inside the query — `JOIN "ConversationParticipant" ... AND p."userId" = $1` —
rather than a pass over the results afterwards. Filtering afterwards means the database handed back
rows the caller may not see, with one line of application code standing between that and a response.

The consequence is that leaving a group removes its messages from your search, which is the same rule
the sidebar already follows: a group you left disappears from it entirely. That is deliberate, and it
is the one place where "your history" and "what you can search" differ.

### Two queries, on purpose

The match runs in raw SQL, because `@@ websearch_to_tsquery` is not something Prisma's query builder
can express. It returns ids only; a second, ordinary Prisma read turns those into DTOs using the same
`messageSelect` every other message response shares. Hand-writing the join in SQL would mean a second
mapper to keep in step with `messages.mapper.ts`, which is the divergence that mapper exists to
prevent.

`websearch_to_tsquery`, not `to_tsquery`, and the difference is a 500: `to_tsquery` throws a syntax
error on a bare space, so the first person to search for two words would have got one. Punctuation
soup is a test case for the same reason.

Results are newest-first rather than ranked. In a chat the thing being looked for is almost always
the recent one, and a relevance score would put a three-year-old message above this morning's for
saying the word twice.

## Phase 13 — What an account needs before real people have one — `done`

Four things every messenger has and this one did not, and they are the same four because they are
the same subject: an account is something you can move, hand on, hide behind, and leave.

| # | Item | How it ended up |
| --- | --- | --- |
| 41 | Change your email | `POST /auth/email` + `POST /auth/email/confirm`. The new address is parked on an `EmailChangeToken` until a link sent to it is opened; the old address is warned in the same transaction. |
| 42 | Hand a group over | `PUT /conversations/:id/owner`, owner-only, on the phase 7 lock. Demote then promote, with a system line. |
| 43 | Turn read receipts off | `User.readReceiptsEnabled`, plus a **second** marker column that only advances while they are on. |
| 44 | Delete your account | `DELETE /users/me`. The row, its tokens, its memberships and its avatar file go; its messages stay, without a name on them. |

### An unverified address is not a credential

The obvious implementation writes `User.email` and mails a "you changed your email" notice. That is
wrong in a way that is easy to miss: the address on an account is where a password reset is
delivered, so writing an unproven one hands the account to whoever typed it — including to the
person who typed it wrong and can now recover neither.

So nothing about the account changes when the request returns. The new address lives on a token row
for an hour, and `User.email` moves only when the link mailed to it is opened. The uniqueness of the
address is re-checked at that second step against the database's own index rather than trusted from
the first, because the gap between them is an hour wide and somebody else can register it in the
meantime — a `P2002` caught and turned into a 409, not the 500 an unhandled Prisma error would be.

Two mails, not one. The second goes to the **old** address while it is still the address that can do
something about it, and it is sent at request time rather than after confirmation: a warning that
arrives once the door has closed is a log entry, not a warning.

Sessions are deliberately left alone. This changes what you sign in *with*, not whether the person
signed in is still you — the password is untouched, and the warning covers the case where it is not.

### The owner hand-over the phase 7 migration was already waiting for

`ConversationParticipant` carries a partial unique index (`WHERE role = 'OWNER'`) and a **deferred**
constraint trigger, and the migration's own comment says why it is deferred: "an owner hand-over
briefly has zero owners between DELETE and UPDATE inside an otherwise-valid transaction." That
hand-over did not exist yet. It does now, and it needed no schema change at all — demote first (the
per-statement unique index would refuse a second owner), promote second, and the deferred trigger
re-checks at commit.

Two hand-overs racing are settled before either reaches the constraint: both take the `Conversation`
row lock, and the one that arrives second finds it is no longer the owner and gets a 403. The
invariant is still there underneath as the thing that would catch a mistake — the point is that the
application never asks it to, so the failure a user sees is a sentence rather than a 500.

### Read receipts, and why one boolean is not enough

The setting is symmetric: hide yours and you stop seeing everyone else's. That half is
straightforward. The hard half is the sentence "turning it back on must not reveal what you read
while it was off", and it rules out the obvious design — a flag consulted at read time, exposing
`enabled ? lastReadMessageId : null`. Under that, flipping the switch back publishes the whole hidden
period in one go, retroactively, for anyone watching.

So there are two markers. `lastReadMessageId` keeps advancing whatever the setting says, because the
unread badge is the reader's own business and nobody else's. `lastSharedReadMessageId` — the one
every DTO and every broadcast actually reads — advances only while receipts are on. While they are
off the reader's position is never written anywhere a response could reveal it, and turning them
back on publishes nothing by itself: the shared marker is stale, and it catches up on the next thing
actually read. A receipt caused by an action, which is what a receipt is.

Turning them **off** also clears the shared markers that were already given, and broadcasts
`conversation:updated` to say so. A setting that leaves yesterday's "Seen" sitting on somebody's
screen has not done what its label says.

One asymmetry is honest about where it lives: the server guarantees your marker does not leave, and
the *fairness* half — that you do not get to read theirs — is enforced where the receipt is rendered.
It is a product rule rather than a confidentiality one, and pretending otherwise would mean
per-viewer copies of every room broadcast.

### Deleting an account: what goes, and the one decision that had to be made

Gone: the user row, and by cascade their participant rows, their reset tokens and their pending email
changes; their avatar file, which closes the "avatar files are not cleaned up" gap — nothing had ever
deleted a user, so nothing had ever been the right place to delete the file; and their live sockets,
which are already past the gate `requireAuth` re-checks.

**Their messages stay.** `Message.authorId` was `ON DELETE CASCADE`, which would have deleted every
message they ever wrote — gutting other people's conversations, and hard-deleting rows that
`lastReadMessageId` and the paging cursor point at with no foreign key to protect them. That is
precisely the pair of failures that made a message delete a tombstone in phase 8, and they do not get
weaker when the account rather than the message is what went. The relation is now `SET NULL`.

That forced the phase 7 check constraint open. It read `kind` and `authorId` as two spellings of one
fact — `USER` implied an author — and a message outliving its author breaks that. Only the SYSTEM
direction survives, which is the half that was ever load-bearing, and `kind` goes back to being the
discriminator its schema comment already said it was. One consequence had to be chased down by hand:
`countUnreadByConversation` excluded system messages by relying on `null <> $userId` being null, so
after this change it would have silently stopped counting the messages of everyone who ever left. It
filters on `kind` now.

**The name goes with the account, and that was a decision rather than a default.** The alternative —
copying the author's display name onto the message when it is written, the way the system log already
snapshots names — is a real design that other apps choose. It was rejected: holding on to the name of
somebody who has just asked to be erased is the opposite of what they asked for. An authorless USER
message renders as "Deleted account".

Attachments on those messages stay too, since the messages do. So account deletion does **not** close
the orphaned-attachment gap, whatever the plan said: that one is about files whose upload failed, and
it needs a sweep of the upload directory rather than a line in this service.

Every group they were in gets a `"X deleted their account"` line and, if they owned it, a new owner —
the database refuses a non-empty group with none, so the hand-over is not a nicety but the difference
between the delete working and failing. All of it commits with the user row, because half of this
having happened is a person who has left four groups and still has an account.

## Phase 14 — the four things that were actually broken — `done`

Not features. Everything here was already listed under Known gaps, and what they have in common is
that each one was a defect wearing a feature's clothes — the kind that gets deferred forever because
nobody is asking for it by name.

| # | Item | How it ended up |
| --- | --- | --- |
| 45 | Unread starts when you joined | One condition in `countUnreadByConversation`, bounded by `ConversationParticipant.joinedAt`. |
| 46 | Two test runs cannot corrupt each other | A session advisory lock held by `tests/global-setup.ts` for the whole run. |
| 47 | A Content-Security-Policy for the web app | `nginx.conf` became a template; the policy names the API's origin, derived once. |
| 48 | Orphaned attachment files are swept | `lib/orphaned-uploads.ts`, on the same shape as the outbox retention sweep. |

### Being added to a group was a badge with five years in it

A new participant's read marker is null, and the unread query reads a null marker as "has read
nothing" — true, and useless. Joining a group with history therefore lit the badge with all of it.

The bound is `joinedAt`, and it is applied to **everyone** rather than only to new joiners. That was
the thing the gap entry was worried about — "a second axis on unread math" — and it turned out to be
the opposite: one rule instead of two. For the people who were there from the start, `joinedAt` is
the moment the conversation was created, so nothing predates it and nothing changes for them. There
is a test that says so.

`>=`, not `>`. Both columns are millisecond timestamps written by the application, so a message sent
in the same millisecond as somebody joining is a real tie — constantly, in tests, where a fixture
creates a conversation and sends into it in one breath. Counting that message is the friendlier way
to be wrong.

### A test suite that could be corrupted by a second terminal

`tests/setup.ts` truncates every table before every test, so two runs against `chatty_test` deleted
each other's fixtures mid-test. It never looked like a collision: it looked like "user does not
exist" and "email already registered" scattered across unrelated files, which reads as a broken suite
rather than a busy database.

`global-setup.ts` now takes a PostgreSQL **session** advisory lock before it does anything else,
including the migration, and a second run refuses to start with a sentence that says what to do. A
session lock rather than a row or a lock file because it is released when the connection ends —
including on `ctrl-c`, and including on a crash. A lock that has to be cleaned up is a lock that
eventually strands the database in "busy" with nobody holding it.

It needs its own client with `connection_limit=1`. A pooled client is free to take the lock on one
connection and run the unlock on another, which would leave the lock held until the process exited.

### The CSP, and the two ways it could have been decorative

The API got Helmet in phase 11 and the web app got nothing, which was recorded as a gap rather than
half-done. It is the half that matters most for a chat app: every message is a string a stranger
typed. React escapes what it renders, so this is defence in depth — and the point of defence in depth
is the day something reaches `dangerouslySetInnerHTML`, or a dependency does it on this app's behalf.

Two things would have made the policy pointless, and both were found by running it rather than by
reading it:

- **`add_header` does not merge.** A `location` block that sets any header of its own discards every
  header inherited from the server block. Both locations here set a `Cache-Control`, so both would
  have silently served the fingerprinted JavaScript and `index.html` — the two files the policy is
  actually about — with no policy at all. The directive is held in one `set $csp` and re-added in
  each block.
- **`ws:` is not `http:`.** A CSP source expression matches by scheme, so a `connect-src` naming only
  the API's URL lets every fetch through and blocks the socket, which is the entire product. The
  WebSocket origin is derived from the HTTP one in a `.envsh` the nginx entrypoint sources, so there
  is one value to configure and no way to configure it inconsistently.

The `.envsh` has to be **executable** or the entrypoint skips it, logging a line nobody reads and
failing nothing — the container then dies on an unsubstituted variable. `COPY --chmod=0755`.

Verified against the built image rather than the config file: the header is present on `/`, on a
fingerprinted asset and on a client-side route, and a real Chromium loads the app under it with no
violations and no console errors. What is **not** verified end to end is the app talking to a live API
through the policy — that needs the full production stack — so `img-src` and `connect-src` are
argued from the header's contents rather than demonstrated.

### The half of the orphan gap that was actually closeable

`sendMessage` writes the file before the row, deliberately: the other order leaves a message pointing
at a picture that is not there. A request that dies in that window leaves a file nothing will ever
reference, and no amount of care inside the service can see it afterwards. So it is swept.

The grace period is the whole safety argument, and it is generous rather than tight. A file written
seconds ago may belong to a request that has not committed yet, and deleting *that* one turns a
working upload into a broken image — strictly worse than the bytes being reclaimed. An hour is far
past any live request.

No lock, on purpose. Two instances sweeping compute the same set and both call `rm --force`, which is
what makes deleting the same file twice a no-op; a lock would be a second thing to get right for an
operation that is already idempotent.

One thing this does **not** cover: avatar files. The same sweep is the right home for them and the
loop is now here, but it was left out rather than added quietly — see Known gaps.

## Phase 15 — contributor setup and focused settings — `done`

This phase starts with the path every contributor takes before it changes product behaviour. The
seed, test database and line endings must work on a fresh Windows or Unix clone; otherwise a green
change depends on undocumented local state. It then replaces the long account page with focused
settings categories inside a viewport-sized application shell.

| # | Item | Status |
| --- | --- | --- |
| 49 | Seed a group with an explicit owner | Done |
| 50 | Create `chatty_test` automatically on the first server test run | Done |
| 51 | Pin repository text files to LF across platforms | Done |
| 52 | Keep desktop Settings within the viewport and show one category at a time | Done |
| 53 | Add attachment lightbox and upload progress | Done |
| 54 | Sweep orphaned avatar files | Done |
| 55 | Search inside a conversation and jump to the exact message | Done |
| 56 | Add an edit window, edit history and per-user message deletion | Done |
| 57 | Add privacy-aware last-seen presence | Done |
| 58 | Move routing to a non-vulnerable supported release | Done |

The desktop shell owns the viewport. Conversation lists, message history and a settings category may
scroll independently when their content genuinely does not fit; the document itself should not grow
a second scrollbar. Small screens remain content-first and may scroll rather than clipping controls.

Message actions follow the interaction shared by Telegram, Zalo and Messenger rather than occupying
permanent space beside every bubble: a single overflow button appears on hover or keyboard focus and
opens a compact menu. Edit and delete-for-everyone disappear at the exact eight-hour server deadline;
delete-for-me remains available, including on a tombstone. Search is scoped to the open conversation,
uses a stable `(createdAt, id)` cursor, and returns an explicit `hasMore` rather than making the client
guess from page length.

## Phase 16 — one look, and settings that do not cost you the conversation — `done`

The app worked and looked like four people had styled it. This phase replaces the slate-and-blue
Tailwind defaults with a single declared design, and moves account settings off a full page and on
top of the chat. The design was drawn first, on a canvas, and the code follows it rather than the
other way round.

| # | Item | Status |
| --- | --- | --- |
| 59 | One palette and one type system, declared as tokens | Done |
| 60 | Settings as a dialog over the chat, with `/profile` still deep-linking | Done |
| 61 | Split `MessageList`, and give the thread a day rule | Done |
| 62 | Wordmark at the top of the sidebar, account at the bottom | Done |

### Item 59: ink on paper

Everything comes from `@theme` in `styles/globals.css`, so no component names a colour that is not
in the palette — an ivory sheet, near-black ink at three strengths, hairline rules, and **one**
colour. Vermilion marks exactly three things: an unread count, the conversation you are in, and
something you cannot undo. `--live` is the single exception, because presence is a different kind of
fact from a notification and giving them the same red made an online dot read as a demand.

Two rules carry most of the personality, and both are one line each:

- **Anything a machine produced is set in mono** — a timestamp, a handle, a count, an avatar's
  initials. Two custom utilities (`eyebrow`, `meta`) exist so that is five classes in one place
  rather than in forty files.
- **Icons are drawn like the rules on the page**: `svg { stroke-linecap: square; stroke-linejoin:
  miter }` in the base layer. lucide ships every icon with round joins, and a rounded tick beside a
  hairline border was the one thing that made early drafts look like a different app from the waist
  down.

**The fonts are self-hosted, and that was a CSP decision rather than a preference.**
`nginx.conf.template` sets `style-src 'self'; font-src 'self'`. A `<link>` to Google Fonts needs both
relaxed and adds a third-party runtime dependency to an app that has none anywhere else, so Archivo,
IBM Plex Mono and Instrument Serif come from `@fontsource/*` and Vite fingerprints them into the
bundle. Only the four weights the design uses: Archivo alone ships nine, and each one is a file
somebody downloads.

**The avatar is circular everywhere, with a tinted ground and a dark initial.** The tints are stored
as *pairs* — a ground and an ink that is legible on it — because the failure mode of hashing a name
into a generated hue is that it eventually lands on yellow. A group is ink-filled and carries the
group's own initials rather than a generic icon, which had made every group in a sidebar look like the
same conversation. The presence mark follows the same circular silhouette.

**The destructive button is outlined, not filled.** A solid red block invites the click it exists to
slow down.

### Item 60: settings, over the chat

Renaming yourself is twenty seconds of work, and paying for it with the conversation you were reading
is a bad trade. `SettingsModal` renders over `ChatPage`, and `app.tsx` composes the two as siblings on
the `/profile` route — the only place both are in scope, so `features/profile` still does not import
from `features/chat`. Closing is a `navigate("/chat")` rather than a piece of state, which is what
makes the browser's Back button close the dialog for free.

**`hooks/use-dialog.ts` is the first shared dialog primitive** — Escape, a focus trap, and focus moved
into the panel on open. It exists because the edit-history dialog and this one needed the identical
thing from different features, which is the case the frontend conventions say to lift into `src/hooks`
rather than copy. Two copies of a focus trap are two chances for one of them to lose a case.

The nav rows are renamed: "Password" rather than "Security", "Delete account" rather than "Danger
zone". Both old names described a *kind* of setting; a row is more useful when it names the thing it
will let you do. **`AVATAR_UPLOAD_HINT` says 5 MB, not the 2 MB on the design canvas** — the design was
guessing and `MAX_AVATAR_BYTES` is the thing that actually enforces it.

### Item 61: the message list, in four files

`MessageList` was one file holding the scroll container, the run-grouping, the read receipt, the
editor state, the bubble, the tombstone, the system line and the attachment. It is now the container
plus `MessageRow`, `SystemMessage` and `DaySeparator`, and what stayed in the container is exactly
what a row cannot answer on its own: where the day changes, where a run begins, which single message
the "Seen" marker sits on, and which one is open for editing.

**A bubble's bottom corner is cut to 2px on the side the message came from.** That notch, not the
fill, is what says who spoke — it survives a glance, a screenshot, and anyone who cannot tell the ink
block from the paper one by colour.

**The thread gained a day rule, and `formatMessageTime` lost its date.** It used to print `23/08 09:41`
on every bubble because a wall of bare times told you nothing about which day you were in. The rule
states the day once, above the first message of it, so keeping the date on the bubble underneath would
print it twice. `formatDayLabel` says "Today" and "Yesterday" rather than dating them, and drops the
year inside the current one.

**An incoming continuation shows its time on hover.** The design gives a run's later bubbles no line
of their own, which would take their timestamps with them; revealing it on hover keeps the tight
stacking and loses nothing. An *edited* one is shown outright — a marker saying "this is not what was
sent" must not need to be discovered.

**The actions menu now says how long is left.** Edit and delete-for-everyone expire eight hours after
sending, and before this they simply stopped being there one day, which reads as a bug rather than as
a rule. The countdown is derived from the server's own `authorActionExpiresAt` rather than from a copy
of the window on this side, so the client cannot disagree with the deadline that will be enforced.
The design's progress bar was dropped for exactly that reason: drawing a bar needs the *length* of the
window, which would mean a second copy of "eight hours" to drift from the server's.

### Item 62: the sidebar

The wordmark and the search go to the top; the account chip goes to the bottom, where an account lives
in every application shell people already use. It was in the header before, which put the thing you
touch least at the top of the thing you scan most.

Two things the rows gained, both because the design showed them and both real information the old
sidebar dropped:

- **A timestamp**, shorter the more recent it is — minutes, then a clock time, then "Yest.", then a
  weekday, then a date. Computed from whole calendar days rather than elapsed hours, or an hour of
  daylight saving would decide whether last night counted as yesterday.
- **A preview that is never blank.** A picture with no caption used to render an empty line, which
  reads as a conversation with nothing in it — the one thing it is definitely not. A tombstone now
  gets the sentence the thread shows rather than the empty string the server left behind.

**`ChatPage` was over the 300-line limit after this**, and the audit said so. `ConversationSidebar`
came out of it; every piece of state stayed in the page.

### What was on the canvas and is not in the code

Three, each for a stated reason rather than by omission:

- **The eight-hour progress bar** — see item 61. It needs a duplicate of a server constant.
- **A three-button hover strip beside each message.** Phase 15 decided on a single overflow button
  and a menu, deliberately, and matching Telegram/Zalo/Messenger is worth more than matching a mock.
- **"Read receipts" as its own settings row.** It is a checkbox on the profile form, where the other
  privacy setting already is; splitting one form into two to gain a nav row is not an improvement.

Also different from the canvas on purpose: the search placeholder says "Name, @handle or email"
rather than "Find someone by @handle", because `searchUsers` matches all three and a placeholder that
under-describes what works is the same class of lie as one that over-describes it.

## Known gaps not on the roadmap yet

- **Handle placement.** Asking for a handle during registration is friction. Alternatives discussed:
  auto-generate one and let the user change it later (Instagram-style), or move the field into
  onboarding. Deliberately deferred, not forgotten.
- **Every authenticated request now reads the user row.** The cost of closing the gap above:
  `verifyAccessToken` compares each token's `iat` against `passwordChangedAt`, so a JWT is no longer
  self-contained proof and both HTTP and the socket handshake hit the database. Correct, and the
  thing to remember before adding a per-request query of your own.
- **No production mail account is signed up for.** Mail sends for real over SMTP as of phase 10, and
  development runs against Mailpit, but a deployment still needs a provider, a verified sending
  domain, and SPF/DKIM/DMARC records — none of which are code, and without which mail is accepted by
  the provider and filed as spam by the recipient. That is the remaining distance, and it is
  paperwork rather than engineering.
- **Delivery is at-least-once.** A crash after the SMTP server accepted but before the row is marked
  sent still duplicates for any receiver that does not honour `Message-ID`. SMTP defines no
  idempotency key, so closing this properly means a provider API that does.
- **Nothing bounces back.** A hard bounce, a rejected recipient or a complaint is invisible here: the
  outbox records that the *server accepted* the message, which is not the same as it arriving.
  Handling that needs the provider's webhooks, which is the first thing that would justify leaving
  plain SMTP.
- **An attachment URL is bearer proof until it expires.** Copied out of the network tab it works
  anywhere for up to an hour, and someone removed from a group can still fetch an image whose token
  they were handed a minute earlier. Inherent to signed URLs rather than an oversight — see
  [ADR 0007](adr/0007-signed-attachment-urls.md) — and the TTL is the whole mitigation.
- **A deleted account's name is gone from its messages, and cannot be brought back.** The messages
  survive with `author` null and render as "Deleted account" (phase 13). Anyone who wants the history
  to keep reading as a conversation between named people would need a display-name snapshot on every
  message row, written at send time — which is a schema change and, more to the point, a different
  answer to what deletion means.
- **A read marker pointing outside the loaded page shows no "Seen".** Correct rather than wrong (the
  alternative is guessing), but it means a receipt can disappear when you scroll far enough back.
- **Notifications need the tab to exist.** They are raised from the socket in the page, so closing
  the tab ends them. Anything more needs a service worker and Web Push — a different piece of
  machinery, and one that needs VAPID keys, which is the same class of blocked-on-a-purchase as the
  mail provider.
- **The test suite still shares one upload directory across tests.** The database is truncated before
  each test and the filesystem is not, so a file written by one test survives into the next as a
  genuine orphan. Harmless for every suite except the sweep's own, which empties the directory
  itself — but it is the same class of problem the advisory lock closed for the database, one level
  down.
- **A system line does not follow a later rename.** "An added Binh" is stored as text when it
  happens, so it keeps the names people had at the time. Deliberate — see
  [ADR 0009](adr/0009-system-messages.md) — and recorded here so it is not "fixed" by accident.
- **Nothing prunes system lines,** and nobody can delete one by hand either — the phase 8 check
  constraint makes them immutable on purpose (ADR 0009). A group with a lot of churn accumulates them
  in its history the same way it accumulates messages.
- ~~There is still no second admin/demotion or invite restriction.~~ Closed in phase 42: the owner
  may appoint admins, admins operate on ordinary members but not one another, and the owner chooses
  open or manager-only invitations. See [ADR 0018](adr/0018-group-admins-and-invite-policy.md).
- **Blocking does not reach into a group.** Phase 32 added blocking for direct conversations; a group
  both people are in is deliberately untouched, which is the line WhatsApp, Messenger and Telegram
  draw. Combined with the item above, it means a member can add somebody you have blocked to a group
  you are in, and you will see their messages there. Recorded so it is a decision rather than a
  surprise.

## Phase 17 — the grammar of a message cluster — `done`

Phase 16 gave the app one look. This phase is about the geometry *inside* it: what a run of messages
from one person is supposed to be, and the two things a message could not do yet.

| # | Item | Status |
| --- | --- | --- |
| 63 | Geist + Geist Mono, and a Vietnamese subset the old pair did not have | Done |
| 64 | Corner grammar: a run of messages is one shape, with one tail | Done |
| 65 | Message meta moves into the gutter, off the vertical | Done |
| 66 | Reactions | Done |
| 67 | Replies | Done |
| 68 | Quiet-time grouping and the mobile conversation flow | Done |

### Item 63: one superfamily, and diacritics that do not fall out of the font

Archivo and IBM Plex Mono were two unrelated designs, and every 10px label in the app was a seam
between them. Geist and Geist Mono are one family — the mono is the sans redrawn on a fixed pitch —
so a timestamp beside a sentence shares its skeleton rather than arguing with it.

The half that was a **bug**, not a preference: neither of the old faces ships a `vietnamese` subset,
so a display name or a message with diacritics fell back per glyph, mid-word. Both new faces carry
one. Instrument Serif still does not and is therefore never allowed to hold user text — it is the
wordmark and four fixed English headings, and that is now written down beside the import.

The paper lost about half its chroma at the same time. At the old value the background read as aged
newsprint, which dirtied every photograph posted on it.

### Items 64 and 65: a run of messages is one object

What shipped before put the same 2px notch on **every** bubble, so a burst of five messages showed
five tails stuttering down one edge and the notch stopped meaning "the turn ends here" — it meant
nothing, because it was everywhere.

The rule, in `constants/message-cluster.ts` as two tables: **the side away from the tail never
changes.** It stays at the full 10px for the whole height of the run, and that unbroken edge is what
makes five bubbles read as one turn. Only the tail side moves — a 4px seam where a bubble meets its
neighbour, and the 2px notch on the last one alone. The seam is 4px rather than 0 deliberately: a
squared-off join between two bubbles of the same fill reads as a clipping fault, and the eye stops
on it.

A picture inside a bubble follows the corners around it — each of its own is the bubble's *minus the
5px padding*, so 10 becomes 5 and both the seam and the notch collapse to 0. It was a flat
`rounded-[7px]` before, a number that matched neither the bubble it sat in nor anything else.

Four things close a run early, and each has a reason rather than a preference:

- **A reply** — it points somewhere else, so it is a new turn even from the same person.
- **A pause longer than five minutes** — adjacency is not continuity; two messages sent hours apart
  are separate turns even if nobody spoke between them. A same-day pause of an hour also gets one
  centred time marker so the reader is re-oriented without repeating the date.
- **A tombstone** — nothing was said, so there is no turn to continue. It also takes no notch at all.
- **A day rule or a system line**, as before.

A reaction deliberately does **not** close the run. Its row reserves the clearance under the bubble,
so a reaction landing between the second and third messages in a burst does not rewrite the corner
grammar and make one author look like they took two separate turns.

Item 65 is what made the ratio legible: every timestamp used to sit on its own line *under* its
bubble, which prised a burst of five messages apart into five separate-looking statements. The time,
the edited marker, the read receipt and the actions now sit in a gutter beside the bubble, on its
centreline. The gutter is laid out at full width and only *faded* in, so hovering a message reveals
its time without moving a pixel of the thread — and a run states its time once, at the end, rather
than printing the same minute four times.

The `⋯` lost its plate in the same pass. A white rounded chip beside a bubble reads as a second,
smaller message; the affordance is now carried by the glyph lifting from faint to full ink.

### Item 66: reactions

> **Superseded by phase 29, item 91.** The set is open, the chips render emoji, and one person gets
> one reaction per message. The Unicode half of the argument below is the half that survived: it is
> now enforced by a regex at the request boundary rather than by an enum column. Everything else
> here is the reasoning as it stood, kept because the reversal is only legible against it.

A closed set of five, stored as a Postgres enum and drawn from the icon set in ink. Not "any emoji",
for two reasons: a full-colour 😂 beside an ink bubble is the most saturated thing on a page that
spends its one colour on unread counts and things you cannot undo, and a free text column makes "the
same reaction" undecidable — U+2764 and U+2764 U+FE0F are two strings and one heart.

Three decisions worth keeping:

- **The composite primary key `(messageId, userId, kind)` is the toggle.** `deleteMany` reports how
  many rows it removed; zero means create one. The database decides, not a client that would
  disagree with itself across two tabs.
- **The DTO names everyone rather than counting.** `userIds`, not `count` plus `isMine` — the
  message is broadcast to the whole room as one payload, so anything answering "is this me?" would
  be answering it for whoever happened to trigger the write. The viewer holds their own id.
- **The chips hang off the edge *away* from the tail.** The tail side already carries the seams and
  the notch; a chip there would sit on the one corner that says where a turn ends. They overlap the
  bubble by exactly half, so a chip is unmistakably cut by the message it belongs to rather than
  floating between that message and the next.

Desktop keeps heart and reply as one-click hover actions; the overflow menu holds the other four
reaction kinds and the less frequent edit/delete actions. Reactions of one kind stay grouped in one
chip, and its hover title resolves the participant names instead of exposing only an unexplained
count.

A tombstone drops its reactions. The rows survive, but three hearts under "This message was deleted"
reads as approval of the deletion.

### Item 67: replies

A self-relation on `Message`, not a copy of the quoted text. A copy goes stale the moment the
original is edited and keeps showing words its author has since retracted — the two cases a quote
most needs to be honest about. The quote is resolved on every read, so an edited parent re-quotes
with its new text and a deleted one quotes as a tombstone.

The security half is a rule no foreign key can express: **the parent must be in the same
conversation.** A foreign key cannot say "and the same `conversationId`", so `sendMessage` checks it
inside the same transaction that writes the message, scoped by conversation rather than fetched and
compared — a miss is a miss whether the message is in another conversation or in none, which is also
what stops the check from confirming that an id exists somewhere the sender cannot see.

Visually the quote is a rule and two lines of type — no nested card, no fill, no second radius. It is
clamped to one line on purpose: it is a pointer, not a quotation, and three lines of somebody else's
message above a two-word answer inverts which of the two you are meant to read. An image reply adds a
small signed thumbnail in both the bubble quote and the composer, so "replying to a photo" remains
identifiable before and after the answer is sent.

### Item 68: quiet intervals and mobile navigation

The desktop shell keeps the conversation list and thread side by side. Below the medium breakpoint,
the same state becomes a two-screen flow: the list fills the viewport, choosing a conversation opens
the thread, and a labelled Back action returns to the list. Message meta moves below the bubble at
that width instead of permanently buying a horizontal gutter, and the thread has no horizontal
overflow at a 390px viewport.

## Phase 18 — Staying truthful when the connection is not — `done`

Three of these were found by reading the client against the network rather than against the tests,
and none of them is a feature: each is a way the UI silently stops telling the truth.

| # | Item | Status |
| --- | --- | --- |
| 69 | Resync after a socket reconnect | Done |
| 70 | Centralised 401 handling — a dead session says so and signs out | Done |
| 71 | A failed message load shows an error and a retry, not an empty thread | Done |
| 72 | A connection banner, so silence has a stated reason | Done |

### A reconnect has to fetch, not just de-duplicate

`use-conversation-messages` already guarded against a reconnect *replaying* an event that was on
screen. Nothing did the opposite and more important half: fetch what arrived while the socket was
down. A laptop waking from sleep re-joined its rooms and then sat there, rendering a sidebar and a
thread that were both quietly out of date until somebody reloaded.

`useSocketConnection` fires its callback on a *re*connection only — the first connect happens
alongside the fetches that populate the screen, and resyncing then would just repeat them.

**The resync refetches a page rather than everything after the newest message held**, and that is the
part worth keeping. A dead socket does not only miss new messages: an edit, a delete or a reaction
that landed while it was down changed a message that is still on screen, and no amount of appending
repairs that. `mergeReloadedMessages` lets the reloaded copy win for every id it carries and keeps
what it does not.

**When the two no longer overlap it replaces everything.** If the disconnection outlasted a whole
page, stitching the newest page onto the loaded history renders a thread with a hole in it and
nothing saying so. Dropping the history is the same state as opening the conversation now, which is
honest, and paging back up is how the rest is reached.

The resync is **skipped while `hasMoreNewer` is true**: that state means the reader jumped to a
search result and is looking at a window in the middle of the history, and pulling them to the live
end would throw away the thing they went to find.

### A 401 means two different things

The access token lives for seven days and nothing handled its expiry. Every request failed on its
own, the socket would not open, and the tab kept rendering a chat that nothing could be sent from —
with no route back to the login screen.

The distinction the fix rests on: a 401 answering `/auth/login`, `/auth/password`, `/auth/email` or
`DELETE /users/me` is about **the password in the body** and belongs to the form that asked.
Anywhere else it can only mean the token is dead. Exact paths, not prefixes — `/users/me/avatar` and
`/auth/password-reset` carry no password to be wrong about, and a prefix match would have silently
stopped signing people out on the two routes most likely to meet an expired token.

`setSessionExpiredHandler` is wired in `app.tsx` rather than at import time in the store. The store
imports the api client, so the reverse direction would be a cycle — and a module-level side effect
also made three unrelated test files fail for want of a stub they had no reason to care about.

**The notice needed a third attempt, and only running the app found it.** The reason is read from
`sessionStorage`, and the first version read *and cleared* in one call, from a `useState` lazy
initialiser — with a comment claiming the lazy initialiser was what made it safe under StrictMode.
It is the opposite: React double-invokes that initialiser in development, so the first call consumed
the flag and the second, whose result React keeps, returned false. Every unit test passed, because
none of them renders under StrictMode. The read is now pure and the flag is cleared by
`storeSession` — signing in again is exactly when "your session ended" stops being true, and a read
that changes nothing cannot be double-invoked into the wrong answer.

### The two silent states

A failed first page rendered an **empty thread**, which is indistinguishable from a conversation
nobody has written in and offered nothing to try again with. It now shows the server's own message —
"Network request failed" and "You are no longer in this conversation" ask the reader to do different
things — and a retry that re-runs the same load.

The connection banner is delayed by two seconds rather than following `socket.connected` exactly.
The socket is legitimately disconnected for the moment before its first handshake, and a banner that
flashes on every page load is one people learn to ignore before the day it means something.

## Phase 19 — What a messenger feels like — `done`

The perceived-quality gap against Telegram/Messenger, in order of how often a user hits each.

| # | Item | Status |
| --- | --- | --- |
| 73 | Optimistic send — a pending bubble immediately, a failed state with retry | Done |
| 74 | Unread count in the tab title, browser notifications behind a settings toggle | Done |
| 75 | Confirmation dialogs for a kick and a leave | Done |
| 76 | Virtualise the message list once histories get long | Done in phase 29 — see the note below, then that phase |

### Item 73: the message is on screen before the server has it

The composer used to await the round trip and render from the broadcast that followed, on the stated
grounds that the sender should see their message through the same code path as everyone else. That
is still true of *how* it renders; what it cost was the half-second between pressing Enter and seeing
anything, on every message, which is the single most-felt piece of latency in a chat app.

**The reconciliation needs no correlation id, and that is the part worth keeping.** The obvious
problem with an optimistic bubble is the duplicate: the server emits `message:new` before it
serialises the HTTP response, so the real message usually lands *first*, and replacing the draft by
id afterwards would show it twice. The fix is one line — when the send resolves, drop the draft and
append the server's message **only if it is not already there**. Both orders come out right, with no
client id echoed through the wire types and no matching on content.

**Text only.** A send carrying an image keeps the awaited path and its progress bar, because an
optimistic image bubble has to state the picture's dimensions to reserve its space and the client
does not know them until it has decoded the file. A bubble that resizes when the upload finishes is
worse than the progress bar that is already there and says more.

**A failed send stays on screen.** It keeps its text, is marked "Not sent" in the app's one colour,
and offers Try again and Discard. The alternative — the bubble vanishing — takes the words with it,
and the sender usually does not notice until much later.

Two things a draft must never be mistaken for a stored message, both found by asking what takes an
id back to the server: the **read marker** and the **newer-page cursor**. `getNewestStoredMessage`
exists for exactly those two call sites; without it, marking a conversation read would post an id the
server can only refuse.

### Item 74: the tab that is not being looked at

The count goes in **front** of the app name — `(3) Chatty` — because a tab strip truncates from the
right, so `Chatty (3)` loses the only part worth showing the moment more than three tabs are open.
It is summed from the same `unreadCount` the sidebar badges render, so the title and the badges
under it cannot disagree.

**The notification setting is per-browser and says so.** Permission is granted by one browser on one
machine, so it lives in `localStorage` rather than on the account: a preference synced to the account
would leave the phone saying notifications are on while its browser had never been asked. The store
keeps the *preference* and the *permission* as two facts, because either can be revoked without the
other, and a single boolean would let the UI claim notifications are on for a browser that has
quietly turned them off.

### Item 75: two dialogs, not three

Removing somebody from a group and leaving one had no confirmation at all, and both are irreversible
from the person doing them. `components/confirm-dialog` is the shared primitive, built on the
`use-dialog` phase 16 introduced — which is what makes the old reason for deferring this ("nothing
else in the app has one") no longer true.

**Delete-for-everyone deliberately did not get one.** It turned out already to have a two-step
confirmation inside the actions menu, and a modal on top of that would be asking three times. The
rule that came out of it: confirm an irreversible action once, wherever the action already lives.

**The e2e suite caught what the unit tests could not.** Every component test of the panel was updated
alongside the dialog and passed; `group.spec.ts` then failed, because a spec that clicks "Leave
group" and waits for the system message had no idea the flow had gained a step. That is the same
lesson phase 5 recorded when Playwright found the dropped attachment: a unit test asserts what the
component was asked to do, and only a browser notices that a *flow* now takes one more click.

### What the browser proves about item 73

Two specs in `e2e/sending.spec.ts`, and both make assertions nothing below a browser can. The send is
held open with a route handler so "before the server answers" is a state the test can stand in rather
than a race it hopes to win: the message is in the thread and the composer is already empty. The
failure path aborts the first POST and lets the retry through, then asserts the message appears on
the recipient's screen **exactly once** — which is the check that would catch the duplicate the whole
draft-dropping design exists to avoid.

### Item 76, and why it stayed `planned` until phase 29

Not deferred for effort. Messages accumulate only through explicit paging, 50 at a time, so reaching
a DOM large enough to matter takes forty deliberate scroll-ups — the problem is real in principle and
has not been demonstrated here. Against that, the two cheap versions both carry a specific risk to
work that is already correct:

- **`content-visibility: auto`** interacts with scroll anchoring, and `useMessageScroll` carefully
  preserves position when a page of older messages is prepended. Trading a demonstrated behaviour for
  an undemonstrated saving is the wrong way round.
- **Windowing** needs row heights, and the phase 17 cluster grammar makes them depend on the
  neighbours: a reaction row, a reply quote, a day rule and an image all change a row's height, and
  three of those depend on the message before it.

The honest version of this item is a measurement first. Recorded here rather than half-shipped.

**Phase 29 closed it, and both objections above survived intact** — which is why the answer is
neither of the two things this note refused. Windowing was not adopted and `content-visibility` was
not adopted; the array is bounded instead. See phase 29, item 94.

## Phase 20 — Vietnamese-first search — `done`

| # | Item | Status |
| --- | --- | --- |
| 77 | Accent-insensitive search: `hen gap` finds `hẹn gặp` | Done |

### A deferral that expired rather than being overturned

Phase 12 wrote this fix out in full, in the migration, and did not take it on because it "needs an
extension the host must allow" and the host was not chosen. Re-examined: `unaccent` is a contrib
module that ships **inside the official postgres image these compose files already run**, and is on
the allow-list of every managed Postgres this app could plausibly be deployed to. The host decides
nothing here. What it costs is one line in the deployment checklist, which is now in
[DEPLOYMENT.md](DEPLOYMENT.md) rather than discovered at the first search.

It matters more than the English stemming this app deliberately does not do. Vietnamese is written
with diacritics and typed without them constantly, so a search that could not cross that gap failed
the people most likely to use it, on most of what they looked for.

### The IMMUTABLE claim, and what makes it true

A generated column may only call IMMUTABLE functions and `unaccent` is declared STABLE — because its
one-argument form resolves its dictionary through `search_path` and could answer differently in two
sessions. The wrapper uses the **two-argument form**, which names the dictionary outright and removes
exactly that freedom. What is left is a promise that the dictionary's *contents* never change; if
that file is ever edited, the stored vectors are stale and the column has to be rebuilt the way this
migration rebuilds it.

**Both sides or neither.** The stored vector and the search term go through the same function.
Unaccenting only the column would have made `hẹn` fail to find its own message — a worse bug than the
one being fixed — and there is a test for that direction as well as the one everybody thinks of.

The column is dropped and recreated rather than altered, because PostgreSQL cannot change the
expression behind a generated column in place. That rewrites the table and rebuilds the GIN index,
which is the real cost of the migration and the reason to do it once rather than reach for a trigger.

**What it merges, stated rather than discovered:** unaccenting collapses words Vietnamese treats as
different — "ma", "má", "mà" and "mã" all become "ma", so any of them finds all of them. That trade
is the right way round for a chat search: a few extra lines is useful, nothing at all is not. A test
pins it so it is a decision rather than a surprise.

## Phase 21 — Sessions, scale, and the host-shaped holes — `done` (what code can close)

| # | Item | Status |
| --- | --- | --- |
| 79 | Refresh tokens: short-lived access, revocable sessions, a logout that means it | Done |
| 80 | Conversation list pagination | **Done in phase 33** — see below for why it stayed open for twelve phases |
| 81 | Object storage for uploads | `planned` only at the scale boundary — local shared storage is the chosen single-host design; ADRs 0004/0007 isolate the later swap |
| 82 | Mail provider, verified domain, SPF/DKIM/DMARC | `blocked` — requires the planned domain purchase, a free Resend account, DNS verification and SMTP credentials |
| 83 | Error tracking / observability provider | `dropped` — a paid/external provider is not a prerequisite; replaced by provider-free metrics in item 126 |

### Item 79: sign out used to be a lie

The session **was** a seven-day JWT in `localStorage`. A JWT cannot be taken back — it is valid
because it says so — which meant "sign out" cleared this browser's copy and left every other copy
working for the rest of the week, and a password change could only refuse tokens by `iat`.

Splitting the two fixes it without giving up stateless verification on the hot path. The access token
stays a JWT and drops to **fifteen minutes**, so a copied one is worth minutes rather than a week;
the session is a `RefreshToken` row, and `revokedAt` can end it.

**Thirty days is not a relaxation of seven.** The seven days belonged to a token nothing could
revoke. Trading an unrevocable week for a revocable month is a straight improvement, and the row is
what makes the difference.

**Rotation, claimed conditionally.** A refresh spends the token it was given and issues a
replacement, in one transaction, with the claim written as a conditional `updateMany` rather than a
read-then-write — the same shape phase 7 gave the password reset. Two tabs waking together would
otherwise both pass the read and leave one session that had quietly become two. Rotation is also the
whole mitigation for a refresh token read out of storage: it works once, and the real client's next
refresh finds it spent.

**A spent token answers the same as an imaginary one.** Telling a caller that their token was real
but already used tells somebody holding a stolen copy that it was worth having and that they were
beaten to it.

Both `/auth/refresh` and `/auth/logout` are **unauthenticated**, which is the point rather than an
oversight: a client calls them precisely because its access token has expired, so requiring one would
make them useless at the only moment they matter. The refresh token is the credential, and it is
checked against a row — originally sent as a body field, moved to an `HttpOnly` cookie in phase 38,
item 118.

Revocation is wired to everything that should end a session, each inside the transaction that makes
the change: a password change, a password reset (a reset exists for "somebody else has my account",
which is worth nothing if the sessions they opened survive it), and an account deletion, which
cascades.

#### The two client-side traps

- **Single-flight the refresh.** An expired access token 401s every request the screen has in flight
  at once. Without single-flighting, five parallel refreshes mean one success and four "invalid
  session" errors — and the client signs itself out at the exact moment it has just successfully
  renewed.
- **The socket's `auth` must be a callback.** socket.io reads the object form once, when the socket
  is created, and would then reconnect forever with the token it captured — guaranteed to be stale
  after the first renewal. It also asks for a renewal itself on `connect_error`: a tab left open
  overnight has no HTTP request for the refresh to piggyback on.

### Item 80, and why it stayed open

The server's conversation list is unbounded, which is a real thing to fix. Pagination alone did not
fix it, because of how the client used it: `ChatPage` re-listed the whole sidebar on **every incoming
message**, which is what kept ordering, previews and unread counts true. Add a cursor underneath that
and every message resets the sidebar to page one, discarding whatever the reader had scrolled to.

**That blocker is gone.** Phase 27 replaced "re-list everything on every change" with incremental
patching: `useConversationList` now owns eight socket handlers that each patch the row that changed,
and `refresh()` is called on mount, on the archived toggle, and in one fallback branch — not on every
message. The redesign this item was waiting for has happened.

What was left was the query itself, and phase 33 closed it.

## Phase 22 — a message can carry a gallery, and emoji are first-class — `done`

Asked for directly: "chưa cho phép gửi nhiều ảnh cùng lúc nhỉ, không có bộ sticker hay emoji của tele
xịn xò nữa". Two of the three shipped; the third was a decision, not a deferral.

| # | Item | Status |
| --- | --- | --- |
| 84 | Several images on one message | Done |
| 85 | An emoji picker in the composer | Done |
| 86 | A message that is only emoji is drawn large and bare | Done |
| 87 | Stickers | Done in phase 23 — the source question had an answer |

### Item 84: the unique that phase 4 said would come off

Phase 4 wrote the one-image limit down as deliberate and reversible: "Dropping the unique later
relaxes this without moving any data; going the other way would not." This is that drop, and it was
indeed data-free — every existing row became the first image of its message.

**The order is a stored column, not `createdAt`.** A message's images are written inside one
transaction and share a timestamp to the millisecond, so ordering by time would let a gallery shuffle
itself between two reads of the same message. The unique moved to `(messageId, position)` rather than
being dropped outright: two images claiming slot 0 is an ordering the database should refuse, not one
the reader discovers.

**`MessageDTO.attachment` became `attachments`, and empty rather than null.** A caller that maps over
it needs no branch, which is what stops "no images" and "one image" being two shapes every renderer
has to tell apart.

**The re-encodes run in sequence, not `Promise.all`.** Each decodes and re-encodes a full-size image;
ten sharp pipelines at once compete for the same cores and spike memory for no wall-clock gain.

**The multipart field stayed singular.** Multipart carries a list by repeating one field name, so
`attachment` appears once per file — renaming it would have broken every client to describe the same
bytes.

Two things the gallery decides rather than inherits. **One picture keeps its true proportions**, with
`width`/`height` on the element so the box is reserved before the bytes arrive; **several become
squares**, because a row of mixed portrait and landscape thumbnails shares no edge for the eye to
follow and the bubble's geometry stops meaning anything. The grid caps at four tiles and the fourth
counts the rest — the lightbox holds the whole set, so the "+6" is never a count of pictures nobody
can open.

### Items 85 and 86: emoji, without spending the colour budget

The request named Telegram, and Telegram's emoji story is three things: a picker, emoji reactions,
and stickers. Only the first was taken as-is.

**The picker is hand-built.** Every emoji picker on npm arrives with its own stylesheet, which means
its own look, in an app whose entire premise is one declared look. The chrome here is the app's —
hairline rules, ink on paper, mono for machine-produced labels — and only the emoji are colour,
because they are the content. The data is a curated ~250 rather than the full ~1,900: the rest is a
megabyte of table nobody scrolls past the first screen of.

Keywords carry unaccented Vietnamese alongside English — `cuoi` finds 😂, `tim` finds ❤️ — on the
same reasoning phase 20's search rests on: unaccented is what actually gets typed.

**Reactions deliberately stayed the closed set of five ink marks**, reversing nothing — until phase 29
reversed exactly this, for a reason this paragraph could not see: the argument was never actually
implemented. The chips had rendered colour emoji since phase 17 while only the picker stayed in ink,
so the app was already paying the full-colour cost and getting none of the consistency it was paying
for. The phase 17
argument still holds and is still the right one: a full-colour glyph sitting *permanently* beside a
bubble is the loudest thing on a page that spends its one colour on unread counts and things you
cannot undo. A picker is transient and dismissed; a reaction is furniture. The Unicode half of that
argument is unchanged too — ❤ and ❤️ are two strings and one heart, which is what makes a free-text
reaction column undecidable.

**What was added instead is item 86**, which gives emoji the prominence the request was really about
without putting colour anywhere the design did not intend: a message that is nothing but one to three
emoji is drawn large, with no fill, no border and no radius. There is nothing for a bubble to
contain.

The counting is `\p{Extended_Pictographic}` with the joiners around it rather than a hand-written
range, because an emoji is regularly several code points — a flag is two regional indicators, 🧑‍💻 is
two people and a joiner, ❤️ is a heart plus a variation selector. Counting code points would call one
flag two emoji and refuse to enlarge a message of three.

### Item 87: why stickers are not here

Not effort — a source. A sticker set means artwork, and the two honest options were a built-in pack
drawn in this app's ink style (which is not what "Telegram stickers" means to anybody) or
user-uploaded packs (which is the attachment pipeline plus a per-account library). Asked, and the
answer was to do emoji and images first. Recorded so the next person knows it is waiting on a
decision.

## Phase 23 — a stacked album and stickers — `done`

Both asked for directly, and the first is a correction of something phase 22 had only just shipped.

| # | Item | Status |
| --- | --- | --- |
| 88 | Several images render as a compact stacked album | Done |
| 89 | Stickers: a personal tray, one tap to send | Done |
| 90 | Pictures lose the bubble around them | Done |

### Item 90: a photograph is not a quotation

An image message sat in the same bubble a sentence does, with 5px of padding — which on an outgoing
message meant a **dark frame around every photograph somebody sent**. The verdict was that it felt
unnatural, and it is: a photograph is already a rectangle of somebody else's content, and a fill
around it is a second frame the picture never asked for. Worse, it was the ink fill — the one that
carries "ink on paper" everywhere else in the app — used as a mount.

Pictures now render bare, on the paper, the same call stickers and emoji-only messages already made:
the picture *is* the message. A caption stays out of the thread entirely; opening the picture presents
the complete text over the top of the full-resolution image, rather than turning it into a second
message below it.

### Item 88: the album should stay an album

Several images remain a compact fanned stack rather than a contact sheet: a conversation needs to
stay readable, and the full set belongs in the viewer. The cards behind the cover are real upcoming
images, while the count states exactly how many the set contains.

The improvement is not to replace that gallery. Its cover remains only a picture; the complete
accompanying text appears only in the viewer, at the top of the selected image. A photo set still reads
quickly in the thread; opening it now feels like opening the message rather than only opening a file.

A single picture keeps its true proportions and its `width`/`height` attributes, so loading media
never moves the conversation below it.

### Item 89: the sticker source question had an answer

Phase 22 recorded stickers as blocked on artwork: either a built-in pack drawn in this app's ink
style, which is not what anybody means by "stickers", or something else. The something else is the
answer — **a sticker is an image you saved to send again**. The artwork is the user's, there is
nothing to license, and it reuses the image pipeline the gallery had just put in place.

**A sticker is copied into a fresh attachment when it is sent, never referenced.** Referencing would
tie every message it was ever sent in to one row, so removing a sticker from the tray would blank
pictures out of other people's conversations — the same failure that made a message delete a
tombstone in phase 8. A test sends one, removes it from the tray, and asserts the message's file is
still there.

**`Sticker` is its own table rather than a flag on `Attachment`**, because the two have different
lifetimes: an attachment dies with its message, a sticker outlives every message it was sent in.

**`Message.isSticker` is a column rather than something inferred** from "one image and no text" —
that shape is also a photograph sent without a caption, and the two render nothing alike. A sticker
is drawn bare at a fixed 128px, on the same reasoning as phase 22's emoji-only messages: the picture
*is* the message, and a bubble around it is chrome around content that needs no explaining. Fixed
rather than its own size, because a tray holds whatever people put in it and letting each size itself
would make every sticker a different height in the thread.

**A sticker is refused alongside text or files.** Letting them compose would mean deciding how a
bare, oversized image sits next to a bubble, and there is no answer to that worth having.

Serving reuses the attachment *scheme* exactly — same re-encode, same signed expiring token, same 404
for a bad one. `<img>` cannot send an Authorization header, which is the whole reason that scheme
exists (ADR 0007).

**And it shipped pointing at the wrong route.** The DTO built its URL with `buildAttachmentUrl`,
which produces `/attachments/:id` — a path that looks the id up in a table stickers are not in, so
every thumbnail in the tray was a 404 and a broken image. The unit test asserted the URL carried a
token and never asserted its *path*, which is precisely the gap. Found by opening the app;
`buildStickerUrl` now exists as its own function and the test checks the pathname.

## Phases 24-28 — `done`

Asked for directly, after phase 23: there is no way to *see* what a conversation has accumulated, no
way to send anything that is not a picture, no voice, and a list of small things every other messenger
has. Each phase below is specified in full under **[docs/plans/](plans/README.md)** — schema, wire
types, the decisions and what they cost — so the argument happens before the migration rather than
halfway through it.

| Phase | Item | Status |
| --- | --- | --- |
| 24 | [An attachment that is not a picture](plans/phase-24-any-file-attachments.md) — kind, media type, filename, a download that cannot execute (ADR 0013) | `done` |
| 25 | [Voice messages](plans/phase-25-voice-messages.md) — recorded anywhere, playable everywhere (ADR 0014) | `done` |
| 26 | [The vault](plans/phase-26-conversation-vault.md) — media, files, voice, links and saved messages of one conversation, plus thumbnails | `done` |
| 27 | [A sidebar you can organise](plans/phase-27-sidebar-organisation.md) — archive, pin, mute, and the incremental list item 80 has been waiting for | `done` |
| 28 | [The small ones](plans/phase-28-small-things.md) — eleven items, two of them closing Known gaps above | `done` |

Order matters for 24 → 25 → 26 only; 27 touches no attachment code and 28's items are independent of
everything, including each other.

The delivered shape follows the plans: one ordinary file per message, voice normalized to AAC/MP4,
a cursor-paged vault backed by the denormalized attachment index, per-participant sidebar state sent
only to personal socket rooms, and incremental row patches rather than a full list request on every
message. Phase 28 adds local device drafts, unread-position controls, drag/paste, safe linkification,
forwarding by copy, durable mentions, three message pins, reply context jumps, one keyboard map,
sidebar typing and group reader avatars.

**Two decisions in there are worth knowing about before reading the rest**, because they reverse
assumptions this file has repeated since phase 4:

- **The re-encode stops being the security control for every upload.** It cannot be one for a PDF. It
  is replaced by a set of rules about the *response* — a sniffed media type, an interpretable type
  stored as `application/octet-stream`, `Content-Disposition: attachment`, and a sandbox CSP — so that
  nothing uploaded here can execute in a browser on this origin. Audio keeps a re-encode (it has to
  transcode anyway) and is the only new kind allowed to be served inline. ADR 0013.
- **`Attachment` gains a denormalised `conversationId`**, which this schema otherwise refuses to do.
  The vault's query is "one kind, one conversation, newest first" and the column turns it into a single
  index scan; the fact it duplicates never changes, because a message never moves conversation.

## Phase 29 — a reaction people recognise, and a sheet that turns off — `done`

Five items. Four of them come out of the same observation: the app was correct and looked slightly
homemade next to the three messengers it is measured against, and in every case the gap was a
decision that had been made once and never re-examined against what the code actually did.

| # | Item | Status |
| --- | --- | --- |
| 91 | Reactions: an open emoji set, one per person, chips that straddle the bubble | Done |
| 92 | The reactor list — who reacted, and with what | Done |
| 93 | Light / Dark / System, resolved before the first paint | Done |
| 94 | Bound the retained thread, closing item 76 | Done |
| 95 | Optimistic image send, closing a Known gap | Done |

### Item 91: the reactions were arguing with themselves

The closed set of five was defended twice in this file, in phase 17 and again in phase 22, on the
grounds that a full-colour glyph parked permanently beside a bubble is the loudest thing on a page
that spends its one colour very deliberately. That is a good argument and the app was not making it.
`REACTION_OPTIONS` carried both a lucide icon *and* an emoji glyph: the picker drew the icon, the
chip drew the emoji, and the gutter's quick action drew a third version in `text-signal`. So the page
was already paying the full-colour cost, on the surface that is permanent, while the ink discipline
survived only on the surface that is transient and dismissed — precisely backwards from the stated
rule. One reaction, three appearances, and nothing you clicked looked like what you got.

Given that, the closed set was buying nothing, and it was costing the thing every messenger has: the
emoji you actually wanted. It is open now.

**What replaced the enum is a regex, not nothing.** The Unicode half of the old argument was always
the sound half — `❤` and `❤️` are two strings and one heart, and a free column makes "the same
reaction" undecidable. `toggleReactionSchema` admits `^\p{RGI_Emoji}$` under the `v` flag, which
matches exactly one emoji in its fully-qualified spelling: `👍🏽` and `🏳️‍🌈` pass, `❤` is a 400, `👍👍`
is a 400, and one spelling of each reaction reaches the column. It is built with `new RegExp` because
the `v` flag needs an ES2024 target and `tsconfig.base.json` sets ES2022 for both apps; Node 22 has
supported it since 20, so bumping the shared target to accommodate one regex would change the web
bundle's emit for nothing.

**One reaction per person**, which is the rule Messenger, Instagram and Telegram all implement and
the one the old key did not. `(messageId, userId)` is now the whole primary key, so picking a second
emoji is an `UPDATE`; the database enforces it rather than the service. With an open set this stops
being a preference and starts being necessary — the old key let one person put forty distinct chips
under one sentence.

Three things about how they are drawn, each of which was measured against the same three apps:

- **The chips straddle the bubble's bottom edge.** They used to hang 18px clear of it, which reads as
  something that fell off the message rather than a sticker put on it. `top-full` with
  `-translate-y-1/2` makes the overlap exactly half at any chip size, and the row reserves only the
  half that hangs.
- **`ring-2 ring-paper` on every chip.** With a slight overlap between them, the ring cuts a
  page-coloured gap out of the chip behind so two chips read as two objects; against the bubble's own
  fill the same ring reads as the halo these have in Messenger. The previous `border-rule-soft` was
  too faint to separate anything and overlapping chips fused into one blur.
- **Three chips, then `+N`.** An open set has no ceiling on how many distinct emoji a group produces
  and the bubble has one. The overflow chip opens the reactor list rather than toggling anything.

The quick bar is six emoji and a `+`, floating over the message on hover — the distribution, not a
compromise: reactions have a very short head, so six covers nearly everything at one click and the
full picker covers the rest at two. It replaced a row of five line icons buried at the top of the
overflow menu, which cost two clicks for the most frequent action in the feature. `+` swaps in the
composer's own `EmojiPicker` rather than opening a second one, so there is one search field and one
recent list, and an emoji used in a message is one click away as a reaction. A double-click on a
bubble leaves ❤️ with no menu at all, and drops the word selection the double-click just made.

### Item 92: the answer was in a `title` attribute

Who reacted was a native tooltip, which means it was a hover away on a desktop and **unreachable on
every touch screen** — on the device most reactions are left from, the app could tell you eleven
people had reacted and offer no way at all to find out who. `ReactionDetailsPanel` is tabbed by emoji
with an "All" tab in front, because in a group the interesting question is usually "who disagreed"
and that should be one tap rather than a scan down a mixed list. The tabs sort by count; the chips
under the bubble deliberately do not, because nobody is aiming at a tab strip and everybody is aiming
at a chip.

The tooltip stays. It is still the cheapest possible answer when there is one name in it.

A reactor who has since left the group is counted but not listed: the id is real, the person is not
in `participants`, and inventing a row for them would be the client making up a name. The count comes
from the DTO, so the number and the list can disagree — and when they do, the difference is the truth.

### Item 93: the theme is resolved before the first paint, not after it

The palette was already the whole of the work. `scripts/audit-rules.sh` section 29 has kept every
colour in this app going through a token since phase 16, so a grep of `apps/web/src` finds zero
numbered swatches and dark mode is a second definition of the same names rather than a sweep through
fifty files. What it was not was free, and four things had to be pulled out of `ink`/`paper` first:

- **`block` / `block-ink`** — the app's one solid fill, on a message you sent and a group's avatar.
  `bg-ink text-paper` inverts *together*, so a dark theme would have answered with a white slab
  covering half the thread: the loudest possible object on a dark screen, and the opposite of what
  every messenger does with the message you just sent. Dark steps up off the sheet (0.335) rather
  than inverting against it, so page, received bubble and sent bubble stay in order. A `primary`
  Button still uses ink/paper directly and should — a call to action is allowed to be the brightest
  thing in the room; a bubble you will send forty of is not.
- **`scrim`** — behind a dialog and behind the lightbox. It goes *blacker* in dark rather than
  lighter, because a 0.235 charcoal at 30% over a 0.185 page darkens nothing at all.
- **`on-media`** — the lightbox controls and the album's image count. The one token that is the same
  in both themes, because what it sits on is a stranger's photograph.
- **The avatar tints invert as pairs**, rather than dimming. A pale ground carried into dark mode is
  eight bright discs down the one surface in the app meant to be scanned rather than looked at.

`ink-faint` also sits two steps lighter in dark than the light theme's value: the `meta` utility sets
10.5px, small text needs 4.5:1 in both directions, and the curve is not symmetric — the value that
clears it on white does not clear it on near-black.

**The bootstrap is a file, not an inline script, and that is a CSP decision.** `nginx.conf.template`
sets `script-src 'self'` with no `'unsafe-inline'`, and the comment above that policy is explicit
that adding it would make the rest of the policy decorative. `public/theme.js` is served from this
origin, blocks in the `<head>`, and stamps the *resolved* theme on `<html>` before the body paints —
without which every dark-theme reader gets a white flash on every navigation. Resolving in JS rather
than in CSS is also why `globals.css` needs a single `[data-theme="dark"]` block instead of that
block plus a `prefers-color-scheme` copy of it kept in sync by hand: a palette written twice is a
palette that drifts, and the drift shows up as one wrong grey six months later.

The preference is `localStorage`, not the account, on the same reasoning as the notification toggle:
a laptop at a desk and a phone at night are not asking for the same answer. The OS moving at dusk
moves the app with it, but only for somebody who chose System — a decision the operating system can
overrule is not one.

### Item 94: bounding the array, which is what item 76 was actually about

Both objections in the phase 19 note are still correct, so neither of the things it refused was
adopted. `content-visibility: auto` is worse than that note knew: it applies paint containment while
the element is *visible* too, so the reaction chips that straddle a bubble and every popover anchored
`bottom-full` inside a row would be clipped to that row. Windowing still needs heights the cluster
grammar makes depend on neighbours.

What actually grows without bound is the array React reconciles, and windowing does not shrink it —
it only stops drawing part of it, at the price of rewriting scroll anchoring, jump-to-message and the
unread divider, all three of which currently work and are tested. So the array is bounded instead:
past `MAX_RETAINED_MESSAGES` (four pages) the thread drops its oldest page and sets `hasMoreOlder`
back to true, which hands re-fetching to the path that fetched it the first time. It is the exact
inverse of `loadOlder` and needs no machinery of its own.

It only ever happens under three conditions, and each one is a way the reader would otherwise notice:
they are sitting at the bottom, they are not looking at a jumped-to message, and there is nothing
newer left to load. The second and third are the same situation from either side — a search result
opens the thread around an old message with newer ones unloaded, so "scrolled to the bottom" does not
mean "at the latest".

One trap, and it is the reason `useMessageScroll` now carries a length in its snapshot: a trim looks
exactly like a prepend. Both change the first id and leave the last id alone. The prepend correction
adds the height difference to `scrollTop`, and on a trim that difference is *negative* — it would
throw a reader sitting at the bottom of a thread to the top of it.

### Item 95: the picture goes up before the upload does

The Known gap this closes recorded the right objection: an optimistic gallery has to reserve each
picture's space, and a gallery that resizes when the upload lands is worse than the progress bar it
replaced. The objection was about *dimensions*, not about uploads. `toDraftAttachments` decodes the
picked files first — the browser already has the bytes and it costs milliseconds — so the bubble goes
up at the size the stored one will be and nothing moves when the real message arrives. A file that
will not decode still gets a bubble, with null dimensions, which is the same thing the server stores
for a picture it could not measure and the gallery has always handled.

The composer now empties on a picture send exactly as it does on text, and the progress bar goes with
it. That is the trade, and it is the one Instagram makes: what replaces the bar is the picture
itself, held at 60% until the server has it, and a gutter that says "Sending…" and then "Not sent"
with a retry beside it. The retry works on an image because `pendingUploadsRef` keys the `File`s by
draft id and the id survives the failure — a `ThreadMessage` has no room for a `File` and should not
have one. Every exit from a send releases the `blob:` URLs, including the unmount, because a URL that
is never revoked pins its file in memory for the life of the tab.

### What the browser proves about this phase

Four new specs, and each one asserts something no unit test in this repo can reach:

- **The chip's geometry, measured.** `reactions-and-replies.spec.ts` reads the bounding boxes of the
  text and the chip and asserts the chip straddles the bubble's bottom edge without reaching the
  type. The old spec asserted the chip sat entirely below the text box, which is what made it fail
  when the overlap was introduced — the assertion was stricter than the apps it was modelled on, and
  loosening it to the padding is the change, not the design.
- **One reaction per person, over the socket.** Bob presses ❤️ then 😂 and Alice — who did nothing —
  ends up with exactly one chip. The rule lives in a primary key; only a browser can show the UI and
  the key agree.
- **The reactor list names somebody who is not the reader.** Alice opens it from her own side, so
  what it shows arrived over the socket rather than out of the click that made it.
- **The theme survives a reload.** `appearance.spec.ts` is mostly about `public/theme.js`: a store
  with three functions would unit-test green with the stylesheet missing, the attribute misspelled,
  or that file 404ing — and that file is the entire reason a dark reader does not get a white flash.
  The second spec sets the OS to dark, picks Light, reloads, and asserts Light held.

### What this phase did not do

- **The unread badge is still `text-paper` on `bg-signal`,** which is about 3.4:1 at 10px in the
  light theme — under the 4.5:1 small text needs. It happens to be *better* in dark, where the
  brighter signal takes dark text. Left alone because fixing it changes what the badge looks like,
  which is a design decision rather than a bug fix, and it predates this phase.
- **`MAX_RETAINED_MESSAGES` is not tuned against a measurement.** Four pages is reasoned rather than
  measured — enough that scrolling up does not immediately re-fetch what was dropped. The phase 19
  note asked for a measurement first and this is still not one; what changed is that the cost is now
  bounded either way.

## Phase 30 — two things that were only ever correct by accident — `done`

Not asked for: found by checking whether the previous twenty-nine phases were actually finished. Both
items had passed every run of `verify` and both were real.

| # | Item | Status |
| --- | --- | --- |
| 96 | Every timestamp column becomes `timestamptz` | Done |
| 97 | The sender stops briefly seeing its own message twice | Done |
| 98 | A guard on the search index Prisma keeps trying to drop | Done |

### Item 96: the database was keeping two kinds of time in one column

Found by accident, which is the part worth recording. A contributor setup on a machine without Docker
ran Postgres directly, and `initdb` took the timezone from the machine — `Asia/Ho_Chi_Minh`. Four
server tests failed immediately. The same suite is green on every CI run and on every developer's
machine, because `docker-compose.yml` pins no timezone and the `postgres` image defaults to UTC.

The columns were naive `timestamp`, and two writers disagreed about what they meant: the database
clock wrote local time, Prisma wrote UTC. Under UTC those are the same value, so nothing ever showed.
Under any other zone the outbox read a five-minute backoff as seven hours overdue and stopped backing
off at all, and the keyset pagination in search and in the vault handed out the cursor row twice.

[ADR 0015](adr/0015-timestamps-are-instants.md) has the full argument, including why pinning the
session timezone was rejected in favour of changing the column type. The regression test asserts the
*type* rather than any query's behaviour — `information_schema` must report no
`timestamp without time zone` column — because that is what catches the next `DateTime` field added
without `@db.Timestamptz(3)`, which is how this would come back.

**The proof is the environment, not the assertion.** The suite now passes with the database running
in `Asia/Ho_Chi_Minh`, which is the configuration that produced the four failures.

### Item 97: the broadcast and the response were racing

Phase 19 gave the sender an optimistic copy of its own message; the server has broadcast
`message:new` to the whole room including the sender since long before that. Nothing tied the two
together: the socket handler de-duplicated on the server's `id`, the draft was drawn under a
client-generated one, and only the HTTP response knew they were the same message. Whenever the
broadcast beat the response — they leave the server together, so it is a coin toss — the thread held
both copies until the response arrived.

The fix is a `clientId`: the draft's own id travels with the send and comes back on the broadcast, so
whichever of the two arrives first retires the draft. It is deliberately not stored and not
interpreted by the server, which only echoes it.

**A browser found this and no unit test could have.** It surfaced as a Playwright strict-mode
violation — one message text matching two elements — in a full-suite run, and passed three times out
of three when that spec was run alone. The window is milliseconds on an idle machine and widens under
load, which is the definition of the bug a green suite hides. The regression test settles the mocked
response *after* emitting the event, so the losing order is the one that is asserted rather than the
one that has to be got lucky.

### Item 98: the line Prisma writes every time, that only fails silently

Item 96 was generated by `prisma migrate dev` like any other migration, and the draft opened with
`DROP INDEX "Message_searchVector_idx"` — the phase 12 GIN index behind every search in the app. It
was removed by hand. Nothing would have caught it if it had not been.

Prisma re-arms this every time. `searchVector` is `Unsupported("tsvector")`, so Prisma sees an index
it has no record of and drafts its removal, and it will do exactly this again for the next change to
the `Message` table. The `DROP DEFAULT` it emits alongside is harmless — Postgres refuses it on a
generated column, so that migration dies loudly. The `DROP INDEX` succeeds, and afterwards **search
still returns the right rows**, by sequential scan. There is no wrong answer to assert on; the cost is
latency that grows with the table.

So the guard asserts two different things, because either alone has a hole: that the index exists and
is still GIN (the invariant), and that no committed migration contains a `DROP INDEX` naming it (the
line, caught before it is ever applied). Proving it works meant writing a migration that drops the
index and watching both go red — which also dropped the index from the test database for real, and is
its own small argument for the guard existing.

## Phase 31 — the affordances the upgrade took away — `done`

Reported by someone using the app: the buttons do not show a hand cursor. They had not for some time,
and nothing in the repository could have said so.

| # | Item | Status |
| --- | --- | --- |
| 99 | `cursor: pointer` on every button, and the guard that keeps it | Done |
| 100 | Focus that is visible where an outline was styled away | Done |

### Item 99: Preflight changed underneath the app

Tailwind v3's Preflight set `cursor: pointer` on `button`. **v4's does not** — the reset now follows
the browser default, which is an arrow. Upgrading therefore changed the feel of every clickable
surface in the app without touching a line of markup, and `cursor-pointer` appears nowhere in this
codebase because under v3 it never had to.

The fix is one line in `components/button/button.tsx`, and that it is one line is the point: the
discipline of "no raw `<button>`" — which had looked like bookkeeping — meant the app had exactly one
`<button>` element to correct. A checkbox `<label>` and the one `<select>` in the app are the only
controls outside it, and they were corrected too.

The test is in a browser and asserts `getComputedStyle`, because nothing else can see this. jsdom
applies no stylesheet, so the same assertion there would pass with the class missing, the CSS
unbuilt, or Tailwind uninstalled. It also checks **every** visible enabled button rather than a named
few: the regression was global, so the guarantee should be. Removing the fix turns it red with
`"cursor": "default"` on four buttons at once, which is how it was verified.

`disabled:cursor-not-allowed` had to keep winning, so that is asserted separately — twMerge keeps
both because they are different variants, and a caller's own `cursor-zoom-in` (the gallery) still
overrides the base, which is what `cn()` is for.

### Item 100: an outline styled away and never given back

Looking for more of the same class turned up two fields that removed their outline and had nothing in
its place. The conversation search was the real one: tabbing into it moved focus somewhere with **no
visible indicator at all** (WCAG 2.4.7). The emoji picker's field is focused on open, so it only
mattered on the way back from the grid, but it is the same omission and got the same treatment — the
`focus-within:border-ink` the group-members search bar was already using.

Every other `outline-none` in the app was checked and is correct: they are dialog containers taking
programmatic focus, or fields whose wrapper already carries `focus-within`.

## Phase 32 — the safety gap nothing had written down — `done`

Every "Known gap" in this file was a decision somebody had made and recorded. This one was not on any
list: **anyone could find anyone by handle and open a conversation, and the person on the other end
had no way to stop it.** For a messaging app that is a more consequential hole than most of what the
roadmap was tracking, and it had gone unnoticed because nothing in the code looks wrong — the feature
was simply absent.

| # | Item | Status |
| --- | --- | --- |
| 101 | Blocking, enforced where it can actually be enforced | Done |

### Where the check has to live

Refusing to *create* a direct conversation is the obvious place and is not enough on its own. Two
people who have been talking for months already have their conversation, so a block that only guarded
creation would stop nothing at all for exactly the people most likely to need it. The enforcing check
is therefore in `sendMessage`, **inside the locked transaction**, next to the membership re-check and
for the same reason: a send racing a block resolves in one honest order.

The initial delivery covered direct creation, sending and user search; this follow-up adds the realtime
boundary and concurrency ordering they also need in production. Search is filtered **in both
directions**. Hiding only the people you blocked would leave you visible to them, so they could still
find you, be refused, and learn precisely what had happened. Both refusals say the same sentence about
the conversation rather than about either person, for the same reason.

### What a block does not do

**Groups are untouched.** WhatsApp, Messenger and Telegram all leave a blocked person's messages
visible in a group both people are in; hiding them behind a placeholder is Discord's answer, and it
makes paging, unread counts and read markers resolve differently for two people reading one thread.
The confirmation dialog says so out loud, because "blocked" reads as total and finding the exception
out later, in a group, is the bad way to learn it.

The row is **directed** — it records who blocked whom — while the effect is symmetric. Two rows would
make that question unanswerable, and unblocking is not something the blocked person can do.

`UserBlock_not_self` is a check constraint rather than a service guard, on the phase 7 principle: a
rule the code checks is a rule until somebody writes a second code path.

### Where the action lives, corrected after the fact

It shipped with one entry point, at the top of the conversation details panel, and the first person to
use it could not find it — the panel is opened by a header icon labelled "Conversation storage and
details", which is not where anybody looks for blocking. It was also the loudest thing on that panel,
directly under the person's name, which is the opposite of what `Button`'s outlined `danger` variant
exists to achieve.

Both were fixed by moving it: **the row's own actions menu**, beside pin, archive and mute, which is
where every messenger puts it and where people actually reach; and the **foot** of the details panel
rather than its head. Two surfaces reading one `useBlockedUsers` store, so blocking in one changes
what the other offers — a per-row fetch would have been one request per conversation to answer a
question whose answer is a handful of ids.

Adding the second entry point introduced its own bug, caught the same way: the menu blocked
**immediately** while the panel asked first. Two doors to one decision have to behave the same, so the
menu now raises the same confirmation. Unblocking still does not ask, from either — one of them is
the decision, and confirming the way back out only punishes changing your mind.

### The trap, sprung on schedule

Prisma's draft of this migration opened with `DROP INDEX "Message_searchVector_idx"` — exactly what
[item 98](#item-98-the-line-prisma-writes-every-time-that-only-fails-silently) said it would do to the
next migration touching this schema, written one phase earlier. The guard caught it, then caught its
own false positive: the first version of the check read the migration's *prose* explaining why the
line had been removed. It strips SQL comments now, and is tested both ways — a comment mentioning the
line passes, real SQL fails.

### Phase 32 follow-up — blocking, hardened for privacy and scale

Phase 32 gave a direct conversation a block rule. This pass makes that rule
hold at the boundaries where a production system leaks it if it is treated as a
single `sendMessage` check.

| # | Item | Status |
| --- | --- | --- |
| 102 | Cursor-paged block management, race-safe enforcement and realtime privacy | Done |

**The privacy list is bounded.** `GET /blocks` is now keyset-paged by its own
row, and the conversation UI asks the smaller question it actually needs —
whether *I* blocked this one person. That answer is cached only for people the
user makes actionable, never fetched as every id in the account's block list.
The reverse direction is not exposed, so the status endpoint cannot become a
"did they block me?" oracle. A new **Blocked users** entry in settings is the
account-level way to review pages and unblock someone; a chat may be archived or
far below the sidebar, so the chat menu cannot be the only door back out.

**A block and a direct write are ordered together.** A missing `UserBlock` row
cannot be protected with a row lock, so `block`, `unblock`, direct-conversation
creation and direct sends share a PostgreSQL transaction advisory lock keyed by
the unordered pair of users. This closes both races: block cannot lose to a
send that read too early, and two tabs cannot create duplicate direct threads.
The service passes its transaction into the policy check — a check that silently
uses the global Prisma client from inside a transaction is not part of the
transaction at all.

**Realtime obeys the same policy.** Once a block commits, each person's live
sockets leave every matching direct room; reconnects select only rooms that the
database policy permits. The typing handler rechecks the database too, because
a socket room is delivery bookkeeping rather than authorization and can be
briefly stale. A direct-only pair has its cached presence withdrawn immediately;
shared-group presence stays visible because that group remains a deliberate,
shared context. This prevents a direct relationship from leaking typing, online
state or read-receipt events while preserving the existing group policy.

## Phase 33 — the last unbounded query — `done`

Item 80 was opened in phase 21 and stayed open through twelve phases. It is the last thing on this
file that was `planned` rather than `blocked`, and closing it means the app no longer asks the
database for an unbounded set anywhere.

| # | Item | Status |
| --- | --- | --- |
| 80 | Conversation list pagination | Done |

### The cap was the design

The hard part was never the query. It was that the sidebar sorts `pinnedAt DESC NULLS LAST, then
updatedAt DESC`, and a keyset cursor over that tuple cannot be written in Prisma — a row-value
comparison cannot express NULLS LAST, so it means raw SQL for the one query in the app that everybody
reads on every reconnect.

**`MAX_PINNED_CONVERSATIONS` is five**, which makes the whole problem go away: the pinned set is
bounded by construction, so the first page carries all of it and every later page is walking the
ordinary tail in one order. That is a plain two-column keyset — `updatedAt` with `id` breaking ties —
and it fits in the query builder. An invariant that already existed for a product reason turned out
to be the thing that made the engineering simple.

`id` is the tiebreaker rather than nothing, and that is not defensive: conversations created inside
one request share a millisecond, and a cursor over a non-unique column silently repeats or skips rows
at the page boundary. There is a test that writes four conversations to the same instant and walks
them.

### The case paging created

Phase 27's incremental patching was the prerequisite, and it is also what made the remaining bug
possible. Every socket handler patches *a row it already holds* — and once the list is a page,
a message can arrive for a conversation that is not in it. Patching finds nothing and the row never
moves; re-listing would fix it and throw away the reader's scroll position, which is the objection
that kept this item shut in the first place.

So `GET /conversations/:id` returns one row, and the handler fetches just that conversation and lifts
it. Two Playwright specs cover the halves that no service test can reach: that scrolling actually
fetches the next page, and that a message lifts a conversation from below the loaded window.
Removing the fetch-one branch turns the second red.

### What it cost elsewhere

The response shape changed from `ConversationDTO[]` to `{ items, hasMore }`, which the type checker
found every consumer of — including one Playwright spec calling the endpoint directly through
`fetch`. Threading `hasMore`/`isLoadingMore`/`loadMore` through page → sidebar → list pushed
`chat-page.tsx` over the 300-line audit line, so the three became one `ConversationPaging` object and
the composer's reply target moved into `useReplyTarget` — two pieces of state that only make sense
together, plus the effect resolving one into the other, which was never really the page's business.
The sidebar is the second pager in this feature, so the vault's IntersectionObserver effect became
`useInfiniteScroll` and both now read it.

## Phase 34 — what enforcing a block left behind — `done`

Item 102 made the block store ask one small question per person instead of downloading the account's
whole list, and cache the answer for the session. That cache had nobody to invalidate it. The same
pass put the block check on the busiest socket handler in the app without noticing what that cost.

| # | Item | Status |
| --- | --- | --- |
| 103 | The blocker's other sessions learn about their own block | Done |
| 104 | The typing handler stops querying the database per keystroke, and stops being able to crash | Done |

**The bug.** Block somebody on the phone with the laptop still open, and the laptop keeps offering
"Block" in the row menu and keeps its composer enabled — the send then fails with the deliberately
vague "This conversation is unavailable", which is the right sentence for the *other* person and a
lie to the one who pressed the button. Unblocking is the worse direction: the laptop holds "You
blocked this person" over a dead composer until somebody reloads the page.

**Only the actor's room, and that is the whole design.** `block:changed` carries the actor's own
directed row — the same fact `GET /blocks/:id/status` already answers for them — to `user:<actor>`
and nowhere else. Sending the counterpart to the other person would leak even with `isBlocked: false`
in the payload, because the *arrival* of an event at the moment somebody blocks you is the timing
signal the status endpoint exists to refuse. That is why this event is emitted separately from the
symmetric `presence:update` withdrawal beside it, rather than as one loop over both people.

It is read inside the same locked transaction that reconciles the socket rooms, and read separately
from the symmetric `hasBlockBetween` — two tabs racing a block and an unblock settle on the last
committed row rather than on whichever emit lands second. It is also emitted **before** the early
return for a pair with no direct conversation, because unblocking from account settings is ordinary
and there may be nothing left to reconcile.

**The socket is not always up.** An event delivers nothing to a session that was offline when it
fired, so the reconnect that already refreshes the sidebar and resyncs the thread now re-resolves the
block statuses too. Bounded by what the session actually asked about, never by the size of the
account's block list. Dropping the cache instead would re-resolve nothing: consumers call `load` on
mount, not on every render.

### The keystroke path paid for it

Rechecking the block policy in the typing handler is right — a socket room is delivery bookkeeping
rather than authorization — but it was written as a database read on **every** `typing:start` and
`typing:stop`, which is a round trip several times a sentence per person, on the busiest handler in
the app, to answer a question whose answer changes about once in the life of a relationship. That is
the exact cost the handler's own comment said the room lookup existed to avoid, and the comment had
stopped being true.

The verdict is now cached per socket per conversation for five seconds. Staleness is harmless in both
directions: a block prunes the socket's rooms synchronously, so the hash lookup refuses before the
cache is consulted, and an unblock can hold a refusal for a few seconds, which costs an indicator
that expires on its own.

The same handler had been given an `async` listener. socket.io neither awaits a handler nor catches
what it rejects with, and an unhandled rejection ends a Node process by default — so one database
blip during one keystroke was a way to take down an API instance. The relay now catches, and the
policy check fails **closed** and caches the refusal, so an outage suppresses typing instead of
turning every keystroke into another failing query and another log line.

### What a block still does not do

Beyond the group exemption recorded in phase 32, one thing is worth naming because it looks like an
oversight and is not: **a direct conversation with a block in it refuses every recipient-visible
write in both directions, including deleting a message you wrote.** So somebody who sends something
they regret and then blocks the recipient cannot retract it without unblocking, deleting, and
blocking again. The alternative — exempting deletion, since it only ever *removes* content — also
hands a blocked person a tombstone channel into a thread the other person asked to close, and the
8-hour author window is the only thing bounding it. Left as it is, deliberately, and recorded here so
it is a decision rather than a surprise.

## Phase 35 — the details panel stops being a tab bar — `done`

Phase 26 built the vault and gave it six tabs. The tabs were the part that did not survive contact
with the panel's width.

| # | Item | Status |
| --- | --- | --- |
| 105 | Categories with counts, drilling into one list at a time | Done |
| 106 | Saved messages are paged by the server for one conversation, not filtered in the browser | Done |

### Why the tabs had to go

The panel is 448px on a desktop and the width of a phone below that. Six tabs did not fit, so the
strip carried `overflow-x-auto` — which is not a layout, it is an admission: half the categories sat
behind a horizontal scroll gesture that nobody performs on a desktop, on the most valuable row of the
panel, spending it on six words that say nothing about what is inside them.

**A list has room for the thing a tab could never carry: the count.** "Files 0" is now answered
before it is opened, rather than after a request, a spinner and an empty state. Opening the panel is
also *cheaper* than it was: it used to fetch forty images and their thumbnails whether or not anybody
wanted photos, and now it fetches five integers and fetches a page only once a category is picked.

`GET /conversations/:id/vault-summary` is one round trip with five scalar subqueries rather than five
parallel counts, and every predicate is copied from the list it summarises — `MessageHiddenFor`
included. A row that says 9 and opens onto 8 is worse than a row with no number, and the count and
the list read the same rows to make that impossible. `COUNT(*)::int`, because `$queryRaw` returns a
PostgreSQL bigint as a JavaScript BigInt and `res.json()` refuses to serialise one.

### What stayed a sheet, and why that is the decision

The shape this borrows from is KakaoTalk's, which puts storage in a modal with a conversation rail
down the left. That rail is wrong **here**: this app's main sidebar already selects the conversation,
so a second list of conversations inside a modal is a parallel navigation with its own selection
state to disagree with.

More decisive: **tapping a photo jumps to the message it came from.** It works because the thread is
right there behind the sheet. From a full-screen modal, that jump has to tear the modal down first —
so the panel would have replaced the thing it exists to point at. A cross-conversation media browser
is a genuinely different feature, and its left rail should be *filters* — kind, sender, date — rather
than a copy of the sidebar. It is not built.

A group still lands on its members, because the header button that opens the panel is labelled "Group
members" for a group and has to show them. The categories are one Back away rather than one tap in
front.

### The bug the counts uncovered

The Saved tab asked for the **account's** saved messages and filtered the page in the browser. So
anybody who saves messages in more than one conversation opened this tab on an empty list and had to
scroll it into existence, one page of somebody else's saved messages at a time — and the cursor paged
the unscoped set, so the tab's own paging never described what it was showing. `GET /me/saved` takes
a `conversationId` now, and one filter object serves both the cursor lookup and the page, so a cursor
can never validate against a wider set than the page it belongs to.

### Two things a screen reader found

The category row renders its label and its count in adjacent elements with no whitespace between
them, which is read out as "Saved2". The row carries an explicit `aria-label` — "Saved, 2".

The panel's landmark is now named on the `<aside>` rather than left to the heading inside it: the
heading becomes the open category's label, so a region named by it changes name as you navigate
*inside* it, and cannot be addressed by name at all. The Playwright walk was the thing that noticed —
its locator stopped matching the moment it drilled into a category.

Every list now carries the same sticky month heading. Media had one from phase 26 and the other four
did not, which is odd on its own; the heading is also what turns a hundred files, voice notes or
links into somewhere a reader can aim, and one that scrolls away has stopped working exactly when the
list is long enough to need it.

## Phase 36 — three details that were each one decision short — `done`

Not a feature between them. Each is a place where a decision was made correctly, its consequence was
never re-examined, and the result was visible on screen.

| # | Item | Status |
| --- | --- | --- |
| 107 | A captioned picture is one object again | Done |
| 108 | The details panel closes on a press outside it | Done |
| 109 | Every dismissible surface listens on the same gesture | Done |
| 110 | A picture fits the screen it is on, and has an edge on pale ground | Done |
| 111 | A photograph states its own time | Done |

### Item 107: the caption had moved out and nothing brought it back

[Item 90](#item-90-a-photograph-is-not-a-quotation) took the bubble off a picture, for a reason that
still holds: a photograph is already a rectangle of somebody else's content, and a fill around it is a
second frame — and the ink fill was the worst possible one, a dark border around every photograph
anybody sent. The caption was moved *under* the picture, into its own box.

What that produced was **two objects**: a bare photograph, a gap, and then a narrow pill of text
pulled to the tail edge — which reads as a separate message sent after the picture rather than as the
picture's caption. Nobody chose that; it fell out of `flex-col gap-1.5` with `items-end`.

A captioned picture keeps its normal media corners and remains uncluttered in the thread. Its full
caption appears only after opening the image — [phase 37](#phase-37--the-viewer-stops-being-a-panel--done)
settles where — while the time remains quiet in its own lower corner. It makes the text visibly belong
to the picture without adding another dark object to the conversation.

There are no attachment-radius tables. The media reads the ordinary bubble table once, so the run's
grammar — the unbroken side, the seam and the single notch — continues around the picture even when
the message also carries text.

**Albums keep their fanned stack.** Their front cover carries no caption; opening the stack presents
every image, direct thumbnail navigation, and the complete message text as one focused viewing
surface.

### Item 110: two things a phone and a white photograph each proved

Both were found by running the app rather than by reading it, and neither is visible on a desktop
with a colourful test image.

**A picture was drawn at a fixed width and the row it sits in is a percentage.** The message row is
`76vw` on a phone; a photograph was 320px whatever the screen. On a 390px device that is a 320px
picture inside a 296px row, so every image ran 24px past its own row and lost its right edge and both
corners to `overflow-hidden` — cut off against the side of the screen. The attributes stay, because
they are what reserves the box before the bytes arrive; `max-w-full h-auto` beside them is what lets
a narrow screen scale that box down proportionally instead of clipping it.

With that in place the ceiling could go up. 320 was spending barely half of the `min(62vw, 34rem)` a
message row already allows, and a photograph drawn at thumbnail size inside a conversation about it
reads as a link to the picture rather than the picture. It is 380 now, and 460 tall.

**A pale photograph had no edge at all.** Pictures are drawn bare on the paper — which is right, and
item 90 explains why — but "bare" had come to mean "no boundary", and a near-white image rendered as
a rectangle of nothing that could only be located by its caption. One with no caption was invisible.
A hairline now sits over the picture, drawn in a pseudo-element rather than a border so it costs the
layout nothing and inherits the corners the picture already has. It is a boundary, not the mount that
item 90 removed: it does not surround the photograph with a fill, it ends it.

### Item 111: the number that belonged to nothing

Phase 17 moved every timestamp off the vertical and into the gutter beside the bubble, which is right
for a sentence: the gutter is centred on the bubble, and a bubble is one or two lines tall.

A photograph is 460px tall. The gutter put its time level with the middle of the picture, a hand's
width away from anything it referred to, touching nothing — and that, more than any corner radius, is
what made an image message read as undesigned. A picture drawn with care beside a number floating in
empty space does not look like a decision anybody made.

**The picture states its own time**, and the chip is deliberately quiet: `scrim` behind it keeps it
legible over a white sky and a black jacket alike, while `meta` keeps it mono, tabular and stable as a
minute ticks over. An album's total has the upper corner to itself, while time stays in the lower-right
corner, so its metadata remains quick to scan.

The gutter stops drawing a time when the bubble has one, so the number is never stated twice — but it
keeps the edited marker, the read receipt, and the delivery status, because a message still on its way
has no send time to state: the one it carries is this machine's guess rather than the server's answer.

A captioned album stays a compact stack in the thread. Its cover stays text-free; the viewer states the
complete caption with the selected image and lets the reader move through the whole set without
turning the conversation itself into a grid.

### Item 108: the largest dismissible surface in the app was the one exception

The conversation details panel closed on its X or on Escape, and on nothing else — while the emoji
picker, the sticker tray, the attachment menu, the row menu and the message menu all close on a press
outside them. It is the biggest of them and it sits over the conversation, so it was the one most
worth dismissing by pressing what you actually wanted.

Three things make it correct rather than merely wired up:

- **The panel is unmounted when closed**, so nothing has to ask whether it is open — and the press
  that opened it landed before the listener existed, which is what stops the panel closing itself on
  the way in.
- **The confirmation dialogs and the image lightbox render inside the panel's own element**, so
  `contains` already counts a press on either as inside. That is load-bearing: both cover the
  viewport, and a panel that closed underneath its own "Block this person?" dialog would leave the
  dialog standing over a conversation it no longer belonged to.
- **Escape is deliberately not handled here.** `useKeyboardShortcuts` already closes this panel as
  part of an ordered chain — help, then forwarding, then the panel — and a second listener would
  close two surfaces with one key.

### Item 109: two of the five were listening for a mouse

Three surfaces dismissed on `pointerdown` and two — the sticker tray and the emoji picker — on
`mousedown`, which is not a difference anybody chose. On touch they are not the same event: a press
outside those two did not close them the way it closed the other three, so the same gesture had two
outcomes depending on which panel was open. Both now listen on `pointerdown`.

The five copies of that effect were left as five. Three of them are menu widgets whose dismissal is
entangled with roving focus — arrow keys, Home/End, and the focus restore that Escape performs — and
lifting the two shared lines out would separate Escape from the arrow keys that belong beside it. A
shared hook is the right answer only once there is something to share that is not a fragment of a
widget.

## Phase 37 — the viewer stops being a panel — `done`

All of it reported from a screenshot of the viewer opened on a photo set, and every item is the same
complaint from a different angle: the frame had become louder than the picture.

| # | Item | Status |
| --- | --- | --- |
| 112 | The caption is stated above the picture, not laid over it | Done |
| 113 | The viewer loses its panel, its rules and its outlined buttons | Done |
| 114 | The set is centred under the picture | Done |
| 115 | A picture can be forwarded and saved from the viewer | Done |
| 116 | A picture can be zoomed, panned and rotated in the viewer | Done |

### Item 112: a caption over a photograph is unreadable exactly when it matters

Phase 36 moved the caption out of the thread and into the viewer, which was right, and then laid it
across the top of the opened image, which was not. Two things go wrong at once, and the screenshot
shows both: the wash covers the top fifth of every photograph — where the subject of a photograph
usually is — and the text is set on whatever happens to be underneath it, so a caption over a busy
picture is the one caption nobody can read.

It is now type on the scrim, centred, above the picture and under the header row. It costs the image
the height of the words and nothing else, it is legible over any photograph because it is over no
photograph, and centred type over a centred picture is one axis instead of two.

Long captions are capped at roughly four lines and scroll inside that. A message can be a paragraph,
and a paragraph is allowed to push a photograph off the screen in a thread — never in the viewer that
exists to show it.

### Item 113: nine lines around one picture

Counted off the screenshot: a border around the panel, a rule under the header, a rule over the
thumbnail strip, a border around the close button, one around each arrow, one around each thumbnail.
Every one of them was defensible on its own and together they framed the photograph four deep.

**The panel is gone entirely.** The viewer is the picture on the scrim. That does not mean scattering
its controls around the screen: the image's context stays on the same centred axis above it, the
previous/next affordances hug its own edges, and every tool meets again in one dock below it.

The dock is ordinary layout, not another absolute layer competing for the bottom of the viewport: its
toolbar comes first and its thumbnail strip follows. The arrows share one centred, fixed-width
navigation rail and fade in on hover or keyboard focus. An image's aspect ratio must not decide where
the next-picture target lands: portrait and landscape now put it at the same distance from the viewer's
centre, close enough to reach without becoming part of the picture.

The controls keep only what an affordance needs: nothing at rest but the glyph at 70% white, a soft
wash under the pointer, a press that scales to 95%, and chevrons that appear beside the image only on
intent. `LIGHTBOX_CONTROL_CLASS` holds it once — repeated controls that behave identically must not
each acquire their own slightly different hover.

The focus ring is restated on every one of them, and that is not decoration: the Button default ring
is drawn in `ink`, which is near-black in the light theme, so keyboard focus inside a viewer full of
scrim was invisible for anyone on the light setting.

### Item 114: a strip of four pinned to the left

The thumbnails hung off the left edge of a full-width panel, which reads as the beginning of a list
that ran out rather than as the set. They are centred now — under a centred picture, on the same
axis as the caption above it.

**Centring a scroller is not `justify-center`.** A centred flex row whose content overflows pushes its
first items past the left edge of the scroll container, where nothing can scroll back to them, and a
set large enough to overflow is precisely when the strip matters. The row inside the scroller is
`w-max` and centred by `mx-auto`: in the middle while it fits, from its true start once it does not.

### Item 115: the two things you actually want from an open picture

**Forward** reuses the panel the row menu already opens, and the viewer closes itself on the way — the
forward panel belongs to the conversation pane and renders *under* the viewer, so a viewer left open
would hide the thing the press just asked for. It is offered only where there is a message to forward:
the vault lists attachments rather than messages, and a message this tab is still sending has no
server id for a forward to name.

**Save** could not be an `<a download>`, and the reason is worth writing down. That attribute is
honoured only same-origin, and the API is a different origin from the web app in every environment
this project has — the anchor would have navigated to the picture instead of saving it, replacing the
conversation with a full-screen image. `downloadAttachment` fetches the bytes, wraps them in a
`blob:` URL of our own origin, and hands *that* to the anchor. The blob is released a task later
rather than immediately, because a URL revoked in the same task as the click that consumed it cancels
the download in some browsers and not others.

A failed save says so, in a chip on the scrim. The alternative — a button that does nothing when the
network is down — is the failure mode people retry four times before giving up.

### Item 116: a viewer that only displays was doing half the job

Save and forward answer "what do I do with this picture"; nothing answered "let me actually look at
it". A screenshot with handwriting in it, or a face in the back row of a group photo, had no way to
get closer than whatever the browser happened to fit on screen.

**Every zoom is anchored at the point being looked at**, not at the picture's centre. A wheel tick, a
trackpad pinch, a double-click and the toolbar's own buttons all move the pan so the pixel under the
cursor stays exactly where it was as the image grows or shrinks under it — the one property that makes
a zoom feel like it is responding to you instead of sliding the thing you were looking at out from
under your finger. The math is a small derivation, kept in the doc comment on `useAttachmentZoom`
rather than re-argued at each call site: it holds `R·p·Z = M − centre − pan` at the old zoom and solves
for the pan that keeps it true at the new one.

**Panning is clamped to the picture, not to the screen.** Dragging a zoomed image only ever reveals
more of *that image* — the edge stops at the edge of the (rotated, scaled) picture rather than letting
the reader drag it into empty scrim, which is what a naive unclamped `translate` does. A 90° or 270°
turn swaps which of the image's own dimensions faces the container's width, so the clamp swaps with it;
getting this wrong is exactly how a sideways photograph ends up draggable past the edge of the screen
on one axis and not the other.

**A quarter-turn preserves the whole form.** At 100%, turning a wide landscape swaps its rendered
width and height; leaving the original fitted scale in place would push its top and bottom past the
viewport. The hook therefore calculates a second, automatic fit scale from the turned bounding box,
and recalculates it when the viewer resizes. It never crops or distorts the picture. The reader's
chosen zoom remains relative to that fitted state — rotate while inspecting at 150% and the 150% detail
is respected; reset returns to the complete, correctly fitted image.

**Rotate, zoom and pan live in one hook**, `useAttachmentZoom`, not inline in the viewer component —
three gestures (wheel, double-click, drag) and two refs feeding one small state machine is precisely
the "state plus lifecycle" split this project's hooks exist for, and it is what keeps the viewer
component itself under the line length that would otherwise force a worse split. It resets on the
attachment's own id rather than the array index, so it is tied to *which picture this is* and stays
correct through a re-ordered set.

**The controls meet in one smaller toolbar**, beneath the picture rather than in a second cluster at
the top of the screen. Rotate and zoom come first, then a quiet divider, then message actions and
close; the order follows how a picture is used — examine it, then do something with it. The thumbnail
strip sits immediately below the same dock, so changing photos and changing their view remains one
compact area. `LIGHTBOX_TOOLBAR_BUTTON_CLASS` draws it at 28px deliberately: nine controls in a
single, quiet pill are still subordinate to the image rather than a second toolbar competing with it.
The percentage doubles as the fastest way back to a fitted picture — a bare readout would have left
the reader one press short of it.

`+`/`-` zoom, `0` resets it, `R` rotates clockwise and `Shift+R` counterclockwise; the arrow keys and
the wheel both still do what they did before: the keyboard surface grew, nothing already on it changed
meaning.

### What else the viewer gained, unasked

Both neighbours of the open picture are fetched while it is being looked at, so an arrow key swaps
the image instead of blanking the frame for as long as a megabyte takes to arrive; and the image
itself fades in over 160ms, keyed on the attachment id, because a hard cut in a frame that does not
move reads as a glitch rather than as a change. Both respect `prefers-reduced-motion` through the
same block `popover-enter` already used.

## Phase 38 — a half-built feature, a stolen-token risk, and a test suite that had stopped being trustworthy — `done`

Not one item found by building something new. All three were found by reading what was already here
against what it claimed to do, and each is a different way that gap had gone unnoticed: code with no
caller, a wire contract nobody had revisited since it was designed, and a test run slow enough that
nobody had actually watched it finish.

| # | Item | Status |
| --- | --- | --- |
| 117 | Restrictions: enforced, and given a settings surface | Done |
| 118 | The refresh token moves from `localStorage` to an `HttpOnly` cookie | Done |
| 119 | The test suite stops lying about how long it takes and what is broken | Done |

### Item 117: a table and a service with nothing calling either

`f57db25` had shipped `restrictions.service.ts` in full — restrict, unrestrict, status, a paged list,
`hasRestricted`, `isDirectConversationRestricted` — and mounted none of it. The router never reached
`app.ts`, and the two helpers written for reuse were reused nowhere: not in the unread count, not in a
read receipt, not in presence, and there was no frontend at all.

Finishing it meant answering what the module's own doc comment had already promised and then wiring
exactly that:

- **The unread badge** (`countUnreadByConversation` in `conversations.service.ts`) now excludes
  messages from someone the viewer has restricted, the same `NOT EXISTS` shape the row already used
  for `MessageHiddenFor`.
- **Read receipts** (`markConversationRead`) check `isDirectConversationRestricted` alongside the
  existing block check — the restrictor's private marker still advances, but the shared one does not,
  so the restricted person never sees "Seen".
- **Presence** needed a new primitive, not a reused one: blocking removes room membership entirely,
  which cannot be the answer here because messages must keep flowing. `excludeRestrictedDirectRoomIds`
  filters a direct conversation out of the room list a presence update broadcasts to, and
  `listRestrictorsAmong` does the same for the one-time snapshot a freshly connected socket asks for —
  the two moments presence reaches a client.
- **The frontend** mirrors blocking's own — `useRestrictedUsers`, `useRestrictedUsersSync`, a
  `ConversationRestrictControl` beside `ConversationBlockControl`, and a "Restricted people" row in
  account settings — because the shape (a session-cached status, resolved per person, a paged
  settings list) is the same problem blocking already solved.

**One promise from the doc comment did not ship: a "Message requests" mailbox.** Moving a restricted
sender's conversation into a separate inbox is a real feature — its own schema state, its own list
view — not a filter on data that already exists, and nothing in the schema or the frontend had ever
been built toward it. The comment now says so instead of describing a mailbox that is not there;
building one is a decision for later, not a gap to paper over.

### Item 118: a month-long credential a script could read

The refresh token — thirty days, and the only thing standing between an XSS bug anywhere in this app
and a session an attacker could keep renewing — sat in `localStorage` beside the access token,
readable by any script on the page. `AuthResponse`, `RefreshTokenResponse` and `ChangePasswordResponse`
all carried it in the body, which meant it was in `response.json()` the instant the client read
its own successful login, cookie or not — the body had to stop carrying it, not just the storage
layer.

It now arrives only as a `Set-Cookie`: `HttpOnly` so no script can read it back, `path: "/auth"` so it
is attached only to the two endpoints that ever read one, `sameSite: "lax"` (crosses a different port
in dev and a different subdomain in production, both still the same registrable domain), `secure` in
production. `/auth/refresh` and `/auth/logout` read `req.cookies` instead of a body field; the access
token is untouched, still fifteen minutes, still in `localStorage` — the risk it carries is a stolen
copy worth minutes, which is the trade `RefreshToken` rows already made deliberately.

The one place the old design is described as current — item 79's "the refresh token in the body is
the credential" — no longer holds, and that sentence is corrected there rather than left standing next
to this one.

### Item 119: the test that took a hundred minutes was hiding three that took two seconds each

`npm run test` took **7,860 seconds** and failed four tests in three unrelated files. The slowest
single test — `attachment-endpoint.test.ts`'s mixed-field-upload case — took 93 minutes on its own,
and `tests/setup.ts` already documented the exact failure shape this produces: a test that outruns
Vitest's 5-second default leaves its request still running while the next test's `TRUNCATE` fires,
and the resulting damage lands on whatever file happens to run next rather than on the slow one.

The cause was in `middlewares/upload-image.ts`, not in any of the three failing files. Multer's
`fileFilter` rejected a disallowed file by calling `next(error)`. Multer's own source
(`abortWithError`) does not drain that file's Busboy stream on the error path — only the `next(null,
false)` path calls `fileStream.resume()` — so a client sending a second, larger part after a rejected
one left the request stalled on backpressure that never cleared. Every `fileFilter` in the file now
rejects through `next(null, false)` and stashes the reason in a `WeakMap<Request, ValidationError>`
keyed on the request, re-thrown once Multer's own callback fires. Same error messages, same status
codes, and the part is drained the moment it is rejected instead of never.

This was reachable from a real client, not only from a slow test — anyone sending a mixed upload, an
oversized field after a rejected one, or an executable after an image would have stalled that request
for minutes, holding a connection the whole time.

One more test was its own, unrelated problem: `conversations.service.test.ts`'s six-user pinning test
created every user through `register()`, and `tests/setup.ts` already named this trap — bcrypt at cost
12 is roughly 300ms, and seven calls in one test is enough on its own to clear the 5-second default.
Switched to creating rows directly with `prisma`, the same fix `blocks.service.test.ts` and
`restrictions.service.test.ts` already use.

The suite now runs in **1,304 seconds** — still one file at a time against one shared, truncated
database (`vitest.config.ts`'s `fileParallelism: false`, a deliberate trade for fixture isolation, not
touched here) — with every test passing.

## Phase 39 — bandwidth follows attention — `done`

This phase adapts the part of Messenger's published architecture that fits Chatty's actual scale. It
does not copy infrastructure built for billions of accounts: the useful principle is snapshot plus
deltas, media outside the message payload, and no byte sent before the reader needs it.

| # | Item | Status |
| --- | --- | --- |
| 120 | Resize/encode image uploads on-device, without weakening server validation | Done |
| 121 | Use 480px derivatives in the thread and compress large HTTP JSON responses | Done |
| 122 | Record the scale path and the condition that justifies each next subsystem | Done — [ADR 0016](adr/0016-bandwidth-first-message-delivery.md) |

### Item 120: not “keep 25%”, but keep only useful pixels

A percentage has no stable meaning across a flat screenshot, a noisy night photo and an already
compressed WebP. The browser now uses the same 1600px longest edge the server stores and tries WebP at
quality 0.86, one image at a time. It keeps the result only when it is smaller and falls back to the
original on any unsupported codec or decode failure. The optimistic bubble is inserted first, so this
work delays bytes rather than feedback.

The server still decodes and re-encodes the upload. That is not duplicate optimisation accidentally
left behind: only the server pass can be trusted to enforce the pixel ceiling, remove EXIF/GPS data
and ensure something served as an image really is one.

### Item 121: a preview does not earn the original

Phase 26 created 480px derivatives for the vault but the main message gallery still requested the
1600px signed URL into a box at most 380×460. Threads and album cards now use the derivative, falling
back for legacy rows; the viewer and save action keep the full image. JSON pages above 1KB negotiate
Brotli/gzip/deflate at the Express boundary. Already compressed images are not transformed by that
middleware.

Socket compression is intentionally unchanged. Socket.IO disables `permessage-deflate` by default and
warns about its CPU/memory overhead; the socket already sends individual deltas. ADR 0016 makes a load
test, payload distribution and CPU/memory measurement the prerequisite rather than assuming fewer
bytes always means a faster system.

### Item 122: where Facebook's design becomes relevant

Chatty already has the small-scale equivalents of the published Messenger ideas: WebSocket deltas,
keyset snapshots, optimistic ids, bounded client history, Redis-backed cross-instance rooms, and
media stored outside message rows. The missing distributed pieces are written as thresholds rather
than theatre: object storage when instances stop sharing a host, a durable event cursor when reconnect
gaps exceed the repair window/offline becomes a requirement, and a delivery queue when storage latency
is measured on the critical path. Phase 40 chooses the free launch topology and states the remaining
external conditions; phase 41 supplies the provider-free measurements for those thresholds.

## Phase 40 — one product, with a zero-cost launch boundary — `done`

The constraint is now explicit: the first public version may buy a domain, but it does not acquire a
monthly infrastructure bill. “Borrow the best of social platforms” is also a selection rule rather
than a feature pile: daily value, trust, network fit, zero-cost operation, bounded complexity and a
recognisable Chatty interface decide what enters the roadmap.

| # | Item | Status |
| --- | --- | --- |
| 123 | Product contract, platform-value map, UI rules and feature rubric | Done — [PRODUCT-DIRECTION.md](PRODUCT-DIRECTION.md) |
| 124 | Put both API instances behind one free internal Caddy gateway | Done |
| 125 | Add the optional Cloudflare Tunnel edge and choose the $0/month launch topology | Done in code — external launch conditions remain below |

`docker-compose.prod.yml` now exposes only loopback ports and routes API traffic through Caddy. The
Socket.IO client has used WebSocket-only transport since phase 11, so one upgraded connection stays
on one upstream without a sticky cookie; Redis keeps rooms and rate limits coherent across both API
processes. `docker-compose.tunnel.yml` joins that same network and publishes the web/API origins over
an outbound-only connection after a tunnel token exists.

The chosen host order is an existing always-on machine for private alpha, then Oracle Always Free for
public alpha, with a paid VPS only after measured usage makes a recurring bill intentional. Uploads
remain on the shared local volume until instances stop sharing a host or storage/recovery thresholds
are crossed; Cloudflare R2's free allowance is the first candidate then, not a dependency now.

### External conditions, stated precisely

- **Public TLS/DNS is blocked** until a domain is bought, added to a free Cloudflare account and a
  named tunnel token is created. The compose definition already exists.
- **Production password-reset mail is blocked** until that domain is verified with a free Resend
  account, SPF/DKIM/DMARC records are published, and `SMTP_URL`/`MAIL_FROM` are set.
- **A public launch is blocked on recoverability** until an off-host backup destination and retention
  are selected and the locally proven database/uploads restore drill is repeated against that
  deployment. This need not add a bill, but code cannot decide which user-owned disk or free
  object-store allowance holds the off-host copy.
- **Object storage is not blocked.** It is unnecessary in the chosen topology and becomes work only
  when API instances no longer share a host, the volume nears its budget, or restore time misses its
  target.

See [DEPLOYMENT.md](DEPLOYMENT.md) for commands, quotas, caveats and primary sources.

## Phase 41 — measure without renting a dashboard — `done`

| # | Item | Status |
| --- | --- | --- |
| 126 | Protected Prometheus-compatible application metrics without a SaaS dependency | Done |

`GET /metrics` now exposes process health, bounded HTTP route groups/statuses, declared request bytes,
message send latency and upload bytes, server image-normalisation time and input/output bytes, Prisma
query latency by its finite model/action names, and per-process socket connection/setup state. A
dedicated bearer token is at least 32 characters and mandatory in production; it is never accepted in
the query string, and the response is `no-store`.

No label contains a URL, conversation id, user id, handle or error message. This matters as much as
the authentication: a series per user-controlled value would make the monitoring process consume
memory in proportion to traffic and leak those values into operational data. Each API process owns
its counters, so Prometheus should scrape `api-1:4000/metrics` and `api-2:4000/metrics` separately and
aggregate them, rather than scrape through the balancing gateway and see a different half each time.

This closes old item 83 without a Sentry account or DSN. Pino remains the structured error/event
record; Prometheus calculates p50/p95/p99 from histograms, and Grafana OSS is optional rather than
part of the hot path.

## Phase 42 — become local-first and strengthen groups — `done`

| # | Item | Status |
| --- | --- | --- |
| 127 | Durable IndexedDB snapshot and idempotent offline outbox | Done — [ADR 0017](adr/0017-durable-local-message-outbox.md) |
| 128 | Second group admin, demotion rules and owner-selectable invite permissions | Done — [ADR 0018](adr/0018-group-admins-and-invite-policy.md) |
| 129 | E2EE protocol and multi-device recovery decision | Done — MLS target and explicit browser-library/review gate in [ADR 0020](adr/0020-e2ee-readiness-boundary.md); the decision is not an E2EE claim |

Item 127 carries over the useful part of Telegram/Messenger-like local behaviour without adding a
service: recent sidebar/thread snapshots paint from IndexedDB, the current profile can restore only
on a true network failure, and unsent text/images survive a reload. Each draft id is persisted on the
server under a per-author partial unique index, so retries and two-tab races return one row and emit
one event. Expiring signed media URLs are deliberately not persisted; offline snapshots retain their
layout/metadata with an inert placeholder until HTTP supplies fresh URLs.

Item 128 adds an optional admin tier without weakening the single-owner invariant. Owner/admin can
rename and remove ordinary members; only the owner manages admins, ownership and the open versus
manager-only invite policy. Owner departure prefers a trusted admin as successor. Every real change
is transactional, logged in the conversation and broadcast in the shared DTO/event.

Item 129 resolves the design without pretending an unsafe implementation is progress. MLS is the
target; device verification, new-device history, encrypted media/recovery and the independent-review
plan are explicit. The maintained Signal TypeScript bridge is Node-native, OpenMLS does not yet list
WASM as a tested platform, and Matrix's browser crypto owns Matrix protocol state. Therefore Chatty
ships no cryptographic dependency or E2EE badge until ADR 0020's browser-library gates are met.

## Phase 43 — fast proof and recoverable operations — `done`

| # | Item | Status |
| --- | --- | --- |
| 130 | Changed-file local verification with incremental/cached static checks | Done — [ADR 0019](adr/0019-two-speed-verification.md) |
| 131 | Complete CI gate split into isolated database shards, web/static jobs and cached parallel image builds | Done |
| 132 | Encrypted database/upload backup and guarded restore commands | Done — encrypted local backup/mutation/restore drill passed; off-host destination remains a deployment choice |

The local gate now optimizes feedback rather than deleting coverage. `npm run verify` keeps full
typechecking, cached lint/format and the audit, while Vitest selects tests related to uncommitted
files. Global package/config/schema/migration/setup changes widen automatically. CI still runs every
test; two PostgreSQL-backed shards halve the serial bottleneck without letting test files truncate
one another's fixtures.

`npm run backup:prod` snapshots PostgreSQL and uploads together, hashes both and encrypts the bundle
to an age recipient before it leaves the host. Restore verifies those hashes, requires an explicit
destructive confirmation, stops writers and restores PostgreSQL in one transaction. Source code can
provide that mechanism. The local drill restored a four-user snapshot after a fifth user was written
and caught a dump portability bug in `immutable_unaccent`; the wrapper is now schema-qualified so a
restore's intentionally empty PostgreSQL search path is safe. The operator still has to choose an
off-host path and retention, then repeat the proven drill on deployed infrastructure.

## Phase 44 — realistic long-conversation demo data — `done`

| # | Item | Status |
| --- | --- | --- |
| 133 | Reusable API-seeded accounts and long mixed-media conversations | Done — `npm run seed:demo` |

The demo data is created through the same public HTTP routes as a real client. It therefore exercises
authentication, the conversation transaction, idempotent message keys, image normalisation and
thumbnails, voice transcoding, file storage, replies, mentions, links, pins and saved messages. The
two long threads exceed both the UI's 50-message page and the API's 100-message maximum page, so a
successful seed also proves that older-page cursors are needed and work. Fixed `clientId` values and
conversation matching make reruns converge instead of multiplying messages. The five reusable
identities include `admin.demo@chatty.test`, whose explicit admin role in the managed group makes the
permission boundary inspectable without guessing which ordinary-looking account was promoted.

## Phase 45 — release governance and delivery — `done`

| # | Item | Status |
| --- | --- | --- |
| 134 | Lockstep SemVer, changelog, immutable tags and gated GHCR/GitHub release delivery | Done — `v0.2.0-rc.1` |

Normal pushes retain the parallel complete CI gate without paying for a browser installation. A version
tag calls that same gate, adds real-browser E2E, then publishes version-addressed amd64/arm64 server and web
images plus a GitHub Release. Deployment is intentionally not automatic: the public host, domain and
off-host recovery destination are external operator choices, and a source tag must never guess where
live user data belongs. See [release conventions](conventions/releases.md).

## Phase 46 — attachment signing, download representation and realtime rendering — `done`

This phase refines [ADR 0016](adr/0016-bandwidth-first-message-delivery.md). The review corrected
claims about payload savings, MIME detection and Range support; the benefits below describe the
implementation rather than an uncommitted synthetic frame estimate.

| # | Item | Status |
| --- | --- | --- |
| 135 | Preserve opaque download lengths and byte ranges | `done` |
| 136 | Sign an attachment once per DTO | `done` — fewer signing operations, unchanged payload size |
| 137 | Subscribe Redis nodes only to relevant public rooms | `done` — coordinated adapter transition required |
| 138 | Skip thread renders for typing and unrelated presence changes | `done` — list and individual row memoisation |

### Item 135: preserve opaque download representations

`file-attachment.ts` retains detected safe MIME types such as JPEG, ZIP and PDF. Unknown types and
browser-executable formats become `application/octet-stream`, which the default compression filter
considers compressible. The custom filter excludes that type while retaining normal negotiation and
the 1 KB threshold for other responses.

Compression removes `Content-Length` and changes the transferred representation; it does not
inherently remove Range support. Keeping opaque downloads uncompressed preserves their stored
length and predictable byte ranges. This trades away bandwidth savings for compressible text uploads;
it is not a claim that every file is already compressed or that every FILE was previously gzipped.
The endpoint regression uses 8 KB, checks the full body and length, and verifies a 2 KB range with
`Accept-Encoding` enabled. The original 11-byte fixture could not detect removal of the filter.

### Item 136: reduce signing work, not serialized bytes

`buildAttachmentUrls(id, hasThumbnail)` signs once and embeds the token in both URLs. Ten images
with thumbnails therefore require ten signing operations instead of twenty. Both URL strings still
carry the token: there is no 5.2 KB payload saving. Token scope and expiry are unchanged, and reply
quotes retain the single-URL helper.

Two separately signed tokens whose `iat` values differ are both valid until their own expiries;
that timing boundary did not itself break thumbnails. Tests verify valid URLs and one signing call.

### Item 137: narrow Redis subscriptions

The classic adapter already publishes single-room emits on room channels, but every node subscribes
to a namespace wildcard. `createShardedAdapter` with default `dynamic` subscriptions limits delivery
of single-public-room broadcasts to nodes holding room members. Multi-room broadcasts and
`fetchSockets()` requests still use the namespace-wide channel. The existing Redis 7 compose services
and installed clients support this mode.

Classic and sharded nodes cannot exchange events. A deployment or rollback across this boundary
must switch the whole API pool together, as documented in
[deployment](DEPLOYMENT.md#changing-the-socketio-adapter). A small source diff is not proof of a
transparent rolling upgrade.

### Item 138: preserve the memo boundary

`MessageRows` is memoised. Read receipts, edit callbacks, pin IDs and conversation-scoped handlers
keep stable references across unrelated parent renders. The presence hook now also preserves each
unaffected conversation and its participants array, and preserves the full state on duplicate events.
Actual last-seen changes still update affected conversations, including a timestamp being withdrawn
with `null`. Tests cover these updates and reference preservation.

`MessageRow` is also memoised. The list passes shared, unbound action callbacks; each row binds
its own message and pin state only after React admits that row's update. The default shallow
comparison includes callbacks and all display props, so replacing a handler cannot leave stale
behavior behind. Existing action, editor, reaction and media components retain their contracts.

Regression tests use 200 messages: copying the list without changing rows renders no bubbles;
an edit or reaction renders the changed bubble; appending updates the previous tail and the new
row; trimming updates the new head. Pin state, replaced callbacks, current forwarded content and
moving read receipts are checked too. Neighbors still update when grouping changes, and participant
or shared callback changes may legitimately update more rows. This is not a claim that every event
always renders exactly one row.

### Local development entry point

Daily development uses web `http://localhost:5173` and API `http://localhost:4000`. Vite now refuses
an occupied dev port instead of silently choosing another origin. Docker's built web app stays on
8080, and E2E uses isolated ports 5273/4100. The [getting-started guide](../README.md#getting-started)
explains the modes, first-time setup and the API environment values.

## Verification bar

Nothing is "done" here until this passes, **and** an end-to-end run against the real API exercises the
actual behaviour — not just the types:

```bash
npm run verify
```

It chains cached whole-project typecheck/lint/format checks, changed-file tests and the audit, stopping
at the first failure. `npm run verify:full` replaces changed-file selection with every server and web
test. Use the full command for releases, security/auth, migrations and dependency changes; CI always
runs its equivalent in parallel. Both need **Node 22 or newer**: on Node 20 the web suite does not fail
a test, it fails to start inside jsdom with an error that looks nothing like a version problem.

The second half of that sentence is not optional. Phase 2 shipped an avatar endpoint that returned
500 for every request with all 75 server tests green — see CLAUDE.md, "Definition of done".
