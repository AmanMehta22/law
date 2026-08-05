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

  async findAllByUserId(userId: string) {
    return prisma.conversation.findMany({
      where: {
        userId,
      },

      orderBy: {
        updatedAt: "desc",
      },

      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}

export const conversationRepository = new ConversationRepository();
