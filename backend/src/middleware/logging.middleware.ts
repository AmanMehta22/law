import { Request, Response, NextFunction } from "express";
import { logger } from "../logger";
import { requestContext } from "../utils/requestContext";
import { randomUUID } from "node:crypto";

const httpLogger = logger.child("HTTP");

export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = Date.now();
  const requestId = randomUUID().slice(0, 8);
  const services: string[] = [];
  (req as unknown as Record<string, unknown>).requestId = requestId;
  (req as unknown as Record<string, unknown>).services = services;

  // Make services visible to any downstream service via AsyncLocalStorage
  requestContext.run({ requestId, services, route: req.originalUrl }, () => {
    res.on("finish", () => {
      const durationMs = Date.now() - start;
      const durationSec = (durationMs / 1000).toFixed(2);
      const userId = (req as unknown as { user?: { sub?: string } }).user?.sub ?? "anonymous";
      const svc = services.length > 0 ? services.join(" → ") : inferServices(req.originalUrl, req.method);

      const entry = {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration: `${durationSec}s`,
        userId,
        services: svc,
      };

      const msg = `Request completed [${svc}]`;

      if (res.statusCode >= 500) {
        httpLogger.error(msg, entry);
      } else if (res.statusCode >= 400) {
        httpLogger.warn(msg, entry);
      } else {
        httpLogger.info(msg, entry);
      }

      // Also echo a one-liner to cmd for quick scanning: which service handled which request
      const color = res.statusCode >= 500 ? "\x1b[31m" : res.statusCode >= 400 ? "\x1b[33m" : "\x1b[32m";
      console.log(`${color}[${requestId}] ${req.method} ${req.originalUrl} → ${svc} (${durationSec}s) → ${res.statusCode}\x1b[0m`);
    });

    next();
  });
}

function inferServices(url: string, method: string): string {
  if (url.startsWith("/messages") && method === "POST") return "MessageController → WorkflowService → RagService → LlmService";
  if (url.startsWith("/conversations")) return "ConversationService";
  if (url.startsWith("/auth")) return "AuthService";
  if (url.startsWith("/calculators")) return "CalculatorsService";
  if (url.startsWith("/intake")) return "IntakeService";
  if (url.startsWith("/documents")) return "DocumentService";
  if (url.startsWith("/health")) return "HealthService";
  return "UnknownService";
}
