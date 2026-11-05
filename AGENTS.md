# Working on Chatty — agent process

The single source for **how an agent works** in this repository (Codex reads this file; `CLAUDE.md`
imports it). Code rules live in `CLAUDE.md` and `docs/conventions/`. To change the process, edit this
file only — do not restate it elsewhere.

## Communicate

- Answer the owner's actual question first, in Vietnamese unless asked otherwise. Keep it brief:
  outcome, evidence, remaining limits. App copy, code comments and commits stay in English.
- Give a conclusion, not a survey. Report failures with the actual output; never call unverified
  code working.
- Never commit, push, publish or wipe development data without an explicit request in the same turn.
  Never `checkout` / `reset` / `clean` over uncommitted work.

## Where things go — no new places

Every kind of information already has a home. Update it there; do not create a new file for it.

| Information | Home |
| --- | --- |
| Agent process (this) | `AGENTS.md` |
| Code rules, checklists | `CLAUDE.md`, `docs/conventions/<area>.md` |
| Decision expensive to reverse | new `docs/adr/NNNN-*.md` — the only routine new file |
| What is done / next | `docs/ROADMAP.md` |
| XP progress | `docs/plans/experience-polish.md`; counts via `node scripts/check-experience-progress.mjs --json` |
| Findings, test evidence, known limits | newest dated section of `docs/plans/acceptance-2026-09-25.md` |
| Setup and commands | `README.md` |

- No new reports, logs, review notes, READMEs, scripts or configs unless the owner asks or the code
  needs one. Prefer deleting stale material to adding more; Git keeps history.
- When behaviour changes, update the places that describe it in the same change (see `CLAUDE.md`).
- Reuse existing components and helpers. No dependency or abstraction without a concrete need.

## Work in small batches

- 1–3 items per batch, each with explicit acceptance criteria. Freeze the batch, then check it.
- Search with `rg` first; read only the relevant sections of large documents.
- Subagents only when the owner asks: at most two, each owning separate files, returning short
  findings with evidence. The primary agent alone runs database and browser tests.

## Run and check

- Start: `docker compose up -d postgres mailpit`, `npm run dev:server`, `npm run dev:web`
  (web 5173, API 4000). Preserve env files and dev data; install/generate/migrate only when needed.
- While editing: focused checks. Then **one** gate per frozen batch:
  - `npm run verify` (5 min) — normal changes.
  - `npm run verify:full` (10 min) — release, security/auth, schema, dependency changes. Not both.
- Browser: `npm run test:e2e -- e2e/<name>.spec.ts` for the affected flow; `npm run test:e2e:smoke`
  (3 min) for the core. Full `test:e2e` (15 min) only for release or broad regression. WebKit only for
  engine-specific changes; `test:e2e:built` only for CSP/offline/media. Never chain every browser.
- A failure or timeout is a finding: read the first failure, fix, rerun only that check. Do not raise
  budgets, add retries, or repeat a green suite without a relevant change.
- Physical device / assistive-technology acceptance is out of scope (owner, 2026-11-05). Keep it
  documented as unverified; do not ask for it or add emulation runs to compensate.
- Record command, date, environment and result in the acceptance report. Never mark an XP done
  while one of its criteria is unverified.
