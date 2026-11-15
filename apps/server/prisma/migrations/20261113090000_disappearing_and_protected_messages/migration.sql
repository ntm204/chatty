-- Disappearing and protected messages (ADR 0023).

ALTER TABLE "User" ADD COLUMN "defaultMessageTimerSeconds" INTEGER;
ALTER TABLE "Conversation" ADD COLUMN "messageTimerSeconds" INTEGER;
ALTER TABLE "Message" ADD COLUMN "expiresAt" TIMESTAMPTZ(3);
ALTER TABLE "Message" ADD COLUMN "isProtected" BOOLEAN NOT NULL DEFAULT false;

-- Only the offered presets: 24 hours, 7 days, 90 days. A timer of 1 second, or of
-- ten years, is not a choice anybody was shown, so the database refuses it.
ALTER TABLE "User" ADD CONSTRAINT "User_defaultMessageTimerSeconds_check"
	CHECK ("defaultMessageTimerSeconds" IS NULL OR "defaultMessageTimerSeconds" IN (86400, 604800, 7776000));
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_messageTimerSeconds_check"
	CHECK ("messageTimerSeconds" IS NULL OR "messageTimerSeconds" IN (86400, 604800, 7776000));

-- A protected message always disappears; "protected forever" is not a state the
-- product offers, and the sweep is what finally removes its content.
ALTER TABLE "Message" ADD CONSTRAINT "Message_protected_expires_check"
	CHECK (NOT "isProtected" OR "expiresAt" IS NOT NULL);

CREATE TABLE "MessageView" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageView_pkey" PRIMARY KEY ("messageId","userId")
);

ALTER TABLE "MessageView" ADD CONSTRAINT "MessageView_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageView" ADD CONSTRAINT "MessageView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Message_expiresAt_idx" ON "Message"("expiresAt");
