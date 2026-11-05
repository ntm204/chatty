# Working on Chatty

- Answer the user's actual question first, in Vietnamese unless requested otherwise.
  Keep explanations brief; report outcomes, evidence and remaining limits. Application
  copy and code comments stay in English.
- Read `CLAUDE.md` and the convention file for the area being changed. Reuse existing
  components and helpers. Do not add dependencies or abstraction without a concrete need.
- For current progress, use the ledger in `docs/plans/experience-polish.md` and the
  newest dated section of `docs/plans/acceptance-2026-09-25.md`. `docs/ROADMAP.md`
  records history. Read relevant sections rather than entire large documents.
  Run `node scripts/check-experience-progress.mjs --json` for counts and open items;
  it also checks the README summary against the ledger.
- Search with `rg` before opening files. Limit output to matching sections, retain
  useful findings and avoid rereading unchanged material. Do not install skills just
  to increase their number; use a skill only for a workflow it actually supports.
- Use subagents only when the user requests delegation. Keep at most two active,
  give each independent file ownership and request short findings with evidence.
  The primary agent coordinates database and browser tests.
- Prefer small batches (usually 1–3 items) with explicit acceptance criteria.
  Freeze the batch before broad checks; repeat passed suites only for a relevant
  change or failure. Surface missing device evidence early instead of extending
  an automated run to compensate for it. Honor the user's scope and usage limits.
- Everyday start: `docker compose up -d postgres mailpit`, then `npm run dev:server`
  and `npm run dev:web`. Web: 5173; API: 4000. Preserve existing environment files
  and development data. Install/generate/migrate only when needed.
- Run meaningful focused checks while editing, then `npm run verify`. Use
  `npm run verify:full` for release/security/schema/dependency changes. Run browser
  suites sequentially: `npm run test:e2e`,
  `npx playwright test --config playwright.webkit.config.ts`, and built-web checks
  when CSP/offline/media are affected. Never overlap E2E runs against `chatty_e2e`.
  For slow Windows bind mounts, use the optional test stack in README with
  `CHATTY_TEST_POSTGRES_PORT=5433`; development remains on 5432.
- Record the command, date, environment and actual result. Browser emulation does
  not prove physical keyboard, touch, native notifications or screen reader behavior.
  Never mark an XP done while one of its acceptance criteria remains unverified.
- Update the existing ledger, acceptance report and affected descriptions in the
  same change. Derive counts from the ledger; do not create competing progress logs.
- Do not commit, push, publish or wipe development data without an explicit request.
