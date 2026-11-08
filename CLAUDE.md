# Chatty — project rules

Read this before writing any code. It holds the **code** rules; the conventions block below resolves
the "the project's X" references in the detailed rule files. How an agent works — scope, batches,
which checks to run, where information goes — lives only in [AGENTS.md](AGENTS.md):

@AGENTS.md

| Where | What it covers |
| --- | --- |
| **[docs/ROADMAP.md](docs/ROADMAP.md)** | **What is done, what is next, and why in that order. Read this first when picking up the project.** |
| [docs/PRODUCT-DIRECTION.md](docs/PRODUCT-DIRECTION.md) | Which social-product ideas fit Chatty, the free-first constraint, and how future features are selected |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the system fits together and why |
| [docs/conventions/frontend.md](docs/conventions/frontend.md) | React / TypeScript rules for `apps/web` |
| [docs/conventions/backend.md](docs/conventions/backend.md) | Node / Express / Prisma rules for `apps/server` |
| [docs/conventions/git-and-workflow.md](docs/conventions/git-and-workflow.md) | Commits, why work goes straight to `main`, the pre-push checklist |
| [docs/conventions/releases.md](docs/conventions/releases.md) | SemVer, lockstep workspace versions, tags, release gates and artifacts |
| [docs/adr/](docs/adr/) | Why each major technical decision was made |

---

# Conventions (edit once, everything else reads from here)

`scripts/audit-rules.sh` parses this block — keep the keys and the backticks exactly as they are.

- Framework: `React (Vite)` <!-- not Next.js: the Next-only audit checks stay off -->
- Path alias: `@/` <!-- -> apps/web/src; declared in vite.config.ts AND tsconfig.json -->
- Filenames: `kebab-case`
- Types: `interface over type` <!-- `type` still correct for unions/intersections/mapped types -->
- React version: `18` <!-- turns off the React.FormEvent rule; revisit on upgrade to 19 -->
- Styling helper: `cn()` <!-- @/utils/cn — Tailwind CSS v4 + clsx + tailwind-merge -->
- Colours: `design tokens only` <!-- @theme in src/styles/globals.css, plus a [data-theme="dark"] block redefining the same names; a numbered Tailwind swatch is a bug, audit 29 catches it -->
- Fonts: `system UI (SF Pro / Segoe UI / Roboto) + General Sans wordmark` <!-- interface in the platform face, as Telegram does; General Sans downloaded during predev/prebuild for the logo only -->
- Button: `Button from @/components/button` <!-- build it before the first button is needed -->
- Icons: `lucide-react`
- Images: `raw <img> allowed` <!-- no Next.js image component in a Vite app -->
- Internal links: `react-router Link` <!-- plain <a> only for external URLs or target="_blank" -->

---

# Scope — which rules apply where

This is a monorepo. The two apps do **not** share a structure, and applying one's rules to the other
produces nonsense:

- `apps/web` → feature-based (`src/features/<name>/{pages,components,hooks,utils,constants,types}`).
  Governed by [frontend.md](docs/conventions/frontend.md).
- `apps/server` → layered modules (`src/modules/<name>/{schema,routes,controller,service}`).
  Governed by [backend.md](docs/conventions/backend.md).
- `packages/shared-types` → only types that cross the wire between the two. No logic, no dependencies.

Naming, TypeScript, and code-style rules apply everywhere. Folder-structure rules do not cross apps.

---

# Language

- Code comments and commit messages: **English**
- User-facing copy: **English**
- **Comments explain *why*, not *what*.** A comment restating the line below it is noise — delete it.
  A comment explaining a non-obvious constraint, a rejected alternative, or a subtle bug is the
  most valuable thing in the file.

---

# Component checklist — before finishing any `.tsx`

- [ ] **One file = one component.** No helper components declared alongside the main one.
- [ ] **Pure constants** (not derived from props/state) moved to the feature's `constants/`.
- [ ] **Helper functions** (formatting, calculation) moved to the feature's `utils/`.
- [ ] **Buttons / icons / images from the declared source only.** No mixing.
- [ ] **Every colour from the palette.** `bg-slate-100` renders fine and is the wrong colour on a page
      with no other grey on it. Anything a machine produced — a time, a handle, a count — is mono.
- [ ] **No inline object type** in the signature — declare a `<ComponentName>Props` interface.
- [ ] **Blank line before `return`** when there is logic above it.
- [ ] **No duplicate helper.** Grep before writing `formatTime`, `getInitials`, ... — used in 2+ places
      means it belongs in `utils/`.
- [ ] **No cross-feature import.** `features/chat` must never import from `features/auth`.

---

# Server checklist — before finishing any module

- [ ] Input validated with a Zod schema at the controller boundary, via `.parse()`.
- [ ] No business logic in `routes.ts` or `controller.ts`.
- [ ] Service takes plain arguments — no `req` / `res` / status codes, so the socket layer can reuse it.
- [ ] Conversation-scoped operations re-check participant membership **inside the service**.
- [ ] Errors thrown as typed errors from `lib/errors.ts`, never formatted inline.
- [ ] `passwordHash` never selected into anything that reaches a response.
- [ ] New env var added to `.env.example` and to the schema in `config/env.ts`.
- [ ] Schema change has a committed migration.

---

# When behavior changes, update what describes it

If you change how something behaves — a limit, a count, a step in a flow — **in the same turn**, grep
and update every place that describes it: [docs/ROADMAP.md](docs/ROADMAP.md), README,
ARCHITECTURE.md, `.env.example` comments, UI copy, error messages.

This has already gone wrong once: three roadmap items were finished while the README still listed
them as known gaps and quoted a stale test count. Anyone reading it would have believed the wrong
thing. Tick the roadmap row in the same commit as the work.

No linter catches documentation that contradicts the code, and nothing burns trust faster. **Grep the
old wording before saying you are done.** When unsure, ask rather than guess.

---

# Definition of done

Pass the gate [AGENTS.md](AGENTS.md#run-and-check) picks for the batch (`verify` or `verify:full`,
Node 22+; see ADR 0019). Two things the gate does **not** do, and you are responsible for both:

1. **Run the thing.** A green suite means the types agree and the units behave. It does not mean the
   feature works. Phase 2 shipped an avatar endpoint that returned 500 for every request while all 75
   server tests passed — Express refuses to serve a path containing a dot segment, and the upload
   directory is `.data/uploads`. Nothing that tests a service can see that. Exercise the real API,
   then add the test that would have caught it.

   The affected-flow browser spec uses a real browser/server/database, but it is not a substitute
   for exercising the change by hand either: it found that attaching an image and pressing Enter dropped the picture, and it found
   that only because someone wrote a spec that pressed Enter.
2. **Update what describes the behaviour.** See the section above. No linter reads prose.

## The audit is a report, not a verdict

`scripts/audit-rules.sh` greps. It cannot see most of the component checklist above, and its blind
spots are **specific and knowable** — every one of these got through a clean run and had to be found
by reading the checklist against the diff:

| It checks | It misses |
| --- | --- |
| constant *arrays* in feature component files | object maps, and anything under `src/components/` |
| boolean *state* (`useState`) missing an `is`/`has` prefix | a plain `const startsRun = a !== b` |
| — | types declared in a component file that belong in `types/` |
| — | a Tailwind default swatch where a design token belongs |

Sections 26-29 were added to close exactly those four. Assume the next gap is equally invisible:
when a change adds files, read the **Component checklist** at the top of this file against them by
hand. A 0-hit audit is evidence, not proof.
