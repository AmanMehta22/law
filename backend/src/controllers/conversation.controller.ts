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
      data: conversation,
    });
  });
}

export const conversationController = new ConversationController();
