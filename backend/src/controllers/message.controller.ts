import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { workflowService } from "../services/workflow.service";

class MessageController {
  sendMessage = asyncHandler(async (req, res) => {
    const { conversationId, message } = req.body;

    const result = await workflowService.processMessage(
      req.user.sub,
      conversationId ?? null,
      message,
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  });
}

export const messageController = new MessageController();
