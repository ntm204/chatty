-- Personal sharing and typing privacy (ADR 0024).
ALTER TABLE "User" ADD COLUMN "allowMessageForwarding" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "typingIndicatorsEnabled" BOOLEAN NOT NULL DEFAULT true;
