import { z } from "zod";

export const friendParamsSchema = z.object({ userId: z.string().min(1).max(64) });
export type FriendParams = z.infer<typeof friendParamsSchema>;
