import { Request, Response, NextFunction } from "express";
import { logger } from "../logger";

const httpLogger = logger.child("HTTP");

export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const userId = req.user?.sub ?? "anonymous";

    const entry = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: `${durationMs}ms`,
      userId,
    };

    if (res.statusCode >= 500) {
      httpLogger.error("Request completed", entry);
    } else if (res.statusCode >= 400) {
      httpLogger.warn("Request completed", entry);
    } else {
      httpLogger.info("Request completed", entry);
    }
  });

  next();
}
