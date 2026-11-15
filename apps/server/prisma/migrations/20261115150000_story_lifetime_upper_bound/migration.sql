-- Only the upper bound matters: nothing outlives the longest offered lifetime.
-- An expiry at or before the post time is a story already gone, which every read
-- path and the sweep treat correctly; refusing it only blocked tooling.
ALTER TABLE "Story" DROP CONSTRAINT "Story_lifetime_check";
ALTER TABLE "Story" ADD CONSTRAINT "Story_lifetime_check" CHECK (
	"expiresAt" <= "createdAt" + interval '48 hours 1 minute'
);
