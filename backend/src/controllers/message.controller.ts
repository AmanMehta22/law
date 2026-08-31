import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { workflowService } from "../services/workflow.service";
import { conversationRepository } from "../repositories/conversation.repository";
import { NotFoundError } from "../errors/NotFoundError";
import { ForbiddenError } from "../errors/ForbiddenError";
import { AppError } from "../errors/AppError";
import { logger } from "../logger";
import { pushService } from "../utils/requestContext";

class MessageController {
  sendMessage = asyncHandler(async (req: Request, res: Response) => {
    pushService("MessageController");
    const requestStart = Date.now();
    const requestId = (req as unknown as { requestId?: string }).requestId ?? "no-id";
    const { conversationId, message } = req.body;
    const userId = req.user.sub;
    // Explicit per-user-message timing log (user asked: log how much time taken from request to response)
    logger.info(`[REQ ${requestId}] User message received`, {
      userId,
      conversationId: conversationId ?? "(new)",
      messagePreview: String(message).slice(0, 80),
    });

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
    res.setHeader("X-Accel-Buffering", "no");
    // Disable any proxy buffering that would hold SSE frames.
    (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();
    // Explicitly flush headers so the browser's EventSource/fetch stream
    // starts immediately even behind helmet/compression.
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
      // Force-flush the chunk so the frontend's getReader() sees it
      // immediately instead of waiting for Node's internal buffer to fill.
      (res as unknown as { flush?: () => void }).flush?.();
    };

    try {
      const result = await workflowService.processMessage(
        userId,
        conversationId ?? null,
        message,
        {
          onStatus: (status) => send("status", { status }),
          onToken: (token) => send("delta", { text: token }),
          signal: disconnectController.signal,
        },
      );

      const durationMs = Date.now() - requestStart;
      const durationSec = (durationMs / 1000).toFixed(2);
      const provider = (result as { provider?: string }).provider ?? "follow-up";
      logger.info(`[REQ ${requestId}] User message → response completed`, {
        userId,
        conversationId: result.conversationId,
        provider,
        duration: `${durationSec}s`,
        replyPreview: String(result.reply).slice(0, 80),
      });
      // Also explicit cmd one-liner for quick scanning
      console.log(`\x1b[36m[REQ ${requestId}] ${userId} → ${provider}  request→response ${durationSec}s  (msg: "${String(message).slice(0,40)}")\x1b[0m`);

      send("done", { data: result });
    } catch (error) {
      const durationMs = Date.now() - requestStart;
      const durationSec = (durationMs / 1000).toFixed(2);
      logger.error("Message streaming failed", {
        requestId,
        userId,
        conversationId: conversationId ?? "(new)",
        duration: `${durationSec}s`,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`\x1b[31m[REQ ${requestId}] ${userId}  FAILED after ${durationSec}s: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);

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