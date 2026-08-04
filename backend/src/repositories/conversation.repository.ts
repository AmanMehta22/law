import { prisma } from "../config";

class ConversationRepository {
  async create(userId: string, title: string) {
    return prisma.conversation.create({
      data: {
        title,
        userId,
      },
    });
  }
}

export const conversationRepository = new ConversationRepository();
