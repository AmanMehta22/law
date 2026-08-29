import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { workflowService } from "../services/workflow.service";
import { conversationRepository } from "../repositories/conversation.repository";
import { NotFoundError } from "../errors/NotFoundError";
import { ForbiddenError } from "../errors/ForbiddenError";
import { AppError } from "../errors/AppError";
import { logger } from "../logger";

class MessageController {
  sendMessage = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId, message } = req.body;

    // Ownership check BEFORE any work starts. Without it, any authenticated
    // user could append messages to (and read context from) another user's
    // conversation simply by guessing its cuid.
    if (conversationId) {
      const conversation =
        await conversationRepository.findById(conversationId);

      if (!conversation) {
        throw new NotFoundError("Conversation not found.");
      }

      if (conversation.userId !== req.user.sub) {
        throw new ForbiddenError(
          "You do not have access to this conversation.",
        );
      }
    }

    // Stream the reply back as Server-Sent Events so the frontend can show
    // progress ("Finding relevant sections...") and token-by-token deltas
    // instead of a blank screen while Gemini generates.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Cancel in-flight LLM generation when the client goes away instead of
    // letting it burn provider quota on a response nobody reads.
    const disconnectController = new AbortController();

    res.on("close", () => disconnectController.abort());

    // Comment frames every 15s keep proxies/CDNs from reaping a connection
    // that produces no bytes during a long first-token wait.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(": heartbeat\n\n");
      }
    }, 15_000);

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
          signal: disconnectController.signal,
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
      clearInterval(heartbeat);

      if (!res.writableEnded) {
        res.end();
      }
    }
  });
}

export const messageController = new MessageController();