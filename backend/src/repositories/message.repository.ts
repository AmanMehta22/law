import { prisma } from "../config";
import { MessageRole, Prisma } from "@prisma/client";

export type MessageEnvelope = {
  answerFormat?: string | null;
  cardsUsed?: Prisma.InputJsonValue;
  overallConfidence?: number | null;
  overallReviewStatus?: string | null;
  disclaimer?: string | null;
  suggestedFollowUps?: Prisma.InputJsonValue;
  quickReplies?: Prisma.InputJsonValue;
  isLowConfidence?: boolean | null;
  isOutOfScope?: boolean | null;
};

class MessageRepository {
  async create(
    conversationId: string,
    role: MessageRole,
    content: string,
    envelope?: MessageEnvelope,
  ) {
    return prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        ...envelope,
      },
    });
  }
}

export const messageRepository = new MessageRepository();
