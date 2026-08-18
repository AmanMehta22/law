import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { workflowService } from "../services/workflow.service";
import { AppError } from "../errors/AppError";
import { logger } from "../logger";

class MessageController {
  sendMessage = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId, message } = req.body;

    // Stream the reply back as Server-Sent Events so the frontend can show
    // progress ("Finding relevant sections...") and token-by-token deltas
    // instead of a blank screen while Gemini generates.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      if (res.writableEnded || res.destroyed) {
        return;
      }

      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await workflowService.processMessage(
        req.user.sub,
        conversationId ?? null,
        message,
        {
          onStatus: (status) => send("status", { status }),
          onToken: (token) => send("delta", { text: token }),
        },
      );

      send("done", { data: result });
    } catch (error) {
      logger.error("Message streaming failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      const errorMessage =
        error instanceof AppError
          ? error.message
          : "The server ran into an error. Please try again in a moment.";

      send("error", { error: errorMessage });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });
}

export const messageController = new MessageController();