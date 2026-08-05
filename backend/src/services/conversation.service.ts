import { conversationRepository } from "../repositories/conversation.repository";

class ConversationService {
  async createConversation(userId: string, title: string) {
    return conversationRepository.create(userId, title);
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
