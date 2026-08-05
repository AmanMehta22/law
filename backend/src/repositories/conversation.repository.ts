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

  async findByIdWithMessages(conversationId: string) {
    return prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });
  }
}

export const conversationRepository = new ConversationRepository();
