-- A note is words, a song, or both, drawn in a message bubble: it no longer needs a
-- background colour. A song is all five fields or none, and only on a note.
ALTER TABLE "Story" DROP CONSTRAINT "Story_kind_shape_check";
ALTER TABLE "Story" ADD CONSTRAINT "Story_kind_shape_check" CHECK (
	("kind"::text IN ('PHOTO', 'VIDEO') AND "mediaId" IS NOT NULL AND "musicTrackId" IS NULL)
	OR ("kind"::text = 'TEXT' AND "mediaId" IS NULL AND (length(btrim("text")) > 0 OR "musicTrackId" IS NOT NULL))
);
ALTER TABLE "Story" ADD CONSTRAINT "Story_music_complete_check" CHECK (
	("musicTrackId" IS NULL AND "musicTitle" IS NULL AND "musicArtist" IS NULL AND "musicArtworkUrl" IS NULL AND "musicPreviewUrl" IS NULL)
	OR ("musicTrackId" IS NOT NULL AND "musicTitle" IS NOT NULL AND "musicArtist" IS NOT NULL AND "musicArtworkUrl" IS NOT NULL AND "musicPreviewUrl" IS NOT NULL)
);
