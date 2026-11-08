-- Built-in animated stickers are named, not stored: the client draws them.
ALTER TABLE "Message" ADD COLUMN "stickerKey" VARCHAR(32);
