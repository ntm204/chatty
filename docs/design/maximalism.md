# Chatty — a colorful place for your people

The September 2026 visual direction is nostalgic maximalism, requested by the owner. It replaces
the earlier monochrome editorial identity without changing messaging, privacy or account contracts.

## Visual language

- Butter-yellow stationery, cobalt ink, tomato-red accents, lilac and mint papers.
- A serif wordmark with an asterisk flower; expressive fixed English headings; Geist for all user
  content, including Vietnamese, and Geist Mono for handles, timestamps and compact labels.
- Layered postcards, a smile stamp, tape, ink borders and offset shadows. The welcome collage is
  CSS and existing Lucide icons, so it needs no remote artwork or additional dependencies.
- Grid paper on welcome screens, a subtle dotted conversation canvas and solid message bubbles.
  Decorations never cover messages, attachments, inputs or controls.
- Midnight plum surfaces and paired accent inks in dark mode; the existing Light/Dark/System
  preference and pre-paint theme script remain the source of truth.

## Surfaces

Authentication screens share the new branded split layout, with a compact introduction and stacked
form on phones. The chat sidebar has a yellow masthead, lilac selection and mint account strip.
The empty workspace has a welcome collage and a working action that focuses people search.
Conversation headers carry a four-color edge; bubbles, date labels, avatar frames and the composer
share the stationery treatment. Conversation details use the same framed surface. Profile and
appearance settings have colored navigation and headers, with horizontally scrollable categories
on small phones so the form retains space.

Shared buttons, fields, palette tokens, radii and shadows carry the design into secondary dialogs,
menus, search, media and account forms. Validation errors are linked to their inputs. Motion is
limited to short entry/press feedback and respects reduced-motion preferences.

## Implementation

`apps/web/src/styles/globals.css` owns the light/dark design tokens and existing motion utilities.
`apps/web/src/styles/maximalism.css` owns scoped visual surfaces and responsive rules. Functional
components expose semantic class names instead of having global utility classes restyled by
substring selectors. Fonts remain self-hosted; the existing CSP stays intact. The favicon is local.

No new dependency, API, database migration, analytics, external font or image service is required.

## Validation

- Production web build.
- Repository verification: typechecks, lint, formatting, 229 related web tests and zero audit hits.
- 15 existing Chromium end-to-end scenarios against the real API and isolated test database:
  account/profile, password recovery, keyboard focus, button affordances, theme persistence,
  two-person realtime messages, image delivery and conversation search.
- Browser visual review of desktop and phone authentication, welcome, conversation, emoji and
  settings surfaces in light/dark themes. Screenshots use isolated mock data, not real accounts.
