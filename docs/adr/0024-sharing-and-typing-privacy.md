# ADR 0024: Personal sharing and typing privacy

## Status

Accepted (2026-11-15). Adds `User.allowMessageForwarding` and `User.typingIndicatorsEnabled` in migration
`20261114090000_sharing_and_typing_privacy`, and a Privacy section in settings that now also holds read
receipts, last seen and the new-chat timer from [ADR 0023](0023-disappearing-and-protected-messages.md).

## Context

ADR 0023 protects chosen messages and chats. The owner also asked for standing, personal choices that other
messengers offer: limiting what others may do with what you write (KakaoTalk-style sharing restriction) and
hiding activity signals — "typing…" and "Seen" (Messenger). "Seen" already existed as a symmetric setting.

## Decision

- **Allow forwarding** (default on). Read when a forward happens rather than stamped on each message, so
  turning it off covers messages already sent. The server refuses to forward someone else's message whose
  author has it off (`ForbiddenError`, checked again under the conversation lock); your own messages are
  always yours to forward. `MessageDTO.isForwardable` carries the current answer so the menu and the image
  viewer drop "Forward", the bulk copy writes a placeholder, and the bubble is not text-selectable. Bookmarks
  stay allowed: they keep a message privately, they do not share it. The settings sentence says that copying
  text and screenshots cannot be fully stopped.
- **Typing indicator** (default on), **symmetric** like read receipts: off, the server stops relaying this
  person's `typing:start` (a stop always goes through so an indicator never strands) and their client stops
  showing anyone else's. The server check is cached per socket for the same five seconds as the block check.
- **Per-chat sharing restriction** (`Conversation.restrictSharing`, migration
  `20261115100000_conversation_sharing_restriction`), like WhatsApp's Advanced Chat Privacy: nobody may
  forward or save messages out of that chat, whoever wrote them. Changed like the disappearing timer —
  either person in a direct chat, admins in a group — and always announced by name, so it cannot be lifted
  quietly to forward something. It is deliberately **not** folded into `MessageDTO.isForwardable`: it rides
  on the conversation, which updates live for everyone, while a message's flag is frozen into copies already
  held. Clients combine the two; the server checks both at forward time.
- **Live updates**: changing "Allow forwarding" emits `user:forwarding-changed` to every conversation the
  person is in, and clients patch the messages already on screen; the chat restriction arrives with
  `conversation:updated`. Browser tests found both gaps — messages kept "Forward" until a reload.
- **Privacy section**: read receipts, typing indicator and forwarding are switches; last seen and the
  new-chat timer are one-row segmented controls. Each applies immediately and rolls back with a reason if
  refused — no Save button for one-tap choices.

## Consequences

- Typing and read receipts remain account-wide; Messenger has no per-chat override for them either.
- A recipient can still select text through developer tools or photograph the screen; the restriction is a
  server-enforced rule for forwarding and a deterrent elsewhere, and is described that way.
- Rejected: hiding typing one-way. Seeing others while hiding yourself is the arrangement people are right
  to call unfair, which is why read receipts were made symmetric in the first place.
