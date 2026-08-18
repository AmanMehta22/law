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

const QUOTA_COOLDOWN_MS = 30_000;
const MAX_BACKOFF_MS = 4_000;
const OVERALL_TIMEOUT_MS = 90_000;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

interface GroqCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

class LLMService {
  private clients: GoogleGenAI[];
  private groqKeys: string[];
  private currentKeyIndex = 0;
  private groqKeyIndex = 0;
  private quotaCooldownUntil: Map<number, number> = new Map();
  private groqQuotaCooldownUntil: Map<number, number> = new Map();

  private readonly maxAttempts = 2;
  private readonly baseDelayMs = 750;
  private readonly requestTimeoutMs = 25_000;

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

    this.groqKeys = env.GROQ_API_KEYS;
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
            new RequestTimeoutError(`LLM request timed out after ${ms}ms`),
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

  // Round-robin with a cooldown: keys that recently hit quota limits are
  // skipped until their cooldown expires. Falls back to the current key
  // when every key is cooling down.
  private nextClientIndex(): number {
    const start = this.currentKeyIndex;
    const now = Date.now();

    for (let i = 0; i < this.clients.length; i++) {
      const candidate = (start + i) % this.clients.length;

      if ((this.quotaCooldownUntil.get(candidate) ?? 0) <= now) {
        return candidate;
      }
    }

    return start;
  }

  private nextGroqKeyIndex(): number {
    const start = this.groqKeyIndex;
    const now = Date.now();

    for (let i = 0; i < this.groqKeys.length; i++) {
      const candidate = (start + i) % this.groqKeys.length;

      if ((this.groqQuotaCooldownUntil.get(candidate) ?? 0) <= now) {
        return candidate;
      }
    }

    return start;
  }

  private markQuotaError(clientIndex: number): void {
    this.quotaCooldownUntil.set(clientIndex, Date.now() + QUOTA_COOLDOWN_MS);
  }

  private markGroqQuotaError(keyIndex: number): void {
    this.groqQuotaCooldownUntil.set(
      keyIndex,
      Date.now() + QUOTA_COOLDOWN_MS,
    );
  }

  // Streams the response in token chunks. Only the first chunk is guarded
  // by the request timeout; each subsequent chunk is also guarded so a
  // stalled stream surfaces an error instead of hanging forever.
  private async streamWithTimeout(
    client: GoogleGenAI,
    request: GenerateRequest,
    onToken: (token: string) => void,
    onTokensEmitted: (charCount: number) => void,
  ): Promise<string> {
    const stream = await this.withTimeout(
      client.models.generateContentStream({
        model: request.model ?? "gemini-flash-latest",
        contents: request.userPrompt,
        config: {
          systemInstruction: request.systemPrompt,
          temperature: request.temperature ?? 0,
        },
      }),
      this.requestTimeoutMs,
    );

    const iterator = stream[Symbol.asyncIterator]();

    let fullText = "";
    let tokensEmitted = 0;

    for (;;) {
      const { done, value } = await this.withTimeout(
        iterator.next(),
        this.requestTimeoutMs,
      );

      if (done) {
        break;
      }

      const delta = value.text ?? "";

      if (delta) {
        fullText += delta;
        tokensEmitted += delta.length;
        onTokensEmitted(tokensEmitted);
        onToken(delta);
      }
    }

    return fullText;
  }

  private async geminiGenerate(
    request: GenerateRequest,
    onToken: ((token: string) => void) | undefined,
  ): Promise<string> {
    let lastError: unknown;
    let tokensEmitted = 0;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const clientIndex = this.nextClientIndex();
      const client = this.clients[clientIndex];

      try {
        if (onToken) {
          return await this.streamWithTimeout(
            client,
            request,
            onToken,
            (count) => {
              tokensEmitted = count;
            },
          );
        }

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

        if (
          !this.isRetryable(error) ||
          attempt === this.maxAttempts ||
          tokensEmitted > 0
        ) {
          throw error;
        }

        if ((error as ApiErrorLike | null)?.status === 429) {
          this.markQuotaError(clientIndex);
        }

        // Rotate to the next API key on quota, load, or slow responses
        this.currentKeyIndex =
          (this.currentKeyIndex + 1) % this.clients.length;

        const backoff = Math.min(
          this.baseDelayMs * 2 ** (attempt - 1),
          MAX_BACKOFF_MS,
        );
        const jitter = Math.random() * backoff;

        await this.delay(backoff + jitter);
      }
    }

    throw lastError;
  }

  private async groqCompletion(
    keyIndex: number,
    request: GenerateRequest,
  ): Promise<string> {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.groqKeys[keyIndex]}`,
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        temperature: request.temperature ?? 0,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = new Error(
        `Groq request failed with status ${response.status}`,
      ) as ApiErrorLike;

      error.status = response.status;

      throw error;
    }

    const body = (await response.json()) as GroqCompletionResponse;

    return body.choices?.[0]?.message?.content ?? "";
  }

  // Fallback provider used when every Gemini key is out of quota, overloaded,
  // or timing out. Keeps the bot usable when Google free-tier is saturated.
  private async groqGenerate(request: GenerateRequest): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const keyIndex = this.nextGroqKeyIndex();

      try {
        return await this.withTimeout(
          this.groqCompletion(keyIndex, request),
          this.requestTimeoutMs,
        );
      } catch (error) {
        lastError = error;

        // Groq returns 403 for transient IP-level access blocks as well as
        // invalid keys. Retrying with backoff keeps the bot usable during
        // burst windows, since the keys themselves remain valid.
        const status = (error as ApiErrorLike | null)?.status;

        if (
          (status !== 403 && !this.isRetryable(error)) ||
          attempt === this.maxAttempts
        ) {
          throw error;
        }

        if (status === 429) {
          this.markGroqQuotaError(keyIndex);
        }

        this.groqKeyIndex = (this.groqKeyIndex + 1) % this.groqKeys.length;

        const backoff = Math.min(
          this.baseDelayMs * 2 ** (attempt - 1),
          MAX_BACKOFF_MS,
        );
        const jitter = Math.random() * backoff;

        await this.delay(backoff + jitter);
      }
    }

    throw lastError;
  }

  private async generateWithRetry(
    request: GenerateRequest,
    onToken?: (token: string) => void,
  ): Promise<string> {
    try {
      return await this.geminiGenerate(request, onToken);
    } catch (error) {
      if (!this.isRetryable(error) || this.groqKeys.length === 0) {
        throw error;
      }

      return this.groqGenerate(request);
    }
  }

  async generate(request: GenerateRequest, onToken?: (token: string) => void) {
    return this.withTimeout(
      this.generateWithRetry(request, onToken),
      OVERALL_TIMEOUT_MS,
    );
  }

  async generateJson<T>(request: GenerateRequest): Promise<T> {
    const text = await this.withTimeout(
      this.generateWithRetry(request),
      OVERALL_TIMEOUT_MS,
    );

    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned) as T;
  }
}

export const llmService = new LLMService();