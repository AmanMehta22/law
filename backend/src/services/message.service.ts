import { MessageRole } from "@prisma/client";
import {
  messageRepository,
  MessageEnvelope,
} from "../repositories/message.repository";

class MessageService {
  async createUserMessage(conversationId: string, content: string) {
    return messageRepository.create(conversationId, MessageRole.USER, content);
  }

  async createAssistantMessage(
    conversationId: string,
    content: string,
    envelope?: MessageEnvelope,
  ) {
    return messageRepository.create(
      conversationId,
      MessageRole.ASSISTANT,
      content,
      envelope,
    );
  }
}

export const messageService = new MessageService();
