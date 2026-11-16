-- A song on a note (ADR 0026): copied from Apple's catalogue when the note is posted.
ALTER TABLE "Story" ADD COLUMN "musicTrackId" TEXT,
ADD COLUMN "musicTitle" TEXT,
ADD COLUMN "musicArtist" TEXT,
ADD COLUMN "musicArtworkUrl" TEXT,
ADD COLUMN "musicPreviewUrl" TEXT;
