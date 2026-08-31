import app from "./app";
import { env, logger, prisma } from "./config";
import { assertRequiredEnv } from "./config/env";

// Fail fast on a misconfigured environment instead of letting jwt.sign throw
// an opaque error on the first login attempt.
assertRequiredEnv();

async function logServiceStatuses() {
  const line = "─".repeat(62);
  logger.info(`\n┌${line}┐`);
  logger.info(`│  LegalBot Backend — Service Status (cmd)`.padEnd(62) + " │");
  logger.info(`├${line}┤`);

  // DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info(`│  ✓ DATABASE      ok  ${env.DATABASE_URL.replace(/:[^:@]*@/, ":***@").slice(0, 44).padEnd(44)} │`);
  } catch (e) {
    logger.error(`│  ✗ DATABASE      DOWN  ${(e instanceof Error ? e.message : String(e)).slice(0, 40).padEnd(40)} │`);
  }

  // RAG
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${env.RAG_API_URL}/health`, { signal: controller.signal });
    clearTimeout(t);
    if (res.ok) {
      logger.info(`│  ✓ RAG           ok  ${env.RAG_API_URL.padEnd(44)} │`);
    } else {
      logger.warn(`│  ! RAG           HTTP ${String(res.status).padEnd(39)} │`);
    }
  } catch (e) {
    logger.warn(`│  ✗ RAG           unreachable  ${env.RAG_API_URL.padEnd(33)} │ — ${e instanceof Error ? e.message : String(e)}`);
  }

  // LLM
  const groqCount = env.GROQ_API_KEYS.length;
  const gemCount = env.GEMINI_API_KEYS.length || (env.GEMINI_API_KEY ? 1 : 0);
  const llmOk = groqCount + gemCount > 0;
  logger.info(`│  ${llmOk ? "✓" : "✗"} LLM          ${llmOk ? "ok " : "DOWN"}  order:${env.LLM_PROVIDER_ORDER.join(",").padEnd(12)} groq:${String(groqCount).padEnd(2)} gemini:${String(gemCount).padEnd(2)} │`);
  logger.info(`│    models  groq:${env.GROQ_MODEL.slice(0,18).padEnd(18)} fast:${env.GROQ_FAST_MODEL.slice(0,18).padEnd(18)} │`);
  logger.info(`│            gemini:${env.GEMINI_MODEL.slice(0,16).padEnd(16)} fast:${env.GEMINI_FAST_MODEL.slice(0,16).padEnd(16)} │`);

  // Other
  logger.info(`│  ✓ JWT           ${env.JWT_SECRET ? "configured" : "MISSING".padEnd(44)} │`);
  logger.info(`│  ✓ CORS          ${(env.CORS_ORIGINS.join(",") || "(none)").slice(0,44).padEnd(44)} │`);
  logger.info(`│  ✓ LOG           level=${env.LOG_LEVEL.padEnd(8)} enabled=${String(env.ENABLE_LOGS).padEnd(26)} │`);
  logger.info(`└${line}┘\n`);
  logger.info("All services logged to cmd via pino (see [BACKEND] prefix). HTTP requests also log via [BACKEND][HTTP].");
}

// Print service table before listening so the first thing in cmd is the status dashboard.
let server: ReturnType<typeof app.listen>;

async function start() {
  await logServiceStatuses();

  server = app.listen(env.PORT, () => {
    logger.info(`Server running on port http://localhost:${env.PORT}`);
    logger.info(`Health: http://localhost:${env.PORT}/health  |  RAG: ${env.RAG_API_URL}/health`);
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
}

start().catch((err) => {
  logger.error({ err: err instanceof Error ? err.stack : String(err) }, "Failed to start server");
  process.exit(1);
});

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
