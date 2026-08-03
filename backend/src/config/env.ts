import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: Number(process.env.PORT) || 3000,

  DATABASE_URL: process.env.DATABASE_URL ?? "",

  JWT_SECRET: process.env.JWT_SECRET ?? "",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
};
