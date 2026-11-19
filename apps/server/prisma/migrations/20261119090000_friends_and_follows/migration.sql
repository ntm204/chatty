-- Friends and follows (ADR 0027): Facebook's mutual friendship, pending requests, and one-way follows.
ALTER TYPE "StoryAudience" ADD VALUE 'FRIENDS';
ALTER TYPE "StoryAudience" ADD VALUE 'FOLLOWERS';

CREATE TABLE "Friendship" (
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("userAId","userBId"),
    -- One row per pair, smaller id first; nobody is their own friend.
    CONSTRAINT "Friendship_ordered_pair_check" CHECK ("userAId" < "userBId")
);
CREATE INDEX "Friendship_userBId_idx" ON "Friendship"("userBId");

CREATE TABLE "FriendRequest" (
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("senderId","receiverId"),
    CONSTRAINT "FriendRequest_not_self_check" CHECK ("senderId" <> "receiverId")
);
CREATE INDEX "FriendRequest_receiverId_createdAt_idx" ON "FriendRequest"("receiverId", "createdAt");

CREATE TABLE "Follow" (
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerId","followingId"),
    CONSTRAINT "Follow_not_self_check" CHECK ("followerId" <> "followingId")
);
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
