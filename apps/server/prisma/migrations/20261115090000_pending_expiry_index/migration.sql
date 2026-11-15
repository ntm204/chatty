-- Only messages still waiting to expire (ADR 0023). The plain index kept every
-- tombstone the sweep had made, so each pass grew slower for the life of the
-- database; this one stays the size of what is actually pending.
DROP INDEX IF EXISTS "Message_expiresAt_idx";
CREATE INDEX "Message_pending_expiry_idx" ON "Message"("expiresAt")
	WHERE "deletedAt" IS NULL AND "expiresAt" IS NOT NULL;
