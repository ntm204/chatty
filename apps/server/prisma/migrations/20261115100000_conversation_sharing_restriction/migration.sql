-- Per-conversation sharing restriction (ADR 0024).
ALTER TABLE "Conversation" ADD COLUMN "restrictSharing" BOOLEAN NOT NULL DEFAULT false;
