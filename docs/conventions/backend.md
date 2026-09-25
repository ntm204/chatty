# Backend conventions (`apps/server`)

The frontend rules are adapted from an external ruleset; these are chatty's own, derived from how `apps/server` is already built. Same spirit: concrete enough to point at a file and say "this breaks rule X".

---

## Layering — routes → controller → service

Every feature is a folder under `src/modules/<feature>/` with the same four files:

| File | Job | Must NOT |
| --- | --- | --- |
| `*.schema.ts` | Zod schemas + inferred input types | contain logic |
| `*.routes.ts` | map HTTP verbs/paths to controllers, apply middleware | contain logic |
| `*.controller.ts` | parse input, call one service, shape the response | contain business rules or DB calls |
| `*.service.ts` | business logic + database access | know it was called over HTTP |

A fifth file is allowed only to break an import cycle, and only when it holds no logic of its own.
`modules/messages/messages.mapper.ts` is the one instance: `conversations.service` needs the same
`messageSelect` and `toMessageDTO` that `messages.service` uses, but `messages.service` already
imports `assertParticipant` from `conversations.service`. Importing back would put a module-level
const (`conversationSelect`) in the other module's temporal dead zone, so which of the two loaded
first would decide whether the server started. If you reach for a fifth file for any other reason,
the thing you are adding probably belongs in `lib/`.

The rule that makes this worth the extra files: **a service must not know what called it.** No `req`, no `res`, no status codes in a service — it takes plain arguments and returns plain data or throws.

That constraint is what lets the WebSocket layer reuse the exact same code path. `sockets/index.ts` handling a `message:send` event and `POST /conversations/:id/messages` both call `messagesService.sendMessage(...)`. If the service took `req`, the socket handler would have to fake one, and the two paths would drift apart until sending a message over the socket behaved differently than over HTTP.

Practical test: if you are writing an `if` that is not about parsing input or choosing a status code, it belongs in a service.

---

## Validation at the boundary

**Every route validates its input with a Zod schema before anything else touches it.**

```ts
export async function sendMessageController(req: Request, res: Response): Promise<void> {
    const input = sendMessageSchema.parse(req.body);   // throws ZodError -> 400
    const message = await messagesService.sendMessage(req.userId!, req.params.conversationId!, input);

    res.status(201).json(message);
}
```

`.parse()` (not `.safeParse()`) is deliberate: a `ZodError` propagates to the error middleware, which turns it into a 400 with field details. Handling it inline would mean every controller re-implements the same response shape.

Past that line, input is trusted — services take typed arguments and do not re-validate. One boundary, checked once.

---

## Errors — throw typed, format once

Services throw the typed errors from `lib/errors.ts` (`NotFoundError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`). The single `errorHandler` middleware maps each to a status code.

- **Handlers never `try/catch` to format an HTTP response.** One place decides what a `NotFoundError` looks like on the wire.
- **Never leak internals.** An unrecognized error logs the full detail server-side and returns a bare `500` — no stack traces, no driver messages to the client.
- Register `errorHandler` **last**, after all routes.

## Rate limiting

`POST /auth/register` and `POST /auth/login` sit behind the limiters in
`middlewares/rate-limit.ts`. Register is capped tighter than login: a person signs up once, so a real
user never approaches the limit, while enumerating registered addresses needs volume.

Two constraints to keep in mind:

- **Limiters run before controllers.** A rejected request must not reach the database, or probing
  costs the attacker the same as a real signup.
- **Counters use Redis when `REDIS_URL` is set and process memory otherwise.** Memory is correct for
  one server and wrong for two — each instance keeps its own tally and the effective limit
  multiplies. A shared store is a prerequisite for running more than one instance, not an
  optimisation; production Compose always provides it.

### Choosing the right error is a security decision

- Wrong password → `UnauthorizedError`, **not** `NotFoundError`. A different response for "no such email" versus "wrong password" tells an attacker which emails are registered.
- Non-participant requesting a conversation → `NotFoundError`, **not** `UnauthorizedError`. "You may not see this" confirms the conversation exists; "no such thing" does not.

---

## Database (Prisma)

- **One shared client**, `lib/prisma.ts`. Never construct a `PrismaClient` per request — Prisma pools connections internally and a per-request client exhausts Postgres.
- **`select` what you need instead of fetching then deleting fields.** Never let `passwordHash` leave the service layer:

  ```ts
  // Wrong — the hash exists in memory and one careless `res.json(user)` leaks it
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  delete (user as Partial<typeof user>).passwordHash;

  // Right — it is never selected
  const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, email: true, displayName: true, avatarUpdatedAt: true, createdAt: true },
  });
  ```

- **Schema changes go through a migration** (`npm run db:migrate --workspace apps/server`), never a manual `psql` edit. The migration files are the history; a hand-edited database is a database nobody else can reproduce.
- **Multi-write operations use a transaction** (`prisma.$transaction`). Creating a conversation and its participants is one unit — a conversation with no participants is corrupt data.
- **Custom SQL invariants stay visible.** Prisma 5 cannot model partial indexes or deferred
  cross-row triggers. Message-author constraints and the non-empty group's admin floor are enforced
  by migrations and documented beside the schema. ADR 0021 supersedes the historical single-owner
  constraint; do not restore that old uniqueness rule or replace database invariants with app-only checks.
- Indexes are part of the schema, not an afterthought: `Message` already has `@@index([conversationId, createdAt])` because "load a conversation's recent messages" is the app's hottest query.

---

## Authorization — check membership in the service, every time

Every conversation-scoped operation verifies the caller is a participant, **inside the service**, before doing anything else:

```ts
const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: currentUserId } },
});
if (!participant) throw new NotFoundError("Conversation not found");
```

Not in a middleware, not in the controller. Middleware runs per-route, but services are reachable from both HTTP and sockets — a check that lives in middleware is a check the socket path skips.

Authentication (who you are) is the middleware's job — `requireAuth` for HTTP, the `io.use()` handshake for sockets. Authorization (what you may touch) is the service's.

**Two roles: ADMIN and MEMBER, with equal standing among admins.** `assertParticipant` checks
membership; `assertAdmin` protects group administration, including rename, removing others,
role changes and invite policy. Inviting follows the group's EVERYONE/MANAGERS policy; leaving
remains available to each participant. A non-empty group retains an admin through transactional
succession. [ADR 0021](../adr/0021-flatten-group-roles-to-admin-member.md) is authoritative;
ADRs 0006/0008/0018 describe superseded role models, not current authorization rules.

`assertAdmin` throws `ForbiddenError` (403), not `NotFoundError` (404). The 404 exists to stop
outsiders probing for conversation ids; someone already in the group has nothing left to learn, and a
404 leaves the UI unable to say why the button did nothing.

### Conversation writes are serialised per conversation

Add, remove, rename and send all take a PostgreSQL row lock on `Conversation` with
`SELECT ... FOR UPDATE`, then re-check membership/role **inside the interactive transaction**. A
pre-check may still exist to avoid expensive attachment work, but it is never the authority: a user
can be removed between two statements.

Keep the order the same in every future membership-sensitive operation:

1. open the transaction and lock `Conversation`;
2. authorize against the locked state;
3. write every durable part of the transition, including system messages and admin succession;
4. return the final rows and let the transaction commit;
5. only then join/leave socket rooms and emit events.

Do not emit from a helper that writes inside the transaction. PostgreSQL can roll back; Socket.IO
cannot. See [ADR 0010](../adr/0010-serialize-conversation-writes.md).

---

## Config and secrets

- **`process.env` is read in exactly one place**: `config/env.ts`, validated with Zod at startup. Everything else imports `env`.

  Why: a missing `JWT_SECRET` should stop the process at boot with a clear message, not surface three hours later as a confusing runtime error in one request handler.

- **Never log secrets.** No tokens, password hashes, or `JWT_SECRET` in log output — logs get shipped to places with different access rules than the database.
- `.env` is gitignored. `.env.example` is committed with placeholder values, and every new variable gets added to it in the same commit.

---

## WebSocket handlers

- **Handlers stay thin** — same rule as controllers. They authenticate, then call a service.
- Authentication happens once in `io.use()` during the handshake, using the same JWT and the same payload shape as `requireAuth`. **If the token shape changes, both change in the same commit.**
- Emit through `getIO()` from `lib/socketBus.ts`, never by importing `sockets/index.ts` — that file registers handlers that call back into services, so importing it from a service is a circular import.
- Broadcast to **rooms**, not to a hand-maintained map of socket IDs. Room membership is derived from the database (which conversations the user is in); a map in memory desynchronizes the moment a second server process exists.

---

## Naming

Same core rules as the frontend (verbs for functions, `is`/`has` for booleans, no `res`/`tmp`/`obj`), plus:

- Files are kebab-case, with the module prefix: `messages.service.ts`, not `service.ts`. A stack trace showing five files named `service.ts` is a stack trace you have to decode.
- Service functions are named for the domain action: `sendMessage`, `listConversationsForUser`. Not `handleX` (that is a controller/handler word) and not `doX`.
- Controllers end in `Controller`: `sendMessageController`. It makes the layer obvious at the import site.

---

## Testing

- **Services get unit tests; controllers generally do not.** The logic worth testing lives in services, and they are plain functions — no HTTP mocking needed.
- One behavior per `it`, named for the behavior: `it("throws ConflictError when the email is already registered")`.
- Test the error paths, not just the happy path. The authorization checks above are exactly the kind of thing that silently regresses.
- Run with `npm run test --workspace apps/server` (Vitest).

---

## Things that are always wrong here

- `console.log` in committed code — use `logger` from `lib/logger.ts`.
- `any` — if the type is genuinely unknown, use `unknown` and narrow it.
- Business logic in `routes.ts` or `controller.ts`.
- A `process.env.X` read outside `config/env.ts`.
- Returning a Prisma `User` object straight to the client.
- Swallowing an error into a `200`.
