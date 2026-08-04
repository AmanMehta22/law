import { Message } from "@prisma/client";

export function formatConversation(messages: Message[]) {
  return messages.map((m) => `${m.role}:\n${m.content}`).join("\n\n");
}
