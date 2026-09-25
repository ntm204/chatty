# Contributing to Chatty

Contributions are welcome — issues especially. This started as a project for learning how a
production-grade chat system is actually put together, and a second pair of eyes on a decision is
worth more to it than a feature.

## The shortest useful thing you can do

**Open an issue.** Disagree with a trade-off, spot a bug, find a place where the docs and the code
say different things — that last one is the most valuable report this repository can receive, because
no linter catches it. You do not need a patch attached.

## Running it

Setup lives in the [README](README.md#getting-started) and is three commands. Two traps worth
knowing before you spend an afternoon on them:

- **Node 22 or newer.** On Node 20 the web test suite does not fail a test, it fails to *start*, with
  an error from inside undici that looks nothing like a version problem.
- **One test run at a time.** `apps/server/tests/setup.ts` truncates every table before each test, so
  a second run against `chatty_test` — another terminal, a watch mode left open — deletes the first
  one's fixtures mid-test. It surfaces as unique-constraint failures scattered across unrelated
  files, which reads as a broken suite rather than a busy database.
- **Voice tests use the bundled ffmpeg binary.** `ffmpeg-static` is installed with the server package;
  if its install script cannot provide a binary for your platform, voice encoding and its HTTP tests
  cannot run. A system `ffmpeg` is intentionally not used as a silent fallback.

## Before you open a pull request

```bash
npm run verify     # cached static checks + tests related to your changes
```

Green, on Node 22+. Use `npm run verify:full` for security/auth changes, migrations, dependency
upgrades and releases. CI always runs the complete suite in parallel shards, so the quick local gate
changes waiting time rather than the amount of code checked before acceptance.

`npm run test:e2e` is **not** part of `verify` — it needs two servers and a browser download — and it
is what you should run for anything touching a flow rather than a function. It has earned its place:
it found that attaching an image and pressing Enter dropped the picture, which every unit test
missed because each one clicked the button it meant.

A green suite is not the same as a working feature. Phase 2 shipped an avatar endpoint that returned
500 for every request with all 75 server tests passing — Express refuses to serve a path containing a
dot segment, and the upload directory is `.data/uploads`. **Exercise the real thing, then add the
test that would have caught it.**

## What a good pull request looks like here

Read [CLAUDE.md](CLAUDE.md) first — it is short, and it resolves the "the project's X" references
everything else makes. Then:

- **Commits are [Conventional Commits](docs/conventions/git-and-workflow.md)**, and the body explains
  *why*. The diff already shows what changed; what it cannot show is the alternative you rejected or
  the bug that prompted it.
- **Comments explain why, not what.** A comment restating the line below it is noise. A comment
  explaining a non-obvious constraint or a subtle bug is the most valuable thing in the file.
- **If behaviour changes, update everything that describes it in the same commit** — the roadmap row,
  the README, `.env.example` comments, error messages, UI copy. This has gone wrong here before:
  three roadmap items were finished while the README still listed them as known gaps.
- **A schema change ships with its migration.** New env vars go in `.env.example` *and* the schema in
  `apps/server/src/config/env.ts`.
- **A decision that shapes future work gets written down** — a comment for a local one, an
  [ADR](docs/adr/) for an architectural one. The Consequences section is the part that matters.

Small, focused pull requests get read and merged. One that touches auth, restyles a button and bumps
a dependency is one that cannot be reverted.

## Where the work is

[docs/ROADMAP.md](docs/ROADMAP.md) records completed phases and their decisions. The active backlog is
the [experience polish plan](docs/plans/experience-polish.md); use its XP ledger for current acceptance
status, since the older roadmap sections describe historical gaps. CSP, last-seen privacy,
orphan cleanup and accent-insensitive search have already been implemented.

Object storage remains deferred until measured capacity or a multi-host deployment requires it.
Public deployment has external conditions in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Branches and review

`main` requires a pull request and a green CI run for everyone except the repository owner, who
pushes to it directly — this is a one-person project and a review step with nobody on the other side
of it is a delay rather than a safeguard. That changes the moment there is a second regular
contributor; see [docs/conventions/git-and-workflow.md](docs/conventions/git-and-workflow.md).

If you are not a collaborator, fork the repository and open the pull request from your fork. That is
the normal path and nothing about it is second-class.

## A note on how this repository is written

Chatty is built with an AI agent in the loop, and the boundaries it works inside are written down in
[docs/conventions/git-and-workflow.md](docs/conventions/git-and-workflow.md) rather than left
implicit. That is relevant to you in one way: the unusual density of *why* in the comments and the
roadmap is deliberate and load-bearing, because it is what stops the same argument being had twice.
Please keep it up in what you write.
