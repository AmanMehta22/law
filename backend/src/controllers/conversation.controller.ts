import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { conversationService } from "../services/conversation.service";

class ConversationController {
  createConversation = asyncHandler(async (req, res) => {
    const conversation = await conversationService.createConversation(
      req.user.sub,
    );

    res.status(201).json({
      success: true,
      data: conversation,
    });
  });
}

export const conversationController = new ConversationController();
