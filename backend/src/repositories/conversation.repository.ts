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

  /**
   * Loads a conversation with its messages. When `userId` is given the query
   * itself is scoped to that owner, so a conversation belonging to someone
   * else is indistinguishable from a missing one (defense-in-depth for the
   * IDOR class of bugs: no caller can read another user's history even if
   * it forgets its own check).
   */
  async findByIdWithMessages(conversationId: string, userId?: string) {
    return prisma.conversation.findFirst({
      where: userId ? { id: conversationId, userId } : { id: conversationId },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });
  }

  async findById(conversationId: string) {
    return prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
    });
  }

  async findAllByUserId(
    userId: string,
    options?: { limit?: number; offset?: number },
  ) {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const offset = Math.max(options?.offset ?? 0, 0);

    // One extra row beyond the page size tells the caller whether another
    // page exists without a second COUNT query.
    const rows = await prisma.conversation.findMany({
      where: {
        userId,
      },

      orderBy: {
        updatedAt: "desc",
      },

      take: limit + 1,
      skip: offset,

      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = rows.length > limit;

    return {
      conversations: hasMore ? rows.slice(0, limit) : rows,
      hasMore,
    };
  }

  async renameForUser(conversationId: string, userId: string, title: string) {
    const existing = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });

    if (!existing) {
      return null;
    }

    return prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteForUser(conversationId: string, userId: string) {
    const existing = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });

    if (!existing) {
      return false;
    }

    await prisma.message.deleteMany({ where: { conversationId } });

    await prisma.conversation.delete({ where: { id: conversationId } });

    return true;
  }
}

export const conversationRepository = new ConversationRepository();
