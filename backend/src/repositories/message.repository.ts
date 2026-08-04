import { prisma } from "../config";
import { MessageRole } from "@prisma/client";

class MessageRepository {
  async create(conversationId: string, role: MessageRole, content: string) {
    return prisma.message.create({
      data: {
        conversationId,
        role,
        content,
      },
    });
  }
}

export const messageRepository = new MessageRepository();
