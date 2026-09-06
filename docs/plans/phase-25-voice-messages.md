# Phase 25 — voice messages

Depends on phase 24: the `AUDIO` kind, `mediaType`, and the storage that no longer assumes one
extension all arrive there. What is new here is a second re-encode, a recorder, and a player.

| # | Item | Size |
| --- | --- | --- |
| 96 | Transcode on the way in, so every browser can play what any browser recorded — ADR 0014 | L |
| 97 | Duration and a waveform, derived server-side | M |
| 98 | The recorder in the composer | M |
| 99 | The player in the thread | M |

## The problem nobody sees until Safari

`MediaRecorder` does not produce one format. Chrome and Firefox give `audio/webm; codecs=opus`; Safari
gives `audio/mp4` with AAC. **Safari cannot play WebM at all.** Storing what arrives therefore produces
a system where half the users cannot hear the other half — and it fails in the demo on someone's
iPhone, not in CI.

So the bytes are re-encoded, which turns out to be the same answer phase 4 gave for images and for the
same second reason: a re-encode is a security control. Audio decoded to samples and re-encoded by this
server contains nothing of whatever the uploader actually sent, which is what earns audio the right to
be served **inline** under ADR 0013's rule — the only kind besides images that gets it.

## Item 96 — ADR 0014, "voice notes are re-encoded to AAC"

**Decision.** Transcode every upload to **mono AAC in an MP4 container, 32 kbit/s, 24 kHz**
(`audio/mp4`). It plays in every browser this app supports, including Safari, and 32 kbit/s mono is
roughly 240 KB per minute — voice, not music.

**Rejected: Opus in Ogg or WebM.** Better codec, smaller files, and Safari support is partial and
version-dependent. The point of this phase is that a recording plays everywhere; a format matrix with a
footnote is the thing being fixed.

**Rejected: store as recorded and transcode on read.** Moves CPU from one upload to every playback and
makes the cache key a lie.

**The dependency.** `ffmpeg-static` (the binary as an npm package) plus a thin `lib/audio-storage.ts`,
rather than a system `ffmpeg` in the Dockerfile. Reasons, in order:

- `sharp` already set this precedent — a native binary shipped by npm, resolved per platform.
- CI and every contributor's laptop keep working with `npm ci` and nothing else. A Dockerfile
  `apt-get install ffmpeg` leaves the local test suite failing on a machine that never installed it.
- It is a glibc binary, and these images are Debian slim for exactly that reason (the same call ADR
  0001 made about `sharp` and musl). **Do not switch the base image to Alpine.**

Cost, stated: ~80 MB in `node_modules` and in the server image. Acceptable; the image already carries
libvips.

**`ffmpeg-static` ships `ffmpeg` only — there is no `ffprobe`.** Do not add `ffprobe-static` to read a
duration. Item 97 derives it from the decode that has to happen anyway, which is both cheaper and one
fewer binary.

**Limits.**

```
MAX_VOICE_SECONDS = 300      // the recorder stops at 5:00
MAX_VOICE_UPLOAD_BYTES = 16MB // what multer accepts before anything is decoded
```

Reject on the server too — the client stopping at five minutes is a courtesy, not a control. Reject by
*decoded duration*, after the transcode, at 330 s: a hard 300 would make a recorder that stops at 300.4
fail for no reason a user can act on.

**A voice message is the whole message.** No caption, no images alongside — the same rule as a sticker,
and for the same reason: two ways of reading one bubble is two layouts.

## Item 97 — duration and waveform, without a second binary

One decode pass produces both:

```
ffmpeg -i <input> -f s16le -acodec pcm_s16le -ac 1 -ar 8000 -   →  raw mono PCM on stdout
```

- **Duration** = `bytes / 2 / 8000` seconds. Exact, free, and no `ffprobe`.
- **Waveform** = split the samples into 64 buckets, take each bucket's RMS (not its peak — peaks make
  every recording look identical), normalise the loudest bucket to 100, store `Int[]`.

Then the encode pass writes the stored file. Two passes over a file this small is not worth avoiding
with a filter graph nobody can read.

**Server-side rather than in the browser**, deliberately: every listener sees the same picture, the
client cannot send a made-up one, and Safari's `AudioContext.decodeAudioData` is not needed on the
recording path.

Schema (extends phase 24's `Attachment`):

```prisma
  /// Null unless kind = AUDIO.
  durationMs Int?
  /// 64 buckets, 0-100, RMS. Null unless kind = AUDIO. Fixed length so the
  /// player reserves its width before the row is read.
  waveform   Int[]
```

With the matching check constraint — `kind = 'AUDIO'` implies `durationMs IS NOT NULL` — for the same
reason phase 24 constrains an image's dimensions.

On the wire: `durationMs: number | null`, `waveform: number[]` (empty for non-audio, never null — the
same argument `MessageDTO.attachments` makes for an empty array over a null).

## Item 98 — recording

`voice-recorder.tsx`, one component, driven by a `use-voice-recorder.ts` hook that owns `MediaRecorder`
and the timer.

- **Tap to start, tap to stop.** Not hold-to-talk: on desktop it means holding a mouse button for a
  minute, and on mobile a press-and-slide gesture needs pointer-event handling this app has nowhere
  else. A "slide to cancel" can come later; a visible **Cancel** covers it now.
- While recording: elapsed time in mono, a live level meter, Cancel and Stop. Composer text field and
  attach buttons are disabled — a half-written sentence plus a recording is two messages.
- After stopping: preview with playback and duration, Send or Discard. **Do not auto-send on stop.**
- **The states that must be handled, because each is a real user in a support message**: permission
  denied (`NotAllowedError`), no microphone (`NotFoundError`), device in use (`NotReadableError`),
  `MediaRecorder` or `getUserMedia` missing, and **an insecure origin** — `getUserMedia` is unavailable
  outside HTTPS and `localhost`, which is exactly how someone testing on a phone over the LAN meets it.
  Each gets its own sentence, not a generic failure.
- Ask for the microphone when recording starts, not when the conversation opens. Release the tracks
  (`stream.getTracks().forEach(t => t.stop())`) on stop, on cancel, and on unmount — a live recording
  indicator left burning in the tab is the bug people notice.

Upload path: the existing multipart `POST /conversations/:id/messages`, field `voice`. It reuses the
XHR progress path already in `api/client.ts`.

## Item 99 — playing

This describes the original implementation. Phase 48 in [ROADMAP](../ROADMAP.md) adds native range
semantics for pointer, touch and keyboard seeking, visible playback recovery, and a voice-specific
layout. Phase 49 compacts it to a 240×56px player and a 44px recording/preview bar while retaining
those controls. Progress now uses the message's ink colour; green remains a presence colour.

`voice-player.tsx` + `constants/voice.ts`:

- Play/pause, the waveform drawn as bars from `waveform`, elapsed/total in mono, a speed toggle
  (1× / 1.5× / 2× via `playbackRate`, cycling on tap).
- Click the waveform to seek. This needs HTTP Range on the attachment route — `res.sendFile` supports
  it already, so the requirement is only *not to break it* (do not switch to reading the file into a
  buffer).
- **One `<audio>` element playing at a time.** Starting a second voice note pauses the first. A module-
  level ref in the hook is enough; two people's voices at once is the failure everyone has met.
- Reserve the player's height before the file loads, from `durationMs` and the waveform — the same
  reason images store their dimensions.
- Colours from tokens. The waveform is ink, and the played portion is the accent already used for the
  live/online state — no new colour enters the palette for this.

## Tests

- Service: a fixture WebM/Opus **and** an MP4/AAC clip both transcode to `audio/mp4`; the derived
  duration is within 100 ms of the real one; the waveform is 64 numbers in 0-100. Commit both fixtures
  (a second or two each) — this is the one place a binary in the repo pays for itself.
- Service: a 6-minute clip is refused after the decode, with the duration error.
- Endpoint: `GET /attachments/:id` for an audio row answers `Content-Type: audio/mp4`,
  **`Content-Disposition: inline`** — the deliberate exception to ADR 0013's rule, so the test names it
  — and honours `Range` with a 206.
- Web: the player renders duration from `durationMs` without loading audio (jsdom has no media stack;
  do not try to test playback there).
- e2e: `MediaRecorder` cannot be driven from Playwright meaningfully. Instead, POST a fixture through
  the real API in the spec's setup and assert the player renders in the browser. **Say so in the
  spec's comment** rather than leaving a reader to assume recording is covered.

## Documentation

`docs/adr/0014-voice-message-encoding.md`, ROADMAP phase 25, README feature list, and a line in
CONTRIBUTING if `npm ci` now pulls a large binary contributors should know about.
