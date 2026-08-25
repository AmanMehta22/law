import { Message } from "@prisma/client";

/**
 * History for a prompt should hold previous turns only. The current user
 * message is persisted moments before the prompt is built, so it sits at the
 * end of the loaded list AND is rendered separately as the current question.
 * Keeping both doubles its token cost and pushed long questions past
 * providers' request-size limits.
 */
export function dropCurrentMessageFromHistory(
  messages: Message[],
  currentMessage: string,
): Message[] {
  const last = messages[messages.length - 1];

  if (!last || last.role !== "USER" || last.content !== currentMessage) {
    return messages;
  }

  return messages.slice(0, -1);
}

export function formatConversation(messages: Message[]) {
  return messages.map((m) => `${m.role}:\n${m.content}`).join("\n\n");
}
