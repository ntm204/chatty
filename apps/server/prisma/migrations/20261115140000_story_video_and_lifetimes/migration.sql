-- Story video and chosen lifetimes (ADR 0025, batch 2).
ALTER TYPE "StoryKind" ADD VALUE 'VIDEO';

ALTER TABLE "Story" ADD COLUMN "mediaDurationMs" INTEGER;
ALTER TABLE "Story" ADD COLUMN "mediaByteSize" INTEGER;

-- A new enum value cannot be referenced in the transaction that adds it, so the
-- shape check compares the kind as text.
ALTER TABLE "Story" DROP CONSTRAINT "Story_kind_shape_check";
ALTER TABLE "Story" ADD CONSTRAINT "Story_kind_shape_check" CHECK (
	("kind"::text IN ('PHOTO', 'VIDEO') AND "mediaId" IS NOT NULL)
	OR ("kind"::text = 'TEXT' AND "mediaId" IS NULL AND length(btrim("text")) > 0 AND "background" IS NOT NULL)
);
ALTER TABLE "Story" ADD CONSTRAINT "Story_video_duration_check" CHECK (
	"mediaDurationMs" IS NULL OR ("kind"::text = 'VIDEO' AND "mediaDurationMs" BETWEEN 0 AND 15000)
);
-- The offered lifetimes top out at 48 hours; nothing may outlive that.
ALTER TABLE "Story" ADD CONSTRAINT "Story_lifetime_check" CHECK (
	"expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '48 hours 1 minute'
);
