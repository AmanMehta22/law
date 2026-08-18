import dotenv from "dotenv";

dotenv.config();

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
  GROQ_MODEL: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  LOG_LEVEL: process.env.LOG_LEVEL || "debug",
  ENABLE_LOGS: process.env.ENABLE_LOGS || true,
  RAG_API_URL: process.env.RAG_API_URL ?? "http://localhost:8000",
  RAG_TOP_K: Number(process.env.RAG_TOP_K) || 5,
};
