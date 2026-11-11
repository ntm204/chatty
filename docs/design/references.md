# Design references — rules learned from other design systems, judged against Chatty

## How to use this file

- One dated `##` section per source; one `###` per topic, ≤ ~10 bullets, source URL under the heading.
- Each bullet is a concrete rule (number, do/don't, which variant when), then `→ Chatty:` **apply**, **done** or **skip** with the reason.
- Rules feed decisions; they never override `visual-direction.md` or owner choices (system UI font, warm paper,
  ink & pastel, grey silhouette avatars for people without a photo).
- Keep it short: rules, not essays. Close each section with a ranked "Top 10 to apply".

## Innovaccer Masala — 2026-11-11

Healthcare enterprise system (Nunito Sans, blue "Jal" primary, 4px radii). Borrow behaviour, spacing logic and
copy rules; not its look, which is sharper and colder than Chatty's paper surfaces.

### Avatar & AvatarGroup
<https://design.innovaccer.com/components/avatar/usage/> · <https://design.innovaccer.com/components/avatarGroup/usage/>
- Round = person, square (4px radius) = group/org; sizes 20/24/32. → Chatty: skip the square shape; a group shows two members' faces (Messenger) once one has a photo, else the owner's three-figure silhouette (`group-avatar.tsx`). Smallest stack face is 20px (`xs`).
- One colour per entity everywhere; neutrals only for fallback/overflow. → Chatty: done in spirit (photo or grey silhouette; no per-person colours).
- Hover tooltip with full name; presence dot only on regular/small round avatars; bot = icon. → Chatty: apply name tooltip where avatars stand alone (members, reactions).
- Group stack: max 2 shown + numeric "+N" whose popover lists hidden names (≥ group width, 176px, max-height 256px). → Chatty: done — shared `AvatarGroup` (`components/avatar`): up to 3 faces, past that 2 + "+N", names in tooltip/label, overlap cut out by CSS mask so it works on any background; used by seen-by.
- Don't put multiple initials in one group avatar. → Chatty: done (initials removed).

### Tooltip
<https://design.innovaccer.com/components/tooltip/usage/>
- Text 14px (regular) / 12px (small); padding 4px 8px; 4px gap from trigger; max width 256px, then it wraps — keep copy short. → Chatty: apply when adding a shared tooltip.
- Default side: bottom; top/left/right only when space forces it. → Chatty: apply (but top for composer buttons at the screen bottom).
- Tooltip = short plain text only; links, avatars, lists or metadata → popover. → Chatty: apply.
- Never put essential info, errors or warnings in a tooltip. → Chatty: apply; keep errors inline (`role="alert"`) as today.
- Every icon-only button gets a concise tooltip (Button page). → Chatty: apply — ~186 `aria-label`s but only ~8 `title`s; sighted mouse users can't read icon meanings.
- Truncated labels (chips, menu items, nav items, status) show the full text in a tooltip. → Chatty: apply to truncated conversation names/previews (the list already sets `title` on names).

### Popover
<https://design.innovaccer.com/components/popover/usage/>
- 8px offset from trigger, 16px inner padding, preferred side bottom, auto-flip when out of space. → Chatty: apply to reaction picker, mute menu, "+N" lists.
- 12 positions (side × start/center/end); align to the trigger edge, not the viewport. → Chatty: done mostly; check mobile picker bounds stay inside safe areas.
- Use for interactive or rich content (actions, inputs, avatars, lists); tooltip for plain text. → Chatty: done (reaction details are a panel, not a tooltip).

### Badge, Pill & Status hint
<https://design.innovaccer.com/components/badges/usage/> · <https://design.innovaccer.com/components/pills/usage/> · <https://design.innovaccer.com/components/statusHint/usage/>
- Badge = text label on an entity (20px high, max 160px, ≥ 8px from neighbours); Pill = a count (20px high, 10px radius, padding 2px 6px); Status hint = 8px dot + label for a resource's state. → Chatty: apply the split — "Admin", "Bot", "Muted" are badges; unread numbers are pills; online is a dot.
- Solid pill for a single standout count; subtle pill when many counts sit together (e.g. list rows). → Chatty: apply — muted chats' unread pill should be subtle (grey), unmuted solid.
- Badges are not interactive (hover may reveal info only). → Chatty: done.
- Cap counts (Masala gives no number). → Chatty: done (`MAX_UNREAD_BADGE_COUNT = 99`, tab title "99+").

### Chips
<https://design.innovaccer.com/components/chips/usage/>
- Selection chip = pick one or more with instant effect (filters); never for a single option. → Chatty: apply to inbox folders/filters (All · Unread · Groups).
- Action chip = contextual, content-dependent actions; buttons stay for persistent actions. → Chatty: apply to quick-reaction row and reply suggestions if added.
- Input chip = removable token inside an input; Enter creates, clear icon removes all. → Chatty: done-ish (`selected-participants.tsx` in new group/add members); add a "clear all" only if lists get long.
- 24px (regular) / 20px (small) high, 12px radius, 1px border, 8px side padding (2px next to a remove ×), max 256px then truncate + tooltip. → Chatty: apply to reaction chips' min height and truncation.
- States: default, hover, focus, active, disabled, plus selected variants of each. → Chatty: check reaction chips have a distinct "mine/selected" state with a focus ring.

### Toast vs Message vs Modal
<https://design.innovaccer.com/components/toast/usage/> · <https://design.innovaccer.com/components/message/usage/>
- Severity ladder: toast = low, after an action, auto-hides (5s); message = medium, inline, persists until resolved; modal = critical, before an action, blocks. → Chatty: apply as the decision rule.
- Toast: 360px wide, bottom-left, 32px from edges, one visible at a time, title required, ≤ 2 actions (also available elsewhere). → Chatty: skip a toast system for now — feedback is inline; add one only for undo ("Message deleted · Undo").
- Don't toast what the screen already shows (an edited message visibly changes). → Chatty: done.
- Inline message sits 4px under its component, spans its width; section message sits under the header. → Chatty: done (`connection-banner`, composer draft notices, `ThreadLoadError`).
- Alert messages stay until the problem is fixed; no dismiss button. → Chatty: done for the reconnect banner; verify action errors clear once the retry succeeds.

### Empty state
<https://design.innovaccer.com/components/emptyState/usage/> · <https://design.innovaccer.com/content/empty-states/>
- Three causes, three copies: first use (explain + first step), user action (no search/filter results → suggest changing terms/filter), error (say why + way out). → Chatty: apply — the inbox uses one "No conversations yet." for both first use and an emptied filter.
- Title required even when tight; description optional; ≤ 2 actions; illustration optional, icon or none in small spaces. → Chatty: done in vault tabs (icon + one line).
- Sizes: max 480×200 (page), 400×150 (card), 320×100 (compact). → Chatty: apply 320px max to sidebar/panel empty states.
- Never a dead end: pair with a next-step button. → Chatty: apply to empty inbox ("Find someone to chat with"), done on the welcome pane.
- Don't repeat the heading in the body; one exclamation mark at most; light humour only. → Chatty: apply when writing copy.

### Loading (Skeleton, Spinner, Response time)
<https://design.innovaccer.com/components/progressIndicators/usage/> · <https://design.innovaccer.com/patterns/uiStates/usage/> · <https://design.innovaccer.com/foundations/response-time/>
- Skeleton when the shape is known and data will exist (lists, avatars, message rows); spinner when the shape is unknown or the result may be empty (search). → Chatty: apply — sidebar, thread and panels show "Loading…" text; use skeleton rows instead.
- Skeleton imitates each piece separately (round avatar + two text bars). → Chatty: apply in `conversation-list.tsx` and thread first load.
- < 0.1s: no feedback; 0.1–1s: none needed; > 1s: show progress; > 10s: percent-done + cancel. → Chatty: apply — delay skeletons ~300ms so fast loads don't flash them.
- Avoid flicker: never show an element briefly then remove it. → Chatty: apply (same delay rule).
- Spinner sizes 12/16/32/48px; a button's own loading state replaces its label. → Chatty: done-ish (confirm button shows "Delete…"); keep.
- Load progressively, simplest view first. → Chatty: done (infinite scroll, outbox).

### Menu & Dropdown
<https://design.innovaccer.com/components/menu/usage/> · <https://design.innovaccer.com/components/dropdowns/usage/>
- Menu = commands only (edit, pin, delete); dropdown = choosing values. Never select options in a menu. → Chatty: done (message actions vs mute-duration choice — check mute uses radio-style checks, not plain commands).
- Popover ≥ trigger width; default 176px wide, max-height 256px, then scroll; long labels truncate + tooltip. → Chatty: apply these numbers to context menus.
- Group with dividers (different natures) or subheadings (complex sets); destructive items last, red, no nesting, no check/shortcut. → Chatty: apply — put Delete/Leave/Block at the bottom behind a divider.
- Arrow keys move through items; triggers: icon button, button or right-click. → Chatty: check arrow-key navigation in message and conversation menus.
- Checked item = a switch that applies immediately. → Chatty: apply for Mute / Pin toggles.
- Dropdown vs radios: > 5 options or tight space → dropdown; ≤ 5 → radios. → Chatty: apply in settings.

### Button
<https://design.innovaccer.com/components/button/usage/> · <https://design.innovaccer.com/content/button-guidelines/tabs/confusing-buttons/>
- Heights 24 / 32 (default) / 40px. → Chatty: skip exact sizes; keep touch targets ≥ 40px on phones.
- One filled primary per view; reassess priorities if you want two. → Chatty: done (yellow accent is the single CTA).
- Destructive filled only when it is the main action of the group; otherwise outline. → Chatty: done (confirm dialog).
- Labels start with a verb, sentence case, no punctuation or articles; same word for the same action everywhere. → Chatty: apply audit.
- Word pairs: Delete = permanent, Remove = take out of this view; Cancel = stop and close, Discard = throw away changes; Done = finished, OK = confirm; Create > New. → Chatty: apply — "Remove from group" vs "Delete for everyone", "Discard draft".
- Icon-only only when the icon is universal, always with a tooltip. → Chatty: apply (see Tooltip).

### Input
<https://design.innovaccer.com/components/inputs/usage/> · <https://design.innovaccer.com/content/placeholder-text/>
- Labels on top, short; left labels only under height pressure. → Chatty: done (`text-field`).
- Help text and inline errors go directly under the field, 4px gap. → Chatty: done in auth forms.
- Mark the minority: `*` on required if most are optional, "(optional)" if most are required. → Chatty: apply in profile/group forms.
- Character limits: show "typed / max", allow typing past, block submit. → Chatty: apply to bio, group name and long messages.
- Placeholder shows a real example or purpose, no trailing "…": "Write a message", not "Type a message…"; "Search by name or @handle", not "Search…". → Chatty: done for composer; apply to "Search people" → "Search by name or @handle".
- Textarea scrolls and grows. → Chatty: done (`use-autosize-textarea`, max-h-40).

### Modal / Dialog
<https://design.innovaccer.com/components/modals/usage/>
- Only for critical, before-action decisions; low severity → toast, complex content → side sheet. → Chatty: done (details pane is a side panel).
- Radius 8px, padding 16 top / 24 sides, min 64px from top and bottom, then the body scrolls with fixed header/footer; dividers only when scrolling. → Chatty: apply the "dividers only when scrolling" rule to long dialogs (pinned, bookmarks).
- Actions bottom-right, same order everywhere, primary last. → Chatty: done.
- Default focus on the secondary action so Enter can't confirm a delete. → Chatty: done (`confirm-dialog.tsx` focuses Cancel).
- Escape / outside click close simple dialogs only, not forms with input. → Chatty: check — a form dialog with typed text should not close on outside click.
- No long forms or multi-step flows inside a modal. → Chatty: done.

### Navigation (vertical) & Sidebar
<https://design.innovaccer.com/components/navigationVertical/usage/>
- Expanded width 256px, item height 36px, 16px icons, no gap between items. → Chatty: skip exact numbers (conversation rows are taller, Telegram-like).
- Max two levels; deeper → tabs inside the page. → Chatty: done (folders → list).
- Counts only on items that have no children; subtle pills when many counts are visible. → Chatty: apply subtle pills on folder counts.
- Truncate long labels + full text in tooltip; scrolling list gets a shadow/divider under the fixed header. → Chatty: apply the scroll shadow under the sidebar search bar.
- Active state: selected item clearly filled; parent shows active when its child is. → Chatty: done.

### Chat ancillary components
<https://design.innovaccer.com/components/chatAncillaryComponent/usage/>
- Date separator between days. → Chatty: done (`day-separator.tsx`).
- Unread separator shows the count and doubles as a link: tapping jumps to the oldest unread. → Chatty: apply — `unread-divider.tsx` is static text; the jump belongs on the scroll button or header ("12 new ↑").
- "New messages" marker disappears after leaving and returning to the chat. → Chatty: check `use-unread-divider` clears on re-entry.
- Typing: up to 3 names; more → "A, B and others are typing". → Chatty: done-ish (`typing-message.ts` switches to "N people are typing…"); naming two first is friendlier.

### Foundations — spacing, type, colour, states, motion
<https://design.innovaccer.com/foundations/layout/> · <https://design.innovaccer.com/foundations/typography/> · <https://design.innovaccer.com/foundations/states/> · <https://design.innovaccer.com/foundations/interactions/> · <https://design.innovaccer.com/foundations/opacity/>
- Spacing by relationship: 2px heading↔subheading, 4px within a group, 8px groups in a component, 12px within a section, 16px between sections; 4px baseline for text. → Chatty: apply as the review checklist for gaps.
- Three weights only (400/600/700); body 14/20, small 12/16, titles 16/24 and 20/32. → Chatty: apply — audit stray weights/sizes (`text-[13px]`, `[19px]`) and fold them into the scale.
- Text contrast ≥ 4.5:1 (WCAG AA). → Chatty: done (core pairs checked); check `text-ink-faint` placeholders and timestamps.
- States: hover one step darker, pressed two steps, disabled two steps lighter, loading = disabled + spinner; focus = 3px ring outside the element; selected = light accent wash (~48%). → Chatty: apply one shared focus ring and selected wash in `controls.css`.
- Opacity tokens 0.04 / 0.08 / 0.12 / 0.16 / 0.24 / 0.32 / 0.40 / 0.48 / 0.64 / 0.80. → Chatty: apply for hover washes and scrims instead of ad-hoc alphas.
- Productive motion (fast) for menus, hovers, reveals; expressive (slow) only for rare moments; enter = decelerate, exit = accelerate, things that come back = standard easing; longer travel = longer duration. → Chatty: done (welcome intro is the one expressive moment); apply easing split to popovers.

### Content — voice, errors, house rules
<https://design.innovaccer.com/content/voice-and-tone-guidelines/tabs/voice-and-tone/> · <https://design.innovaccer.com/content/error-messages/> · <https://design.innovaccer.com/content/house-rules/tabs/basics/>
- Friendly, direct, never robotic; "you", active voice, "they" when gender unknown. → Chatty: apply.
- Every error gives a way forward (try again, go back); short; no word "error", no jargon. → Chatty: apply — many fallbacks say "Could not … " with no next step, and `caught.message` can leak raw server text.
- Sentence case for messages and labels; complete sentences end with a period. → Chatty: apply consistently ("No conversations yet." has one; "Could not load bookmarks" doesn't).
- Connectivity: page-level load → error + "Try again"; same-page action → keep the reason visible until back online. → Chatty: done (connection banner + outbox).
- Tab title: most specific first, ≤ 45 characters. → Chatty: done ("(3) Chatty"); could add the open chat's name.

### Top 10 to apply in Chatty

1. Skeleton rows (avatar + two bars, shown after ~300ms) replace "Loading…" text — `sidebar/components/conversation-list.tsx`, thread first load, vault/bookmarks.
2. Tooltip on every icon-only button (bottom by default, 4px gap, max 256px) via one shared component — `components/`, header/composer/message actions.
3. Separate empty states by cause: first use (with "Find someone" button) vs empty filter vs search no-results — `conversation-list.tsx`, search panels.
4. Errors always carry a next step and never show raw server text — fallbacks in `features/chat/**/hooks` and `*-error.tsx`.
5. Unread divider becomes a jump target ("12 new ↑" jumps to oldest unread) and clears on re-entry — `thread/components/unread-divider.tsx`, `use-unread-divider`.
6. Menus: destructive items last behind a divider, 176px min width, arrow-key navigation, toggles as checks — message/conversation menus, `conversation-mute-menu.tsx`.
7. One focus ring (3px outside) and one selected wash across controls — `styles/controls.css`, `globals.css`.
8. Subtle grey unread pill for muted chats, solid for others; badges (Admin, Bot) vs pills (counts) vs dot (online) kept distinct — sidebar rows, group member rows.
9. Button-label and placeholder audit: verb first, Delete vs Remove, Cancel vs Discard, "Search by name or @handle" — dialogs, `new-conversation-panel.tsx`.
10. Type scale cleanup to 3 weights and 12/14/16/20 sizes; spacing by relationship (4/8/12/16) — `text-[13px]`/`[19px]` usages across feature components.

**Applied 2026-11-11.** 1 skeletons (`SkeletonList`, `MessageSkeleton`, 300ms delay) · 2 one app-wide `TooltipLayer`
· 3 `EmptyState` by cause (first visit with "Find someone", folders, archive, empty thread) · 4 `getErrorMessage`
(4xx/offline/`UserFacingError` only; every fallback ends "Try again.") · 5 `JumpToUnreadButton` until the rule is seen ·
6 destructive items last behind a separator, all menus ≥ 176px (toggles kept as explicit labels: "Pin"/"Unpin"
reads clearer than a check in a command menu) · 7 one 2px `heading` outline, offset 2px · 8 grey count for muted
chats, mentions stay coloured · 9 people search says "Search by name or @handle"; Retry labels already name their
object · 10 sizes on one scale (10/11/12/13/14/16/20/22), three weights — 13px body kept, since the owner approved it.

## Conversation row — Telegram, Messenger, WhatsApp — 2026-11-11

How the three lay out a chat-list row's small parts, and the arrangement Chatty adopts (`conversation-list.tsx`,
`conversation-row-meta.tsx`).

- Three columns: avatar · two text lines · a right column. The right column carries ticks + time on the name's
  line and the count (or a pin) on the preview's line. Telegram, WhatsApp. → Chatty: done.
- Colour goes to the count only; time stays grey even when unread (Telegram; WhatsApp tints the time, which
  doubles the signal). → Chatty: done — time no longer turns red.
- Your own last message shows ✓ sent / ✓✓ read beside the time (Telegram, WhatsApp). → Chatty: done, gated on
  your own receipt sharing like the thread's "Seen".
- Muted: a bell-off right after the name, and a grey count (Telegram). → Chatty: done.
- Pinned: a pin where the count would be, only when nothing is unread (Telegram). → Chatty: done.
- Mention: a separate "@" badge beside the count, not instead of it and not a tinted row (Telegram). → Chatty: done.
- Draft: "Draft:" in the accent before the text (Telegram). → Chatty: done.
- Actions: Telegram/WhatsApp desktop use right-click; Messenger shows a round ⋯ on hover that replaces the
  right column. → Chatty: hover swaps the whole right column for ⋯; on touch ⋯ keeps its own lane so time and
  count stay readable (a long-press opens the preview).

