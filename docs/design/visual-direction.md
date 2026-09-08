# Chatty — current visual direction

The owner selected [chatty.net](https://chatty.net/) on 2026-09-08 as the visual reference for the
whole messaging application, replacing the earlier nostalgic maximalism treatment. The subsequent
refinement keeps the palette and type while reducing promotional decoration and keeping entry
screens within the viewport.

## Reference and application

The reference was inspected in a browser on desktop and phone, including its actual font and color
styles. Core colors are navy `#06038d`, yellow `#fbc80b`, violet `#5750fe` and lavender `#e6e6f4`.
Clash Display 700 supplies the bold fixed headings; General Sans supplies interface text, with
self-hosted Geist as a fallback and Geist Mono for handles/timestamps. The mark is a CSS chat bubble
with two eyes and a lowercase wordmark. The eyes follow the pointer within a few pixels, blink
occasionally and wink on hover. Pointer inactivity recenters them; hidden pages pause blinking
and reduced motion disables the effect. It replaces the former serif/asterisk identity.

The website's visual language is applied to this application's existing product: real conversations,
groups, media and account settings. Its commercial sales copy, customer claims, pricing and Shopify
calls to action are not part of this messaging application.

- Authentication uses a compact masthead, a short introduction beside the real form and faint
  static radial backgrounds. Phones show the form alone. There are no decorative conversations,
  floating badges, grain or blurred rings. Login and registration fit ordinary laptop/phone
  viewports; only the form can scroll when validation, zoom or a keyboard requires extra room.
- The masthead's Get started action switches to the actual registration form. Account help opens
  password recovery. Existing sign-in, registration and recovery behavior remains in place.
- The chat welcome screen uses a compact icon, quiet sans-serif heading and a working Find your
  people action that focuses search. Its content stays centered within the conversation pane
  without scrolling or clipping the heading on short laptops.
- The inbox, conversation header, composer, secondary panels and account settings use white/lavender
  surfaces, rounded edges and soft shadows. Outgoing messages are navy and actions are yellow.
- Dark mode uses midnight surfaces, pale violet headings and faint violet washes. Existing theme
  preference persistence, reduced-motion handling, safe areas and keyboard focus are preserved.
- The old collage component, stationery colors, grids and maximalism stylesheet are removed.

## Implementation

`apps/web/src/styles/globals.css` owns paired semantic tokens and existing motion utilities;
`surfaces.css` contains scoped surface styling and responsive layouts; `fonts.css` declares local
fonts. Shared Brand and AmbientBackground components keep the visual language aligned
across authentication and chat without importing across features.

Fontshare's original fonts are obtained from the foundry CDN by
`apps/web/scripts/prepare-fonts.mjs`, called automatically by the web predev and prebuild scripts.
Content hashes pin the exact files, including cached copies. The first run needs network access;
subsequent runs work from the local files. The font binaries are git-ignored because their license
permits self-hosting but restricts source redistribution. The original license accompanies the
setup in `apps/web/src/assets/fonts/LICENSE.txt`. Each checkout obtains its own copies. Vite emits
fingerprinted assets, so deployed browsers still request fonts only from the application's origin.
The existing Docker build also invokes prebuild; no CSP relaxation or runtime font CDN is required.

## Verification

Completed validation:

- Production web build (the existing 500 kB main-chunk advisory remains).
- `npm run verify`: typechecks, lint, formatting, 480 server tests, 445 web tests and zero audit hits.
- 15 existing Chromium end-to-end scenarios for account/profile, recovery, affordances, theme
  persistence, two-person realtime messages, image delivery and conversation search.
- Desktop/phone chat, emoji and settings review in light/dark themes using isolated mock data.
- Authentication/registration at 320, 390, 768, 1024 and 1440 px in both themes: no horizontal
  overflow or uncaught browser errors. Get started, mode switching, linked validation errors and
  recovery navigation were exercised. Reduced-motion rendering was checked.
- `e2e/entry-layout.spec.ts` covers login/registration at 1440×800, 1280×650, 390×844 and
  320×568 in both themes, short-window validation and keyboard access, and a welcome pane down to
  1024×480. It checks actual content bounds and scrolling, including the search action.
- The chat-theme browser regression verifies menu dismissal, preview/cancel, two-client theme
  sync, reload/reset and mobile picker bounds. The pinned-message scenario also verifies the
  compact 40px bar and preserved navigation.
- Core text/control color pairs exceed 4.5:1 in both themes. This is a palette check, not a claim
  of a complete accessibility audit.

Browser screenshots use isolated mock data; end-to-end tests use the isolated test database and
real API. Fonts are served locally, with no browser request to Fontshare or chatty.net.
