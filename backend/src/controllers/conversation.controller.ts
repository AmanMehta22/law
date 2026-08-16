import { asyncHandler } from "../utils/asyncHandler";
import { conversationService } from "../services/conversation.service";

class ConversationController {
  createConversation = asyncHandler(async (req, res) => {
    const conversation = await conversationService.createConversation(
      req.user.sub,
      "New Conversation", // Temporary (can be removed later if endpoint is removed)
    );

    res.status(201).json({
      success: true,
      data: conversation,
    });
  });

  getConversations = asyncHandler(async (req, res) => {
    const conversations = await conversationService.getConversations(
      req.user.sub,
    );

    res.status(200).json({
      success: true,
      data: conversations,
    });
  });

  getConversation = asyncHandler(async (req, res) => {
    const conversation = await conversationService.getConversation(
      req.params.id as string,
      req.user.sub,
    );

    res.status(200).json({
      success: true,
      data: {
        ...conversation,
        messages: conversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          conversationId: m.conversationId,
          ...(m.answerFormat ? { answer_format: m.answerFormat } : {}),
          ...(m.cardsUsed ? { cards_used: m.cardsUsed } : {}),
          ...(m.overallConfidence !== null && m.overallConfidence !== undefined
            ? { overall_confidence: m.overallConfidence }
            : {}),
          ...(m.overallReviewStatus
            ? { overall_review_status: m.overallReviewStatus }
            : {}),
          ...(m.disclaimer ? { disclaimer: m.disclaimer } : {}),
          ...(m.suggestedFollowUps
            ? { suggested_follow_ups: m.suggestedFollowUps }
            : {}),
          ...(m.quickReplies ? { quick_replies: m.quickReplies } : {}),
          ...(m.isLowConfidence !== null && m.isLowConfidence !== undefined
            ? { is_low_confidence: m.isLowConfidence }
            : {}),
          ...(m.isOutOfScope !== null && m.isOutOfScope !== undefined
            ? { is_out_of_scope: m.isOutOfScope }
            : {}),
        })),
      },
    });
  });
}

export const conversationController = new ConversationController();
