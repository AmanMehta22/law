import { z } from "zod";

export const sendMessageSchema = z.object({
  conversationId: z.string().nullable().optional(),

  message: z.string().min(1),
});
