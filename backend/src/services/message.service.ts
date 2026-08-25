import { MessageRole } from "@prisma/client";
import {
  messageRepository,
  MessageEnvelope,
} from "../repositories/message.repository";
import { logger } from "../logger";

const messageLogger = logger.child("MESSAGE");

class MessageService {
  async createUserMessage(conversationId: string, content: string) {
    const timer = messageLogger.startTimer();

    const message = await messageRepository.create(
      conversationId,
      MessageRole.USER,
      content,
    );

    timer.done("User message stored", {
      messageId: message.id,
      conversationId,
      contentPreview: content.slice(0, 120),
    });

    return message;
  }

  async createAssistantMessage(
    conversationId: string,
    content: string,
    envelope?: MessageEnvelope,
  ) {
    const timer = messageLogger.startTimer();

    const message = await messageRepository.create(
      conversationId,
      MessageRole.ASSISTANT,
      content,
      envelope,
    );

    timer.done("Assistant message stored", {
      messageId: message.id,
      conversationId,
      replyChars: content.length,
    });

    return message;
  }
}

export const messageService = new MessageService();
