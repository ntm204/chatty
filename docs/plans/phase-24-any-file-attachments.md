# Phase 24 — an attachment that is not a picture

Historical implementation plan. [Phase 47](../ROADMAP.md#phase-47--quieter-message-surfaces-and-direct-actions--done)
updates the composer interaction: selecting an ordinary file sends it immediately without a caption
or reply, preserving the existing draft. Images still use their preview before sending.

`Attachment` currently means "one image". Not by accident: phase 4 chose the re-encode as the whole
security control, and everything downstream was built on the guarantee it gives. Sending a PDF breaks
that guarantee, so this phase is mostly about **replacing** it rather than about adding a column.

| # | Item | Size |
| --- | --- | --- |
| 91 | `Attachment` gains a kind, a media type and a filename | M |
| 92 | Storage stops assuming one extension | S |
| 93 | A download route that cannot be made to execute — ADR 0013 | M |
| 94 | Composer: attach a file, refuse the ones that are refused, show progress | M |
| 95 | A file card in the thread | S |

## What is true today, and which of it stops being true

| Assumption | Where it lives | After this phase |
| --- | --- | --- |
| every attachment is a WebP | `lib/attachment-storage.ts` | only `kind = IMAGE` is |
| the filename on disk is `<id>.webp` | same file, and `listStoredAttachments` | `<id>.webp` or `<id>.bin` |
| `width`/`height` are known | `Attachment`, `AttachmentDTO` | null unless `kind = IMAGE` |
| the client's MIME type proves nothing and is discarded | `middlewares/upload-image.ts` | still proves nothing, and is **still** discarded — the stored type is sniffed |
| an attachment is rendered in an `<img>` | `message-gallery.tsx` | image → album, file → card, audio → phase 25 |
| one route serves attachments | `GET /attachments/:id` | same route, different headers per kind |

## Item 91 — the schema

```prisma
enum AttachmentKind {
  IMAGE
  FILE
  AUDIO // written by phase 25; declared here so the enum is migrated once
}

model Attachment {
  id        String         @id @default(cuid())
  messageId String
  /// Denormalised from the message. See "Why conversationId is on this row".
  conversationId String
  kind      AttachmentKind @default(IMAGE)
  /// The type this server decided the bytes are, never the one the client sent.
  /// `application/octet-stream` whenever sniffing failed or produced something
  /// a browser would try to run — see ADR 0013.
  mediaType String
  /// The name the sender's file had, for the download and the card. Never used
  /// to build a path: the file on disk is keyed by `id` and nothing else.
  /// Null for an image (there is nothing to download by name) and for a sticker.
  fileName  String?
  position  Int
  /// Null unless kind = IMAGE. A PDF has no dimensions and 0×0 is a lie that
  /// every layout calculation downstream would have to special-case anyway.
  width     Int?
  height    Int?
  byteSize  Int
  createdAt DateTime @default(now())
  ...
  @@unique([messageId, position])
  @@index([messageId])
  /// The vault's only query, in one index scan. See phase 26.
  @@index([conversationId, kind, createdAt])
}
```

**Migration**: `kind` defaults to `IMAGE` and `mediaType` backfills to `'image/webp'` — every existing
row is exactly that, and the default is what makes this migration a metadata change rather than a
rewrite. `conversationId` backfills with one `UPDATE ... FROM "Message"`.

**The invariant, in the database** (this project's habit, phase 7):

```sql
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_image_has_dimensions"
  CHECK (("kind" <> 'IMAGE') OR ("width" IS NOT NULL AND "height" IS NOT NULL));
```

A second constraint — `kind = 'FILE'` implies `fileName IS NOT NULL` — is worth the line for the same
reason: a file card with no name is a card that says "Download" and nothing else.

### Why `conversationId` is on this row

It duplicates a fact `Message` already holds, which this schema otherwise refuses to do. It earns it:
the vault query (phase 26) is *"everything of one kind in one conversation, newest first, paged"*, and
without the column that is a join to `Message` on every page purely to read a value that **can never
change** — a message does not move between conversations, and there is no code path that would let it.
Written inside the same transaction as the message, so the two cannot disagree; there is no update
path to keep in step.

State this in the column's doc comment, because the next person to read the schema will otherwise
correctly identify it as a smell.

### The wire type

```ts
export type AttachmentKind = "image" | "file" | "audio";

export interface AttachmentDTO {
  id: string;
  kind: AttachmentKind;
  url: string;
  /** Null unless kind is "image". */
  width: number | null;
  height: number | null;
  byteSize: number;
  /** The name to show and to download as. Null for an image. */
  fileName: string | null;
  /** What the server decided the bytes are. Present so the card can pick an icon. */
  mediaType: string;
}
```

`width`/`height` becoming nullable is a **breaking change to every existing consumer** —
`message-gallery.tsx`, `attachment-lightbox.tsx`, `utils/get-attachment-display-size.ts`,
`conversation-preview.ts`, the test factories. That is the intended cost: the compiler will name every
place that assumed an image, which is exactly the list that needs a branch. Do not soften it with `?? 0`.

## Item 92 — storage, without the constant extension

`ATTACHMENT_FILE_EXTENSION` is load-bearing in a way that is easy to miss: `listStoredAttachments`
strips it to recover the id, and the orphan sweep (phase 14) deletes anything it cannot match to a row.
**Add a non-`.webp` file without touching that function and the sweep will not see it — which is the
benign failure — but a future change that lists "everything in the directory" would delete live files.**

- Images keep `<id>.webp`.
- Everything else is written as `<id>.bin`, whatever it actually is. The extension on disk carries no
  meaning to anything: the response's `Content-Type` and `Content-Disposition` come from the row, and
  nothing serves this directory statically.
- `ATTACHMENT_FILE_EXTENSIONS = [".webp", ".bin"]`, and `listStoredAttachments` strips whichever
  matches.

**A user-supplied filename never reaches the filesystem.** It is a column. `assertSafeKey` stays exactly
as it is.

`saveFileAttachment(id, buffer)` is a new export beside `saveAttachment`, not a flag on it: one decodes
and re-encodes, the other writes bytes through, and a boolean argument that switches between "this is
validated" and "this is not" is the wrong shape for the one decision in this module that matters.

## Item 93 — ADR 0013, "serving bytes we did not re-encode"

Write the ADR. The decision it records:

**Context.** ADR 0007 made an attachment URL a bearer token, which answers *who may read this*. It says
nothing about *what the browser does with it*, and for a WebP produced by this server the answer was
never interesting. For a file a stranger uploaded it is the whole problem: an HTML file served inline
from this origin runs script with the API's origin; an SVG is a script; a PDF has its own runtime.

**Decision.** Five rules, together:

1. **The stored media type is sniffed, never taken from the client.** Sniff the buffer (the `file-type`
   package, or a small magic-number table — a dependency here is the honest choice) and store what it
   says. No signature → `application/octet-stream`.
2. **A sniffed type that a browser will *interpret* is stored as `application/octet-stream`.** The
   list: `text/html`, `application/xhtml+xml`, `image/svg+xml`, `application/xml`, `text/xml`,
   `application/xslt+xml`. This is a stored decision, not a response-time one, so it cannot be
   forgotten by a second route later.
3. **`kind = FILE` is always served with `Content-Disposition: attachment`**, with the filename in both
   the ASCII and the RFC 5987 `filename*=UTF-8''…` forms — Vietnamese filenames are the normal case
   here, not the edge case.
4. **Every attachment response carries `Content-Security-Policy: default-src 'none'; sandbox` and
   `X-Content-Type-Options: nosniff`.** Helmet sets the second globally; setting it explicitly on this
   route is duplication that survives someone changing the global.
5. **Executables are refused at upload**, by extension: `exe msi bat cmd com scr pif jar apk dmg app
   sh ps1 vbs js jse wsf lnk reg`. The error names the reason.

**Consequences, stated rather than implied.** Rule 5 is defeated by renaming a file, and this app has
no way to know what is inside a `.zip`. The protection that actually holds is 1-4: nothing uploaded here
can execute *in a browser on this origin*, whatever it is. What a recipient does with a file they saved
is outside this system, exactly as it is for email. **This is not antivirus, and the README must not
imply it is.**

### Limits, and the arithmetic behind them

```
MAX_ATTACHMENT_BYTES = 10MB   (image, unchanged)
MAX_FILE_BYTES       = 25MB   (new)
MAX_ATTACHMENTS_PER_MESSAGE = 10   (images, unchanged)
MAX_FILES_PER_MESSAGE       = 1    (new)
```

**One file per message is a decision, not a placeholder.** Two reasons, and the second is the one that
matters: uploads are buffered in memory (deliberately — nothing untrusted reaches disk before it is
checked), so the ceiling on one request is `count × size`. Ten images is 100MB and already generous;
ten 25MB files would be 250MB per request, per concurrent sender, on a box running two API instances.
The first reason is smaller and still true: a document is the message, the way a sticker is, and a
"gallery" mixing three photos and a spreadsheet has no layout anybody wants. `@@unique([messageId,
position])` already permits more, so raising this later moves no data — the same shape phase 22's
relaxation took.

A message may carry images **or** one file, never both. Enforce at the controller boundary with a
stated error.

### The upload middleware

`createImageUpload` becomes `createUpload` with the filter passed in: images keep
`mimetype.startsWith("image/")` as a cheap pre-filter, files get the executable-extension refusal.
Multer's `LIMIT_FILE_SIZE` message must name the right limit for the right field — the current
`describeMulterError` divides one constant by 1MB and would report the image limit on a file field.

## Item 94 and 95 — the client

- `constants/attachment.ts` gains `MAX_FILE_BYTES`, `MAX_FILES_PER_MESSAGE` and the refused-extension
  list, mirroring the server the way `MAX_ATTACHMENTS_PER_MESSAGE` already does. The comment there
  already states the rule: the server is the authority, this exists so the composer can refuse before
  25MB crosses the wire.
- `ComposerControls` gets a second button (paperclip stays for images, a `FileText` icon for files) —
  or one button with a small menu. Prefer two buttons: a menu for two items is a click nobody needs.
- `message-file-card.tsx` — a new component, one file: icon derived from `mediaType`, filename
  (middle-truncated, never wrapped), `formatBytes` (**grep first** — `utils/attachment-size.ts`
  already exists), and a download anchor. The anchor is a plain `<a href={url} download={fileName}>`;
  `Content-Disposition` on the response is what actually names the file, and `download` is the hint.
- `message-bubble.tsx` picks by `attachment.kind`. This is the one place the new union is switched on;
  everything else takes the component it is given.
- Follow the component checklist: constants to `constants/`, the icon map is an object map (**audit
  section 26 does not see object maps** — it is the documented blind spot, so move it by hand).

## Tests this phase is not done without

At the HTTP boundary, not under it:

1. Upload a real PDF → `GET /attachments/:id?token=…` answers 200, `Content-Type: application/pdf`,
   `Content-Disposition: attachment` with both filename forms, `nosniff`, and the CSP header.
2. Upload a file whose bytes are HTML with a `.txt` name → stored `mediaType` is
   `application/octet-stream`, not `text/html`.
3. Upload `payload.exe` → 400, and nothing is written to the upload directory.
4. A message carrying both an image and a file → 400.
5. The orphan sweep recognises `<id>.bin` — that is the regression test for item 92, and it is the one
   nobody thinks of.
6. `deleteMessage` removes a `.bin` file as well as a `.webp` one.
7. e2e (`e2e/sending.spec.ts` or a new `files.spec.ts`): attach a file, send, the card appears in the
   other browser context with the right name, and the download link carries a token.

And run it by hand. Send a `.docx`, a `.zip`, a PDF with a Vietnamese filename, and a 30MB file that
should be refused.

## Documentation to update in the same commit

- `docs/adr/0013-serving-unmodified-uploads.md` (new), and the ADR list in `docs/ARCHITECTURE.md` if it
  carries one.
- `docs/ROADMAP.md` — phase 24 table, and the "Images only" line under phase 4's known gaps, which
  becomes false here.
- `README.md` — the feature list and any sentence claiming attachments are images.
- `docs/conventions/backend.md` if the storage module's shape changed in a way the conventions describe.
