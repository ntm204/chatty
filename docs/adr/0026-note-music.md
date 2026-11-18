# ADR 0026: Notes, and where their songs come from

## Status

Accepted (2026-11-16). Migrations `20261116090000_note_music`, `20261116091000_note_shape` and
`20261116120000_note_likes`.

## Context

The owner narrowed stories to notes: a few words in a bubble above a face, optionally with a song, as
Instagram Notes does. No photo, no video. A first attempt shipped a hand-written list of song titles and a
synthesised beep as the "preview", with the song encoded into the note's text — nothing a viewer could
actually hear. The owner asked for a real music source; the app is private and small, so licensing for
public distribution is not the constraint, but the free-first rule (docs/PRODUCT-DIRECTION.md) still is.

Options compared: the iTunes Search API (free, no key, 30-second previews, Vietnamese catalogue, CORS
open); Deezer (previews, but no CORS, and its API terms are tighter); Spotify (needs OAuth and an app
review, and no longer returns preview URLs for new apps); YouTube (no audio-only preview; embedding a
player is heavy and tracks the viewer).

## Decision

- **Source**: Apple's catalogue. `GET /stories/music?q=` searches it (`country=VN`); an empty query
  returns Apple's "most played in Vietnam" chart, looked up for previews. Results are cached in memory
  (10 minutes per search, an hour for the chart) because the search API allows about 20 calls a minute
  per address. A catalogue outage is a 503 the picker shows as "try again"; the note can still be posted.
- **Through the API, not the browser**: one place for the cache, the rate limit and host checks, and the
  page's CSP keeps `connect-src` closed to Apple.
- **By id only**: a note names `musicTrackId`; the server looks the track up and copies title, artist,
  cover and preview URL into the row, so a note can only point a viewer at `audio-ssl.itunes.apple.com`
  and `*.mzstatic.com` — never a URL the poster typed — and keeps working if the catalogue is down later.
  A database check keeps the five fields all-or-nothing and only on a note.
- **Playback**: one shared audio element; a preview plays while the note's sheet is open and stops
  when it closes or the play button is pressed; the picker previews one row at a time. The CSP allows those two hosts
  for `media-src` and `img-src` only.
- **Shape, as on Messenger** (owner, same day): one note per person — posting replaces the last, with its
  likes; at most 60 characters (`NOTE_TEXT_MAX_LENGTH`); a fixed 24 hours. A heart is a `StoryLike` row,
  visible as a list to the author only; a reply goes to the direct chat as before. The web row shows a
  thought bubble (`NoteThoughtBubble`) above each face and opens a sheet, not a full-screen viewer.

## Consequences

- A viewer's browser fetches the preview and cover from Apple directly, so Apple sees that address play
  that preview. Proxying the audio would hide it at the cost of bandwidth; not worth it for a private app.
- Previews are Apple's to change; a stored URL that stops working fails quietly (the badge just does not
  play) and the note itself is unaffected. Notes last at most 48 hours, so this is rare.
- Photo and video stories stay in the API and database, unused by the web app.
