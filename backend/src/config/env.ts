import dotenv from "dotenv";

dotenv.config();

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export const env = {
  PORT: Number(process.env.PORT) || 3000,

  DATABASE_URL: process.env.DATABASE_URL ?? "",

  JWT_SECRET: process.env.JWT_SECRET ?? "",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  GEMINI_API_KEYS: (process.env.GEMINI_API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean),
  GROQ_API_KEYS: (process.env.GROQ_API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean),

  // Provider order, tried left to right. Groq leads by default: it is the
  // faster provider and Gemini's free tier is the one that returns 503
  // "high demand" under load. Flip this to "gemini,groq" without a code change.
  LLM_PROVIDER_ORDER: (process.env.LLM_PROVIDER_ORDER || "groq,gemini")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name === "groq" || name === "gemini"),

  // Two model tiers per provider. "fast" serves the small structured calls
  // (intent classification, slot checks, retrieval-query rewriting) which are
  // a few dozen characters and need speed, not depth. "quality" serves the
  // user-facing legal answer. Sending a 47-character classification to a
  // 120B model was pure latency and quota waste.
  //
  // Defaults use Groq's current catalogue: every meta-llama/* chat model was
  // decommissioned in Aug 2026 and returns 404 model_not_found.
  GROQ_MODEL: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  GROQ_FAST_MODEL: process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-flash-latest",
  GEMINI_FAST_MODEL:
    process.env.GEMINI_FAST_MODEL || "gemini-flash-lite-latest",

  // Per-call budgets. A doomed fast call used to burn the full 25s generation
  // timeout before anything else could be tried.
  LLM_TIMEOUT_MS: Number(process.env.LLM_TIMEOUT_MS) || 25_000,
  LLM_FAST_TIMEOUT_MS: Number(process.env.LLM_FAST_TIMEOUT_MS) || 8_000,

  LOG_LEVEL: process.env.LOG_LEVEL || "debug",
  ENABLE_LOGS: parseBoolean(process.env.ENABLE_LOGS, true),
  RAG_API_URL: process.env.RAG_API_URL ?? "http://localhost:8000",
  RAG_TOP_K: Number(process.env.RAG_TOP_K) || 5,

  // Origins allowed by CORS, comma-separated (e.g.
  // "http://localhost:5173,https://app.example.com"). Empty allows nothing
  // cross-origin.
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

// Called once at server startup (not at import time) so tests and tooling
// can import modules without a fully provisioned .env.
export function assertRequiredEnv() {
  const missing: string[] = [];

  if (!env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    missing.push("JWT_SECRET (must be at least 32 characters)");
  }

  if (
    env.GEMINI_API_KEYS.length === 0 &&
    env.GROQ_API_KEYS.length === 0 &&
    !env.GEMINI_API_KEY
  ) {
    missing.push("GEMINI_API_KEYS and/or GROQ_API_KEYS");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or invalid required environment variables:\n  - ${missing.join("\n  - ")}\n` +
        "Fill these in in backend/.env before starting the server.",
    );
  }
}
