-- Previous versions are message content too. Remove history left by older releases.
DELETE FROM "MessageEdit" AS edit
USING "Message" AS message
WHERE edit."messageId" = message.id AND message."deletedAt" IS NOT NULL;
