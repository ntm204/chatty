-- ADR 0021: collapse OWNER into ADMIN. Every admin becomes symmetric — none is
-- more privileged than another, and a group always keeps at least one.

-- Drop the owner-only invariant machinery from the phase 7 migration and its
-- phase 42 follow-up — the partial unique index, both constraint triggers, and
-- the functions behind them — before touching any data. Dropping them after
-- the UPDATE below fails at commit: the update queues a deferred check against
-- the old trigger, and it would fire (with every owner already converted to
-- admin) before the DROP ever gets there.
DROP TRIGGER "ConversationParticipant_owner_invariant" ON "ConversationParticipant";
DROP TRIGGER "Conversation_kind_owner_invariant" ON "Conversation";
DROP FUNCTION "check_conversation_owner_invariant"();
DROP FUNCTION "check_conversation_kind_owner_invariant"();
DROP FUNCTION "assert_conversation_owner_invariant"(TEXT);
DROP INDEX "ConversationParticipant_one_owner_per_conversation";

-- Existing owners become ordinary admins before the enum value they hold is
-- removed.
UPDATE "ConversationParticipant" SET "role" = 'ADMIN' WHERE "role" = 'OWNER';

-- Postgres cannot drop an enum value in place, so swap the type: rename the
-- old one out of the way, create the two-value replacement, and recast the
-- column (safe now that no row still holds 'OWNER').
ALTER TYPE "ConversationRole" RENAME TO "ConversationRole_old";
CREATE TYPE "ConversationRole" AS ENUM ('ADMIN', 'MEMBER');
ALTER TABLE "ConversationParticipant" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "ConversationParticipant"
    ALTER COLUMN "role" TYPE "ConversationRole" USING ("role"::text::"ConversationRole");
ALTER TABLE "ConversationParticipant" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "ConversationRole_old";

-- The replacement invariant: a non-empty group keeps at least one admin (not
-- exactly one — any number of admins is fine now that none is special), and a
-- direct conversation still has none.
CREATE FUNCTION "assert_conversation_admin_invariant"("targetConversationId" TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
	"groupConversation" BOOLEAN;
	"participantCount" INTEGER;
	"adminCount" INTEGER;
BEGIN
	SELECT "isGroup"
	INTO "groupConversation"
	FROM "Conversation"
	WHERE id = "targetConversationId";

	-- Cascading participant deletes run after their conversation is already
	-- gone. There is no surviving aggregate to validate in that case.
	IF NOT FOUND THEN
		RETURN;
	END IF;

	SELECT COUNT(*)::INTEGER,
	       COUNT(*) FILTER (WHERE "role" = 'ADMIN')::INTEGER
	INTO "participantCount", "adminCount"
	FROM "ConversationParticipant"
	WHERE "conversationId" = "targetConversationId";

	IF "groupConversation" AND "participantCount" > 0 AND "adminCount" < 1 THEN
		RAISE EXCEPTION 'non-empty group % must keep at least one admin', "targetConversationId"
			USING ERRCODE = '23514';
	END IF;

	IF NOT "groupConversation" AND "adminCount" <> 0 THEN
		RAISE EXCEPTION 'direct conversation % cannot have an admin', "targetConversationId"
			USING ERRCODE = '23514';
	END IF;
END;
$$;

CREATE FUNCTION "check_conversation_admin_invariant"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		PERFORM "assert_conversation_admin_invariant"(NEW."conversationId");
	ELSIF TG_OP = 'DELETE' THEN
		PERFORM "assert_conversation_admin_invariant"(OLD."conversationId");
	ELSE
		PERFORM "assert_conversation_admin_invariant"(OLD."conversationId");
		IF NEW."conversationId" <> OLD."conversationId" THEN
			PERFORM "assert_conversation_admin_invariant"(NEW."conversationId");
		END IF;
	END IF;

	RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ConversationParticipant_admin_invariant"
AFTER INSERT OR UPDATE OR DELETE ON "ConversationParticipant"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_conversation_admin_invariant"();

CREATE FUNCTION "check_conversation_kind_admin_invariant"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM "assert_conversation_admin_invariant"(NEW.id);
	RETURN NULL;
END;
$$;

-- Only `isGroup` can move a conversation across the invariant's two branches,
-- so that is the only column this side needs to watch (phase 7's own
-- optimization, carried over).
CREATE CONSTRAINT TRIGGER "Conversation_kind_admin_invariant"
AFTER INSERT OR UPDATE OF "isGroup" ON "Conversation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_conversation_kind_admin_invariant"();
