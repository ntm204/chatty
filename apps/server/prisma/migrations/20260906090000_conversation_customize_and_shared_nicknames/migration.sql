-- ADR 0022: Messenger-style "Customize chat" — a group photo, a shared theme
-- color, and a shared quick-reaction emoji, plus turning the existing private
-- per-viewer nickname into a shared per-member one.
--
-- `ConversationParticipant.nickname` needs no column change: it was already
-- keyed by (conversationId, userId), which is exactly the shape a per-member
-- label needs. Only its meaning changes (see the updated schema comment) —
-- application code decides who may read/write it and where it broadcasts,
-- not the database.

CREATE TYPE "ConversationTheme" AS ENUM ('AZURE', 'AMBER', 'MOSS', 'PLUM', 'CLAY', 'TEAL', 'IRIS', 'FERN');

-- AlterTable
ALTER TABLE "Conversation"
    ADD COLUMN "avatarUpdatedAt" TIMESTAMPTZ(3),
    ADD COLUMN "themeColor" "ConversationTheme",
    ADD COLUMN "quickReactionEmoji" TEXT;
