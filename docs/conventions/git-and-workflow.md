# Git and workflow conventions

Rules for how work enters the repository. These matter more, not less, as the project grows — a history you can read is how you answer "why is this line here?" two years later.

---

## Commit messages — Conventional Commits

```
<type>(<scope>): <subject>

<optional body: why, not what>
```

**Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`.

**Scope** is the workspace or module: `server`, `web`, `auth`, `messages`, `shared-types`, `deps`.

```
feat(auth): add password reset flow
fix(messages): reject sends from non-participants
refactor(web): extract message list into its own component
docs(conventions): document the socket room strategy
```

Rules:

- Subject in the imperative, lowercase, no trailing period: "add", not "added" or "Adds".
- **The body explains *why*.** The diff already shows what changed; what it cannot show is the reasoning, the alternative you rejected, or the bug that prompted it.
- One logical change per commit. A commit that touches auth, restyles a button, and bumps a dependency is a commit that cannot be reverted.

---

## Branches — work goes to `main`

**Commit and push straight to `main`.** This is a one-person repository, and the branch-and-PR shape it started with was ceremony rather than review: PR #1 stayed open across five phases and was merged by the same person who wrote every commit in it. A review step with nobody on the other side of it is a delay, not a safeguard.

What actually protects `main` is the gate below, plus CI — which runs on every push to `main`, not only on pull requests. That is the part worth keeping, and it is unchanged.

Branch only when the work would leave `main` broken while it is in progress: a migration that has to land with an application change deployed separately, a spike you may throw away, anything you want a second machine to try before it is real. Then it is still `<type>/<short-description>` — `feat/group-chat`, `fix/socket-reconnect` — short-lived, and merged rather than left open.

**This is the owner's rule, and only the owner's.** `main` is protected: a pull request and a green `verify` are required for everyone else, and the protection deliberately does not apply to administrators. So the repository being open source did not change how its author works, and outside contributions still arrive the way they should — through a pull request that CI has already read. See [CONTRIBUTING.md](../../CONTRIBUTING.md).

The exemption is a consequence of the repository having one regular author, not a view about review. The moment there is a second, turn on "include administrators" and this section becomes a description of history.

---

## Before you push

```bash
npm run verify           # cached static checks + tests related to changed files
```

Clean, on Node 22 or newer. "It works on my machine" is not a state that survives a second machine — and pushing to `main` means the next thing that reads a broken commit is CI, or a deployment.

Run `npm run verify:full` before a release and after security/auth, migration or dependency changes.
CI always runs the complete suite in parallel; see [ADR 0019](../adr/0019-two-speed-verification.md).
Version bumps, annotated tags and release artifacts follow [the release conventions](releases.md).

Checklist:

- [ ] the appropriate quick or full gate passes
- [ ] New env vars added to `.env.example` in the same commit
- [ ] Schema change has a migration committed alongside it
- [ ] No `console.log`, no commented-out code, no `any`
- [ ] Types crossing the wire live in `packages/shared-types`, not duplicated
- [ ] A decision that shapes future work is written down — a comment for a local one, an ADR under `docs/adr/` for an architectural one

---

## Architecture Decision Records

Any decision that is **expensive to reverse** gets an ADR in `docs/adr/`, numbered, using the shape of [`0001-tech-stack.md`](../adr/0001-tech-stack.md): Status, Context, Decision, Consequences.

Write one for: swapping a core library, changing the auth model, splitting a service out, choosing a deployment target. Do not write one for: adding a component, fixing a bug, renaming a file.

The value is in the **Consequences** section — the trade-offs you knowingly accepted. That is the part nobody remembers a year later, and it is the part that tells the next person whether the decision still holds.

---

## AI agents

Agent boundaries (commits, pushes, which checks to run) live only in [AGENTS.md](../../AGENTS.md).
