# Frontend conventions (`apps/web`)

> Adapted from **Dev Rules** by Trần Anh Tuấn (evondev) — MIT licensed, https://speaknowenglish.org.
> The Next.js App Router add-on from that bundle is **not** used here: chatty's web app is React + Vite.
> Changes from the original: React 18 (not 19), `react-router` links, raw `<img>` allowed, Vite path alias.

Every rule below is concrete enough to be checked with `grep` — `scripts/audit-rules.sh` does exactly that.

---

## Folder structure — feature-based, not layer-based

Code is grouped by **what it does for the user**, not by what kind of file it is. A "components/", "hooks/", "utils/" split at the top level means a single feature's code is scattered across four folders; grouping by feature means everything for chat lives under `features/chat/`.

```
apps/web/src/
├── features/
│   ├── auth/
│   │   ├── pages/        # route-level components
│   │   ├── components/   # components private to auth
│   │   ├── hooks/        # hooks private to auth
│   │   ├── utils/        # pure helpers private to auth
│   │   ├── constants/    # constants private to auth
│   │   └── types/        # types private to auth
│   └── chat/             # same shape
├── components/           # SHARED UI — used by 2+ features
├── hooks/                # shared hooks
├── utils/                # shared pure functions (cn.ts lives here)
├── lib/                  # third-party client setup (socket.ts)
├── api/                  # HTTP client for the backend
├── constants/            # shared constants
├── types/                # shared types
└── styles/               # globals.css
```

### The one rule that matters most

**Never import across features.** `features/chat` must not import from `features/auth`. If two features need the same thing, move it up into the shared `src/` folders.

Why this one is non-negotiable: cross-feature imports are how a codebase turns into a ball of mud. Once `chat` imports from `auth`, deleting or reworking `auth` becomes a whole-app problem instead of a one-folder problem. The shared folders are the *declared* contract; a cross-feature import is an undeclared one.

Anything repeated in 2+ features (a button, an input, a date formatter) becomes shared. When creating a shared component:

- One folder per component: `src/components/button/`
- Filename kebab-case: `button.tsx`
- Ship an `index.ts` that re-exports it
- Keep it simple first, extend on demand — do not design for requirements that do not exist yet

---

## Component rules

- **One file = one component.** No helper components (`Avatar`, `MessageRow`, ...) declared alongside the main one — split them out.
- **Filenames are kebab-case**: `message-list.tsx`, `login-form.tsx`. On macOS rename with a temp name in between (`mv a.tsx tmp && mv tmp A.tsx`) — the filesystem is case-insensitive, Linux CI is not.
- Every declared hook must be used. Delete unused ones.
- Fix all TypeScript errors and warnings. Do not ship code with red squiggles.
- **Logic repeated in 2+ places gets extracted**: a custom hook in `hooks/` if it touches state/lifecycle, a pure function in `utils/` if it does not.
- **Before creating a new util / hook / constant, grep for it first** across `src/utils`, `src/hooks`, `src/constants` and `src/features/*/{utils,hooks,constants}`. A name clash — or a *job* clash — means it already exists. Reuse it, or lift it to shared if it currently lives in another feature. Never create a second copy.
- **Over ~300 lines is a signal to split**, not a hard cap. The usual smell: one component owning a state machine plus several phase screens (`loading`, `empty`, `list`, `error`). Move each phase's render into a child and keep the state in the parent.

---

## Naming

- **Names describe meaning.** No single letters or vague abbreviations: `a`, `p`, `res`, `tmp`, `val`, `obj`, `arr`, `fn`, `cb`, `e`. The only exception is `i` in a plain `for` loop.
- Functions start with a verb: `handleSubmit`, `fetchMessages`, `parseResponse`, `validateEmail`.
- Functions returning a boolean use `is` / `has` / `should` / `can`: `isValidEmail`, `hasPermission`.
- Boolean variables use the same prefixes: `isLoading`, `hasError`, `canEdit`. Never `flag`, `status`, `check`.
- Callback parameters in `.map` / `.filter` / `.forEach` get real names too: `message` not `m`, `event` not `e`.
- An async function stored in a variable gets a `Promise` suffix: `const messagesPromise = fetchMessages()`.

---

## TypeScript

- **`interface` for object shapes.** `type` is still correct for unions, intersections, mapped and conditional types.
- **No inline types in a signature** — declare them at the top of the file:

  ```tsx
  // Wrong
  function MessageRow({ message }: { message: MessageDTO }) {}

  // Right
  interface MessageRowProps {
      message: MessageDTO;
  }
  function MessageRow({ message }: MessageRowProps) {}
  ```

- **Props interfaces are named `<ComponentName>Props`**, never the generic `Props`. A file full of `Props` types is unsearchable.
- **Constants get an explicit type** — do not let TypeScript infer the shape of a constant array:

  ```ts
  interface NavItem {
      label: string;
      href: string;
  }
  const navItems: NavItem[] = [ ... ];
  ```

- Types that cross the wire (what the API returns, what a socket event carries) live in **`packages/shared-types`**, not here. If the server and the client both need to know a shape, it belongs in the shared package so a change breaks the build on both sides instead of at runtime on one.
- This project is on **React 18**, so `React.FormEvent` / `React.FormEventHandler` are fine. (They are deprecated on React 19; revisit this line when upgrading.)

---

## Constants and utils

- **Constants declared inside a component file move out** to the feature's `constants/`. Name them by meaning: `emptyStateMessages`, not `data`.
- **Helper functions tied to a constant move to the feature's `utils/`**, not the component file.
- **Types used by constants, or shared within a feature, live in the feature's `types/`** — not in the constants file, not in the component file.

---

## Barrel exports (`index.ts`)

Any `components/`, `hooks/`, or `utils/` folder with 3+ exports gets an `index.ts`:

```ts
// index.ts — explicit names
export { Button } from "./button";
export { Input } from "./input";
```

**Never `export * from`.** Named re-exports keep every symbol traceable back to a file — `export *` makes "where does this come from?" a whole-folder search, and it silently re-exports whatever a file adds later.

---

## State inside a component

- Group semantically related `useState` calls into one object:
  - `email` + `password` → `const [fields, setFields] = useState({ email: "", password: "" })`
  - `emailError` + `passwordError` → `const [errors, setErrors] = useState({ email: "", password: "" })`
- Do **not** group unrelated state, or state with different lifecycles. Two things that change for different reasons belong in two `useState` calls.

---

## Code style inside a function

- Blank line between distinct logical blocks.
- **Always a blank line between the logic and the `return`**:

  ```tsx
  // Right
  export function MessageList({ messages }: MessageListProps) {
      const sorted = [...messages].sort(byCreatedAt);

      return <ul>{sorted.map(renderMessage)}</ul>;
  }
  ```

- Each field validation is its own `if`. No unnecessary nesting.
- A validate function collects into one object and calls `setState` **once**:

  ```ts
  function validate() {
      const nextErrors = { email: "", password: "" };

      if (!fields.email.trim()) nextErrors.email = "Email is required";
      if (!fields.password) nextErrors.password = "Password is required";

      setErrors(nextErrors);
      return !nextErrors.email && !nextErrors.password;
  }
  ```

- **Every `eslint-disable` needs a comment above it explaining why.** If you cannot explain it, do not disable it — fix the code so lint passes.

---

## className — use `cn()`

The project uses Tailwind CSS with the `cn()` helper (`@/utils/cn`).

- **Never build classes with `.join(" ")` or template strings with nested ternaries.**
- One condition per line:

  ```tsx
  // Wrong
  className={["px-3 py-2", isActive ? "bg-ink" : "bg-rule-soft"].join(" ")}

  // Right
  className={cn(
      "px-3 py-2",
      isActive && "bg-ink text-paper",
      isDisabled && "opacity-50",
      !isActive && !isDisabled && "bg-gray-100",
  )}
  ```

- Complex class logic goes into a helper function outside the JSX, never inline.

`cn()` is not cosmetic: `twMerge` resolves conflicting Tailwind utilities so a caller's `className` prop can actually override a component's defaults. String concatenation cannot do that — in CSS the more specific rule wins, not the last one in the string.

---

## Colour and type — the palette is declared, not chosen

Every colour a component names comes from `@theme` in `src/styles/globals.css`. There is no
`bg-slate-100` in this app and there must not be one: it renders perfectly well and is simply the
wrong colour on a page that has no other grey on it. `scripts/audit-rules.sh` section 29 fails the
build on any numbered Tailwind swatch, and on `bg-white` / `text-black` — the paper is ivory, and
pure white beside it reads as a rendering bug.

**There are two themes, and a component never mentions the second one.** `[data-theme="dark"]` in
the same file redefines the same token names; a component written against `bg-paper text-ink` is
already correct at night. The ladder is preserved rather than mirrored — paper still steps sunken →
base → raised and ink still steps faint → soft → full — so anything that leaned on "raised is lighter
than base" keeps being right. A `dark:` variant exists and is keyed to the same attribute rather than
to `prefers-color-scheme`, but reaching for it is nearly always a sign the palette is missing a token:
use it only where no colour can express the difference, such as deepening a scrim.

Three tokens exist precisely because they must **not** invert with the theme, and using `ink`/`paper`
in their place is the bug they were extracted to fix:

| Token | For |
| --- | --- |
| `paper`, `paper-raised` | the sheet, and anything sitting on top of it |
| `ink`, `ink-soft`, `ink-faint` | text, in three strengths |
| `rule`, `rule-soft` | hairline borders and separators |
| `signal` | **only** an unread count, the conversation you are in, and something you cannot undo |
| `signal-soft` | the ground under a destructive hover, and a search hit |
| `live` | presence, which is a different kind of fact from a notification |
| `tint-*` / `tint-*-ink` | avatar grounds, always used as a pair — via `@/constants/avatar-colors` |
| `block` / `block-ink` | the app's one solid fill: a message you sent, a group avatar. **Not** `bg-ink text-paper` — those two invert together, and a dark theme would answer with a white slab across half the thread |
| `scrim` | behind a dialog or a lightbox. Goes *blacker* in dark rather than lighter, because a scrim's job is to darken what is behind it |
| `on-media` | type and chrome drawn on a photograph or a scrim. The one token that is the same in both themes, because a stranger's picture knows nothing about the reader's theme |

Three fonts and one rule about when each applies:

- `font-sans` (Archivo) is everything you read.
- `font-display` (Instrument Serif) is the wordmark and a dialog's title. Nothing else.
- **`font-mono` (IBM Plex Mono) is anything a machine produced** — a timestamp, a handle, a count, an
  avatar's initials. That one rule is most of the personality, so two utilities exist to spend it in
  one place rather than in forty files:
  - `eyebrow` — a label, byline or status: mono, uppercase, tracked out, 10px.
  - `meta` — a machine's own output: mono, tabular, 10.5px, so a number changing width does not
    shift the row it sits in.

  Neither sets a colour. That is the caller's, which is what keeps `eyebrow text-signal` from being a
  fight between two classes.

Fonts are **self-hosted** through `@fontsource/*`, imported at the top of `globals.css`. Not a
preference: `nginx.conf.template` sets `style-src 'self'; font-src 'self'`, and a `<link>` to Google
Fonts needs both relaxed. Add a weight by importing it there, and only if the design uses it.

Icons get square caps and mitred joins from one base-layer rule, because lucide ships them round and
a rounded tick beside a hairline border belongs to a different drawing.

---

## Dialogs

`hooks/use-dialog.ts` is the only focus trap. It gives a `<div role="dialog">` Escape-to-close, Tab
wrapped inside the panel, and focus moved into it on open; the caller owns the state and passes a
**stable** `onClose` — a new function each render re-binds the listener.

Use it for anything that covers the page. Do not write a second one: two copies of a focus trap are
two chances for one of them to lose a case, which is why the edit-history dialog and the settings
dialog share this one.

A dialog is not automatically the right answer. `GroupMembersPanel` deliberately stayed an inline
panel — it acts on the conversation on screen, and covering the thing you are editing the membership
of is worse than sitting above it.

**A dialog's size is fixed, not driven by how much content it happens to hold.** Use a fixed height
(`h-[…]`, not `max-h-[…]`) and let the content scroll inside it — one pinned message and twenty must
open the same size. A modal that grows and shrinks with its content reads as the interface resizing
itself under the reader.

A menu or dropdown opened from inside a dialog is portalled to `<body>` (see `ConversationActions`
for the pattern: a ref-measured position, `fixed`, rendered via `createPortal`), never absolutely
positioned inside the dialog's own scroll container — a clipped or dialog-stretching menu is the bug
this avoids.

---

## UI elements — one source per element type

The principle: **every kind of UI element has exactly one source, and nothing bypasses it.** What chatty declares:

| Element | Source |
| --- | --- |
| Buttons | `Button` from `@/components/button` (build it before the first button) |
| Icons | `lucide-react` |
| Images | raw `<img>` (no Next.js here — no image component to enforce) |
| Internal links | `Link` from `react-router-dom`. Plain `<a>` only for external URLs or `target="_blank"` |

**Icons**: never inline an SVG for an icon and never add a second icon library. If `lucide-react` lacks one, add a named `IconXxx` under `src/components/icons/` that takes `ComponentProps<"svg">` and spreads it:

```tsx
import type { ComponentProps } from "react";

export function IconSpark(props: ComponentProps<"svg">) {
    return (
        <svg viewBox="0 0 24 24" fill="none" {...props}>
            {/* path data */}
        </svg>
    );
}
```

Data graphics drawn from numbers (charts, progress rings) are not icons — an inline `<svg>` is fine there, but leave a comment saying so, otherwise the audit flags it and the next reader cannot tell it was deliberate.

---

## Tests

Tests live in `apps/web/tests/`, mirroring `apps/server/tests/` — one rule across the repo rather
than two. Run them with `npm run test --workspace apps/web` (Vitest + Testing Library, jsdom).

- **Query the way a user would**: `getByRole("button", { name: "..." })` and `getByLabelText(...)`,
  not CSS classes or test ids. A test that only breaks when the markup changes shape is testing the
  markup, not the behaviour — and one that keeps passing after the accessible name disappears is
  worse than no test.
- **Pure functions first.** `utils/` are the cheapest things to cover and the easiest to get subtly
  wrong (`getConversationTitle` differs per viewer; `formatMessageTime` depends on the clock).
- **Pin the clock** with `vi.setSystemTime` for anything date-dependent, or the suite passes all day
  and fails at midnight.
- **One version of Vitest for the whole monorepo.** Two copies — even at the same version number —
  are two module instances, so `expect.extend` from a setup file lands on one and the tests run on
  the other, and every custom matcher silently disappears. `npm dedupe` after adding a workspace.

## Running the audit

```bash
bash scripts/audit-rules.sh apps/web/src
```

It reads the **Conventions** block in the root `CLAUDE.md` and skips checks that do not apply. Output is one section per rule with `file:line`. It is a report, not a gate — a hit is a place worth a look, not a verdict. Sections 3–7 (cross-feature imports, raw button / img / svg / a) are the ones that cause real bugs; fix those first.
