import { GoogleGenAI } from "@google/genai";
import { env } from "../config";

export interface GenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
}

interface ApiErrorLike extends Error {
  status?: number;
}

class RequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "RequestTimeoutError";
  }
}

class LLMService {
  private clients: GoogleGenAI[];
  private currentKeyIndex = 0;

  private readonly maxAttempts = 4;
  private readonly baseDelayMs = 2_000;
  private readonly requestTimeoutMs = 45_000;

  constructor() {
    const keys =
      env.GEMINI_API_KEYS.length > 0
        ? env.GEMINI_API_KEYS
        : [env.GEMINI_API_KEY];

    if (keys.length === 0 || keys.some((key) => key.length === 0)) {
      throw new Error("No Gemini API keys configured");
    }

    this.clients = keys.map(
      (apiKey) =>
        new GoogleGenAI({
          apiKey,
        }),
    );
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof RequestTimeoutError) {
      return true;
    }

    const status = (error as ApiErrorLike | null)?.status;

    return status === 429 || status === 503;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new RequestTimeoutError(`Gemini request timed out after ${ms}ms`),
          ),
        ms,
      );

      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private async generateWithRetry(request: GenerateRequest): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const client = this.clients[this.currentKeyIndex];

      try {
        const response = await this.withTimeout(
          client.models.generateContent({
            model: request.model ?? "gemini-flash-latest",
            contents: request.userPrompt,
            config: {
              systemInstruction: request.systemPrompt,
              temperature: request.temperature ?? 0,
            },
          }),
          this.requestTimeoutMs,
        );

        return response.text ?? "";
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error) || attempt === this.maxAttempts) {
          throw error;
        }

        // Rotate to the next API key on quota, load, or slow responses
        this.currentKeyIndex =
          (this.currentKeyIndex + 1) % this.clients.length;

        const backoff = this.baseDelayMs * 2 ** (attempt - 1);
        const jitter = Math.random() * backoff;

        await this.delay(backoff + jitter);
      }
    }

    throw lastError;
  }

  async generate(request: GenerateRequest) {
    return this.generateWithRetry(request);
  }

  async generateJson<T>(request: GenerateRequest): Promise<T> {
    const text = await this.generateWithRetry(request);

    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned) as T;
  }
}

export const llmService = new LLMService();