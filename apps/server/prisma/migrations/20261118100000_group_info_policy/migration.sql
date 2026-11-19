-- Who may rename a group and change its photo. Admins only by default, as before.
ALTER TABLE "Conversation" ADD COLUMN "infoPolicy" "ConversationInvitePolicy" NOT NULL DEFAULT 'MANAGERS';
