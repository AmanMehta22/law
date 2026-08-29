import app from "./app";
import { env, logger, prisma } from "./config";
import { assertRequiredEnv } from "./config/env";

// Fail fast on a misconfigured environment instead of letting jwt.sign throw
// an opaque error on the first login attempt.
assertRequiredEnv();

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port http://localhost:${env.PORT}`);
});

// Graceful shutdown: stop accepting new connections, drain in-flight ones,
// then close the database pool so nothing is left half-committed.
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);

  const forceExitTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");

    process.exit(1);
  }, 10_000);

  server.close(async () => {
    clearTimeout(forceExitTimer);

    try {
      await prisma.$disconnect();
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
        },
        "Error disconnecting Prisma",
      );
    }

    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Log loudly instead of dying with no context; let the process manager
// decide whether to restart.
process.on("unhandledRejection", (reason) => {
  logger.error(
    {
      err: reason instanceof Error ? reason.stack : String(reason),
    },
    "Unhandled promise rejection",
  );
});

process.on("uncaughtException", (error) => {
  logger.error({ err: error.stack ?? error.message }, "Uncaught exception");

  process.exit(1);
});
