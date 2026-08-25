import { conversationRepository } from "../repositories/conversation.repository";
import { logger } from "../logger";

const conversationLogger = logger.child("CONVERSATION");

class ConversationService {
  async createConversation(userId: string, title: string) {
    const timer = conversationLogger.startTimer();

    const conversation = await conversationRepository.create(userId, title);

    timer.done("Conversation created", {
      conversationId: conversation.id,
      userId,
      title,
    });

    return conversation;
  }

  async getConversations(userId: string) {
    return conversationRepository.findAllByUserId(userId);
  }
  async getConversation(conversationId: string, userId: string) {
    const conversation =
      await conversationRepository.findByIdWithMessages(conversationId);

    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    if (conversation.userId !== userId) {
      throw new Error("Unauthorized access.");
    }

    return conversation;
  }
}

export const conversationService = new ConversationService();
