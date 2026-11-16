import type { NoteMusicDTO } from "@chatty/shared-types";
import { AppError, ValidationError } from "./errors.js";

/**
 * Songs for notes (ADR 0026), from Apple's public catalogue: the iTunes Search
 * API for search and lookup, Apple's marketing chart for "popular now". Free,
 * keyless, and every track carries a 30-second preview.
 *
 * Every answer is filtered to Apple's own hosts, so a note can never make a
 * viewer's browser fetch from anywhere else; answers are cached in memory
 * because the search API allows only about twenty calls a minute per address.
 */

const SEARCH_URL = "https://itunes.apple.com/search";
const LOOKUP_URL = "https://itunes.apple.com/lookup";
const CHART_URL = "https://rss.marketingtools.apple.com/api/v2/vn/music/most-played/25/songs.json";
const COUNTRY = "VN";
const RESULT_LIMIT = 25;
// Generous: a cold connection to Apple from here has measured over 5 s.
const REQUEST_TIMEOUT_MS = 10_000;
const SEARCH_CACHE_MS = 10 * 60_000;
const CHART_CACHE_MS = 60 * 60_000;
const CACHE_MAX_ENTRIES = 500;
const PREVIEW_HOST = /^https:\/\/audio-ssl\.itunes\.apple\.com\//u;
const ARTWORK_HOST = /^https:\/\/is\d+-ssl\.mzstatic\.com\//u;

interface CatalogTrack {
	trackId?: number;
	trackName?: string;
	artistName?: string;
	artworkUrl100?: string;
	previewUrl?: string;
	kind?: string;
}

const cache = new Map<string, { expiresAt: number; tracks: NoteMusicDTO[] }>();

/** The catalogue being down is not the caller's mistake: 503, so the picker can say "try again". */
async function fetchJson(url: string): Promise<unknown> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		if (response.ok) return await response.json();
	} catch {
		// Offline, timed out or not JSON — all the same to the person picking a song.
	}
	throw new AppError("Music is not available right now. Try again in a moment.", 503);
}

/** Only songs with a preview on Apple's hosts; artwork asked for at 200 px for sharp 2x thumbnails. */
export function toNoteMusic(track: CatalogTrack): NoteMusicDTO | null {
	if (track.kind !== "song" || !track.trackId || !track.trackName || !track.artistName) return null;
	if (!track.previewUrl || !PREVIEW_HOST.test(track.previewUrl)) return null;
	if (!track.artworkUrl100 || !ARTWORK_HOST.test(track.artworkUrl100)) return null;

	return {
		trackId: String(track.trackId),
		title: track.trackName,
		artist: track.artistName,
		artworkUrl: track.artworkUrl100.replace("100x100bb", "200x200bb"),
		previewUrl: track.previewUrl,
	};
}

function tracksFrom(body: unknown): NoteMusicDTO[] {
	const results = (body as { results?: CatalogTrack[] } | null)?.results ?? [];

	return results.flatMap((track) => toNoteMusic(track) ?? []);
}

async function cached(key: string, ttlMs: number, load: () => Promise<NoteMusicDTO[]>): Promise<NoteMusicDTO[]> {
	const hit = cache.get(key);
	if (hit && hit.expiresAt > Date.now()) return hit.tracks;
	const tracks = await load();
	if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
	cache.set(key, { expiresAt: Date.now() + ttlMs, tracks });

	return tracks;
}

async function lookup(ids: string[]): Promise<NoteMusicDTO[]> {
	if (ids.length === 0) return [];
	const url = `${LOOKUP_URL}?id=${ids.map(encodeURIComponent).join(",")}&country=${COUNTRY}&entity=song`;

	return tracksFrom(await fetchJson(url));
}

/** Songs matching the words, or the Vietnamese chart when there are none. */
export function searchNoteMusic(query: string): Promise<NoteMusicDTO[]> {
	const words = query.trim().toLowerCase();
	if (!words) {
		return cached("chart", CHART_CACHE_MS, async () => {
			const chart = (await fetchJson(CHART_URL)) as { feed?: { results?: { id?: string }[] } };
			const ids = (chart.feed?.results ?? []).flatMap((entry) => (entry.id ? [entry.id] : []));

			return lookup(ids);
		});
	}

	return cached(`search:${words}`, SEARCH_CACHE_MS, async () => {
		const url = `${SEARCH_URL}?term=${encodeURIComponent(words)}&media=music&entity=song&limit=${RESULT_LIMIT}&country=${COUNTRY}`;

		return tracksFrom(await fetchJson(url));
	});
}

/** The one track a note names, looked up rather than taken from the client. */
export async function lookupNoteMusic(trackId: string): Promise<NoteMusicDTO> {
	const [track] = await cached(`track:${trackId}`, SEARCH_CACHE_MS, () => lookup([trackId]));
	if (!track) throw new ValidationError("That song is not available");

	return track;
}

/** Tests start from an empty cache. */
export function clearMusicCatalogCache(): void {
	cache.clear();
}
