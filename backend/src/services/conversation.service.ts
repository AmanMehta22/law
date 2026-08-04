import { conversationRepository } from "../repositories/conversation.repository";

class ConversationService {
  async createConversation(userId: string) {
    const title = "New Conversation";

    return conversationRepository.create(userId, title);
  }
}

export const conversationService = new ConversationService();
