# ADR 0019: Changed locally, complete in parallel on CI

## Status

Accepted.

## Context

The complete gate reached 471 PostgreSQL-backed server tests, 309 web tests and roughly 100 seconds
on the development machine. Most of that time was the server suite: its files intentionally share
one disposable database and therefore cannot run concurrently inside one process.

Running all of it after every small component or service edit made feedback slower without adding
proportional confidence. Removing tests would be the wrong optimization: logic, realtime behaviour
and database invariants are the product. The useful distinction is between feedback while changing
one dependency graph and proof before a change is accepted.

## Decision

Verification has two speeds:

- `npm run verify` is the local feedback loop. TypeScript remains whole-project but incremental;
  ESLint and Prettier reuse content caches; Vitest's changed-file graph runs tests statically related
  to uncommitted files; the architecture audit still scans the repository.
- Changes to package/config files, the Prisma schema or migrations, and global test setup force the
  corresponding complete suite. These files affect execution without always appearing in a static
  import graph.
- `npm run verify:full` remains the complete local gate and is required for releases, security/auth
  changes, migrations and dependency upgrades. It is available whenever the changed-file selection
  is in doubt.
- CI always runs the complete gate. The server suite is divided into two Vitest shards, each with an
  isolated PostgreSQL service. Web tests, static checks and the two Docker image builds run as
  independent jobs. A final stable `verify` job depends on all of them.
- A flow change runs its relevant Playwright spec locally. Full Playwright remains a release check;
  starting two servers and a browser after an unrelated utility edit is not useful feedback.

The repository is public, so parallel standard GitHub-hosted runners do not add an Actions bill.
Docker builds use the GitHub Actions layer cache, scoped separately for the server and web images.

## Consequences

### 2026-11-05: bounded local runs

The earlier policy did not bound the complete process or make the short browser path obvious.
`scripts/run-check.mjs` now supervises each gate, prints per-step duration, preserves failures,
and cancels workers (including detached browser/server descendants) on timeout or interruption.
Budgets: quick/changed 5 minutes, full/unit 10 minutes, smoke 3 minutes, full browser 15 minutes,
built browser 5 minutes, plus up to 5 seconds for cleanup. Playwright also has its own global deadline;
local full runs stop after 3 failures and smoke after 1. Zero retries remain unchanged.

The smoke config reuses 7 existing scenarios from chat/sending/outbox; it adds no duplicate specs.
Affected flows run their explicit spec. Full browser coverage remains a release/broad-regression
gate; WebKit/built checks are selected by the behaviour changed, not automatically chained.
An E2E PostgreSQL advisory lock prevents concurrent fixture resets; migration setup has a 60-second
deadline. Web unit workers default to 2 locally, with an explicit environment override.
CI still runs all unit tests, now with job deadlines and supervisor regression tests.
Physical device evidence is excluded by the owner from current work, retained as unverified.

Do not run quick then full for the same frozen batch, repeat passed suites, silently extend a
timeout, or keep launching browser batches after a failure. A timeout requires diagnosis, not retry.

- A normal local verification reuses type/lint/format work and runs only tests that can import the
  change, while a schema or dependency change automatically widens the gate.
- CI retains every test and image build. Parallelism reduces wall time rather than coverage.
- Static dependency selection cannot see arbitrary dynamic imports or behavioural coupling through
  external state. That is why `verify:full` remains explicit and CI is authoritative before release.
- Server tests stay serial inside each shard, preserving their per-test `TRUNCATE` isolation. The
  concurrency boundary is two separate databases, not two writers racing in one database.

## Sources

- [Vitest changed-file and shard options](https://vitest.dev/guide/cli)
- [GitHub Actions billing for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
