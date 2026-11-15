-- 24-hour stories (ADR 0025).

-- CreateEnum
CREATE TYPE "StoryKind" AS ENUM ('PHOTO', 'TEXT');

-- CreateEnum
CREATE TYPE "StoryAudience" AS ENUM ('CONTACTS', 'CLOSE_FRIENDS');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "isStoryReply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "replyToStoryId" TEXT;

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "StoryKind" NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "background" "ConversationTheme",
    "mediaId" TEXT,
    "mediaWidth" INTEGER,
    "mediaHeight" INTEGER,
    "audience" "StoryAudience" NOT NULL DEFAULT 'CONTACTS',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryView" (
    "storyId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "viewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("storyId","viewerId")
);

-- CreateTable
CREATE TABLE "CloseFriend" (
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CloseFriend_pkey" PRIMARY KEY ("userId","friendId")
);

-- CreateTable
CREATE TABLE "StoryHiddenFrom" (
    "userId" TEXT NOT NULL,
    "hiddenUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryHiddenFrom_pkey" PRIMARY KEY ("userId","hiddenUserId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Story_mediaId_key" ON "Story"("mediaId");

-- CreateIndex
CREATE INDEX "Story_authorId_expiresAt_idx" ON "Story"("authorId", "expiresAt");

-- CreateIndex
CREATE INDEX "Story_expiresAt_idx" ON "Story"("expiresAt");

-- CreateIndex
CREATE INDEX "CloseFriend_friendId_idx" ON "CloseFriend"("friendId");

-- CreateIndex
CREATE INDEX "StoryHiddenFrom_hiddenUserId_idx" ON "StoryHiddenFrom"("hiddenUserId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToStoryId_fkey" FOREIGN KEY ("replyToStoryId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseFriend" ADD CONSTRAINT "CloseFriend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseFriend" ADD CONSTRAINT "CloseFriend_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryHiddenFrom" ADD CONSTRAINT "StoryHiddenFrom_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryHiddenFrom" ADD CONSTRAINT "StoryHiddenFrom_hiddenUserId_fkey" FOREIGN KEY ("hiddenUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A photo story has its photo, a text story has its words and a colour, and a
-- caption stays short enough to read in the five seconds a story is shown.
ALTER TABLE "Story" ADD CONSTRAINT "Story_kind_shape_check" CHECK (
	("kind" = 'PHOTO' AND "mediaId" IS NOT NULL)
	OR ("kind" = 'TEXT' AND "mediaId" IS NULL AND length(btrim("text")) > 0 AND "background" IS NOT NULL)
);
ALTER TABLE "Story" ADD CONSTRAINT "Story_text_length_check" CHECK (length("text") <= 500);
ALTER TABLE "CloseFriend" ADD CONSTRAINT "CloseFriend_not_self_check" CHECK ("userId" <> "friendId");
ALTER TABLE "StoryHiddenFrom" ADD CONSTRAINT "StoryHiddenFrom_not_self_check" CHECK ("userId" <> "hiddenUserId");
