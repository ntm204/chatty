# ADR 0011: A transactional outbox for outbound mail

## Status

Accepted.

## Context

Password reset is the only feature in this project that reaches outside it. Phase 3 built the flow
against a `Mailer` interface with one console implementation, which was the right call and left one
question open: what happens when the send does not.

The phase 7 answer was `void promise.catch(log)`. Delivery had to leave the request path — a slow or
failing provider runs only for an address that has an account, so awaiting it turns latency or a 500
into an account-enumeration oracle, which is precisely what the endpoint's generic 204 and 300ms
floor exist to prevent. Detaching the send solved that and bought it with the mail itself: one
attempt, no retry, and a process that dies between the token committing and the send completing
loses the message with nothing left behind to say it was ever owed.

That last failure is the bad one. The token is live, so the account is in a state it only reaches
because somebody asked for a link — and that somebody is never told. From their side the reset
silently did nothing. They try again, and if the provider is having a bad minute, again.

ADR 0010 named this too, for socket events: "guaranteed delivery would require a transactional
outbox." Mail is where it is actually needed, because a lost socket event is repaired by a reload
and a lost email is not repaired by anything.

## Decision

**A message is a row, written in the transaction that promised it.** `enqueueMail` takes a
`Prisma.TransactionClient` rather than reaching for the global client, and `requestPasswordReset`
calls it inside the same transaction that mints the token. "This link is live" and "we owe this
person the link" become one commit. If the token write rolls back, so does the promise to mail it.

The request path gains one local INSERT and never touches a provider. This is strictly better for the
enumeration property than the code it replaces: the old version started the send during the request
and merely declined to await it, so a provider slow enough still competed with the response.

**A worker delivers, retries, and eventually gives up.** Every instance runs one. Claims take
`FOR UPDATE SKIP LOCKED`, so two instances step over each other's rows rather than both sending the
same message — a duplicated reset mail is two links where the person was promised one. Failures back
off exponentially, six attempts spanning about fifteen minutes, which is longer than most provider
blips and comfortably inside the link's own hour. Retrying past that would deliver a dead link.

**Every value compared against the database clock is written by the database.** `nextAttemptAt` is
`@default(dbgenerated("CURRENT_TIMESTAMP"))` rather than `@default(now())`, and the retry schedule is
`NOW() + make_interval(...)` in SQL rather than a `Date` from this process. Prisma evaluates `now()`
in the client, and the claim compares against PostgreSQL's `NOW()`; on a real deployment the app and
the database are different hosts, and a machine a few milliseconds ahead writes a row that is not yet
due the instant it is created. This was found by a test suite that passed four runs in five, and it
would have shipped as mail that sometimes just sits there.

**The body is emptied the moment there is nothing left to send**, on success and on final failure
alike, enforced by a check constraint rather than by the worker remembering. The uncomfortable part
of an outbox for password reset is that the body contains a working link, so between commit and
delivery a live key to an account sits in a table in plaintext. There is no way around holding it —
the mail cannot be sent without it. The mitigations are that the window is one poll interval rather
than an hour, that the token's own TTL bounds the worst case, and that a settled row carries nothing.
`lastError` is kept, because whoever reads this table after an incident needs the reason and does not
need the link. It is the same argument, and the same mechanism, as `Message.deletedAt`.

**The provider is a connection string.** *(Amended in phase 10 — this section originally said the
transport must stay a code change.)*

The original argument was that an env var is dangerous, because a half-configured provider that
silently falls back to the console is how a password reset appears to work in production and reaches
nobody. That is right about the failure and wrong about its cause: the danger is the silence, not the
variable. `MAIL_TRANSPORT` now selects between `console` and `smtp`, and every way of getting it wrong
stops the boot — no transport chosen, `smtp` without a server or a sender, an `SMTP_URL` missing its
scheme, or `console` in production. None of them degrade.

SMTP rather than a provider's HTTP API, so the choice of provider is a connection string instead of a
dependency and a client to maintain. The cost is provider-specific features this app has no use for —
templates, analytics — and one it eventually will: bounce webhooks.

## Consequences

- `OutboxMessage` has no foreign key to `User` and is truncated explicitly in tests. A queued mail
  outlives the row that caused it on purpose: an account deleted mid-flight must not silently cancel
  a message already promised to that address.
- Delivery is now at-least-once with a best effort at exactly-once. The claim counts its attempt and
  takes a two-minute lease in the same statement, so a process dying mid-send does not hand the row
  to another instance immediately. Rows are claimed one at a time, just before their own send, and
  SMTP timeouts keep that send under the lease; the counted attempt fences completion, so a worker
  whose lease was taken over cannot overwrite the newer claim's outcome. A process dying *after* the provider accepted but *before*
  `markSent` still produces a duplicate. Making that impossible needs an idempotency key the provider
  honours, which is a provider decision rather than one this table can make.
- Settled rows are swept after thirty days by an hourly timer (phase 10). PENDING is never eligible,
  whatever its age: a provider outage lasting longer than the window leaves a backlog of old pending
  rows, and a sweep that went by age alone would delete the work instead of the record of it.
- Nothing observes what happens after the SMTP server says yes. A hard bounce, a rejected recipient
  or a spam complaint is invisible, because acceptance is not arrival. Handling that needs the
  provider's webhooks, and is the first thing that would justify leaving plain SMTP.
- The worker polls every five seconds rather than being woken by the write. A queue would deliver
  faster; a five-second floor on an email nobody is watching arrive is not worth a second piece of
  infrastructure, and Redis is optional here on purpose.
- This is not a general job queue and should not become one. Everything about the table is shaped by
  mail: a recipient, a rendered body, and the fact that sending twice is worse than sending late.
  Anything else that needs durable background work should be judged on its own failure modes rather
  than pushed through this one because a table already exists.
