import { conversationRepository } from "../repositories/conversation.repository";
import { NotFoundError } from "../errors/NotFoundError";
import { ForbiddenError } from "../errors/ForbiddenError";
import { AppError } from "../errors/AppError";
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

  async getConversations(
    userId: string,
    options?: { page?: number; limit?: number },
  ) {
    const page = Math.max(options?.page ?? 1, 1);
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);

    const { conversations, hasMore } =
      await conversationRepository.findAllByUserId(userId, {
        limit,
        offset: (page - 1) * limit,
      });

    return { conversations, page, limit, hasMore };
  }

  async renameConversation(
    conversationId: string,
    userId: string,
    title: string,
  ) {
    const trimmed = title.trim();

    if (!trimmed) {
      throw new AppError("Title cannot be empty.", 400);
    }

    const conversation = await conversationRepository.renameForUser(
      conversationId,
      userId,
      trimmed.slice(0, 200),
    );

    if (!conversation) {
      throw new NotFoundError("Conversation not found.");
    }

    return conversation;
  }

  async deleteConversation(conversationId: string, userId: string) {
    const deleted = await conversationRepository.deleteForUser(
      conversationId,
      userId,
    );

    if (!deleted) {
      throw new NotFoundError("Conversation not found.");
    }
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
