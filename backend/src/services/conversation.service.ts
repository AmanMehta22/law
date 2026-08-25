import { conversationRepository } from "../repositories/conversation.repository";
import { NotFoundError } from "../errors/NotFoundError";
import { ForbiddenError } from "../errors/ForbiddenError";
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
      throw new NotFoundError("Conversation not found.");
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenError("You do not have access to this conversation.");
    }

    return conversation;
  }
}

export const conversationService = new ConversationService();
