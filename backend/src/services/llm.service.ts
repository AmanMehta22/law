import { GoogleGenAI } from "@google/genai";
import { env } from "../config";
import { AppError } from "../errors/AppError";
import { logger } from "../logger";

const llmLogger = logger.child("LLM");

export type LlmProvider = "groq" | "gemini";

/**
 * Which model tier a call needs.
 *
 * "fast"    - small structured calls: intent classification, slot checks,
 *             retrieval-query rewriting. Tens of characters in, a word or a
 *             tiny JSON object out. These want latency, not depth.
 * "quality" - the user-facing legal answer. This is the only call that
 *             justifies the big model.
 */
export type LlmTask = "fast" | "quality";

export interface GenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  /**
   * Legacy escape hatch: pins the Gemini model name only. Prefer `task`,
   * which picks the right model for whichever provider actually serves
   * the call.
   */
  model?: string;
  task?: LlmTask;
  temperature?: number;
  /**
   * Ask the provider for strict JSON natively (Groq `response_format`,
   * Gemini `responseMimeType`) instead of hoping the prose comes back clean.
   */
  json?: boolean;
  onProvider?: (provider: LlmProvider) => void;
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

/**
 * Why a call failed, which decides what is worth trying next.
 *
 * The old code lumped these together and treated a 503 the same as a 429,
 * so it rotated API keys against an overloaded model pool and burned ~20s
 * before giving up. Keys and capacity are different problems.
 */
type FailureKind =
  /** Model pool is overloaded (503/502/504). Another key will not help. */
  | "capacity"
  /** This key is out of quota (429, and Gemini's quota-in-disguise 500s). */
  | "quota"
  /** Key is invalid, revoked, or lacks access to the model (401/403). */
  | "auth"
  /** Malformed request or unknown model name (400/404/422). */
  | "badRequest"
  | "timeout"
  | "unknown";

/** A key that just hit quota is likely still throttled a moment later. */
const QUOTA_COOLDOWN_MS = 30_000;
/** A rejected key is broken, not busy. Waiting does not fix it. */
const AUTH_COOLDOWN_MS = 10 * 60_000;
/** An overloaded model pool needs time, and every key shares it. */
const CAPACITY_COOLDOWN_MS = 20_000;
/** Every key on the provider was rejected: stop paying the round trip. */
const PROVIDER_AUTH_COOLDOWN_MS = 10 * 60_000;

const MAX_KEY_ATTEMPTS = 3;
/** Two slow attempts is already too much latency to spend on one provider. */
const MAX_TIMEOUT_ATTEMPTS = 2;
const MAX_BACKOFF_MS = 4_000;
const OVERALL_TIMEOUT_MS = 90_000;
const FAST_OVERALL_TIMEOUT_MS = 30_000;

/** Generous ceiling for the first token of a long-prompt generation. */
const FIRST_TOKEN_TIMEOUT_MS = 60_000;

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

interface GroqCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface GroqStreamChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

/**
 * Tracks how much text has already reached the user. Once a stream has
 * emitted anything, retrying or failing over would duplicate visible text,
 * so this is the hard stop on all recovery paths.
 */
interface EmissionCounter {
  count: number;
}

class LLMService {
  private geminiClients: GoogleGenAI[];
  private groqKeys: string[];
  private providerOrder: LlmProvider[];

  private keyIndex: Record<LlmProvider, number> = { groq: 0, gemini: 0 };

  private keyCooldownUntil: Record<LlmProvider, Map<number, number>> = {
    groq: new Map(),
    gemini: new Map(),
  };

  private providerCooldownUntil: Map<LlmProvider, number> = new Map();

  private readonly baseDelayMs = 750;

  constructor() {
    const geminiKeys = (
      env.GEMINI_API_KEYS.length > 0
        ? env.GEMINI_API_KEYS
        : [env.GEMINI_API_KEY]
    ).filter((key) => key.length > 0);

    this.geminiClients = geminiKeys.map(
      (apiKey) =>
        new GoogleGenAI({
          apiKey,
        }),
    );

    this.groqKeys = env.GROQ_API_KEYS;

    const configured = env.LLM_PROVIDER_ORDER as LlmProvider[];

    this.providerOrder =
      configured.length > 0 ? configured : ["groq", "gemini"];

    if (this.keyCount("groq") === 0 && this.keyCount("gemini") === 0) {
      throw new Error("No LLM API keys configured (set GROQ_API_KEYS or GEMINI_API_KEYS)");
    }

    llmLogger.info("LLM providers ready", {
      order: this.providerOrder.join(","),
      groqKeys: this.groqKeys.length,
      geminiKeys: this.geminiClients.length,
    });
  }

  // --------------------------------------------------
  // Configuration helpers
  // --------------------------------------------------

  private keyCount(provider: LlmProvider): number {
    return provider === "groq"
      ? this.groqKeys.length
      : this.geminiClients.length;
  }

  private modelFor(provider: LlmProvider, request: GenerateRequest): string {
    const fast = request.task === "fast";

    if (provider === "groq") {
      return fast ? env.GROQ_FAST_MODEL : env.GROQ_MODEL;
    }

    if (request.model) {
      return request.model;
    }

    return fast ? env.GEMINI_FAST_MODEL : env.GEMINI_MODEL;
  }

  private timeoutFor(request: GenerateRequest): number {
    return request.task === "fast"
      ? env.LLM_FAST_TIMEOUT_MS
      : env.LLM_TIMEOUT_MS;
  }

  /**
   * Budget for the wait up to the first visible token. The per-call budget
   * above also guards every subsequent chunk read, but long prompts can
   * legitimately take longer than that just to start producing text, so
   * only this initial wait gets the extended ceiling.
   */
  private firstTokenTimeoutFor(request: GenerateRequest): number {
    return request.task === "fast"
      ? env.LLM_FAST_TIMEOUT_MS
      : Math.max(env.LLM_TIMEOUT_MS, FIRST_TOKEN_TIMEOUT_MS);
  }

  private overallTimeoutFor(request: GenerateRequest): number {
    return request.task === "fast"
      ? FAST_OVERALL_TIMEOUT_MS
      : OVERALL_TIMEOUT_MS;
  }

  // --------------------------------------------------
  // Generic plumbing
  // --------------------------------------------------

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

  private classifyFailure(
    provider: LlmProvider,
    error: unknown,
  ): FailureKind {
    if (error instanceof RequestTimeoutError) {
      return "timeout";
    }

    const status = (error as ApiErrorLike | null)?.status;

    if (status === 429) {
      return "quota";
    }

    if (status === 401 || status === 403) {
      return "auth";
    }

    // A quota-exhausted Gemini free-tier project reports INTERNAL 500 rather
    // than 429, so on Gemini a 500 is a key problem, not a pool problem.
    if (status === 500) {
      return provider === "gemini" ? "quota" : "capacity";
    }

    if (status === 502 || status === 503 || status === 504) {
      return "capacity";
    }

    if (status === 400 || status === 404 || status === 422) {
      return "badRequest";
    }

    return "unknown";
  }

  // --------------------------------------------------
  // Key and provider cooldowns
  // --------------------------------------------------

  private keyIsAvailable(provider: LlmProvider, index: number): boolean {
    return (this.keyCooldownUntil[provider].get(index) ?? 0) <= Date.now();
  }

  private allKeysCoolingDown(provider: LlmProvider): boolean {
    const count = this.keyCount(provider);

    if (count === 0) {
      return true;
    }

    for (let index = 0; index < count; index++) {
      if (this.keyIsAvailable(provider, index)) {
        return false;
      }
    }

    return true;
  }

  private nextKeyIndex(provider: LlmProvider): number {
    const count = this.keyCount(provider);
    const start = this.keyIndex[provider] % count;

    for (let offset = 0; offset < count; offset++) {
      const candidate = (start + offset) % count;

      if (this.keyIsAvailable(provider, candidate)) {
        return candidate;
      }
    }

    return start;
  }

  private advanceKey(provider: LlmProvider): void {
    const count = this.keyCount(provider);

    this.keyIndex[provider] = (this.keyIndex[provider] + 1) % count;
  }

  private coolKey(provider: LlmProvider, index: number, ms: number): void {
    this.keyCooldownUntil[provider].set(index, Date.now() + ms);
  }

  private coolProvider(
    provider: LlmProvider,
    ms: number,
    reason: FailureKind,
  ): void {
    this.providerCooldownUntil.set(provider, Date.now() + ms);

    llmLogger.warn("Provider put on cooldown", {
      provider,
      reason,
      cooldownMs: ms,
    });
  }

  private providerIsCoolingDown(provider: LlmProvider): boolean {
    return (this.providerCooldownUntil.get(provider) ?? 0) > Date.now();
  }

  // --------------------------------------------------
  // Gemini
  // --------------------------------------------------

  private async geminiCall(
    keyIndex: number,
    request: GenerateRequest,
    onToken: ((token: string) => void) | undefined,
    emitted: EmissionCounter,
  ): Promise<string> {
    const client = this.geminiClients[keyIndex];
    const model = this.modelFor("gemini", request);
    const timeoutMs = this.timeoutFor(request);
    const firstTokenTimeoutMs = this.firstTokenTimeoutFor(request);

    const config: Record<string, unknown> = {
      systemInstruction: request.systemPrompt,
      temperature: request.temperature ?? 0,
    };

    if (request.json) {
      config.responseMimeType = "application/json";
    }

    if (!onToken) {
      // A non-streaming call delivers everything in one shot, so its whole
      // duration is effectively a first-token wait.
      const response = await this.withTimeout(
        client.models.generateContent({
          model,
          contents: request.userPrompt,
          config,
        }),
        firstTokenTimeoutMs,
      );

      return response.text ?? "";
    }

    const stream = await this.withTimeout(
      client.models.generateContentStream({
        model,
        contents: request.userPrompt,
        config,
      }),
      firstTokenTimeoutMs,
    );

    const iterator = stream[Symbol.asyncIterator]();

    let fullText = "";

    for (;;) {
      // Only the first read gets the extended budget: it covers model
      // thinking time on long prompts. Later reads just watch for stalls.
      const { done, value } = await this.withTimeout(
        iterator.next(),
        fullText ? timeoutMs : firstTokenTimeoutMs,
      );

      if (done) {
        break;
      }

      const delta = value.text ?? "";

      if (delta) {
        fullText += delta;
        emitted.count += delta.length;
        onToken(delta);
      }
    }

    return fullText;
  }

  // --------------------------------------------------
  // Groq
  // --------------------------------------------------

  private async groqCall(
    keyIndex: number,
    request: GenerateRequest,
    onToken: ((token: string) => void) | undefined,
    emitted: EmissionCounter,
  ): Promise<string> {
    const model = this.modelFor("groq", request);
    const timeoutMs = this.timeoutFor(request);
    const firstTokenTimeoutMs = this.firstTokenTimeoutFor(request);

    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
      temperature: request.temperature ?? 0,
      stream: Boolean(onToken),
    };

    if (request.json) {
      body.response_format = { type: "json_object" };
    }

    const response = await this.withTimeout(
      fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.groqKeys[keyIndex]}`,
        },
        body: JSON.stringify(body),
      }),
      firstTokenTimeoutMs,
    );

    if (!response.ok) {
      throw await this.groqError(response);
    }

    if (!onToken) {
      const parsed = (await response.json()) as GroqCompletionResponse;

      return parsed.choices?.[0]?.message?.content ?? "";
    }

    return this.readGroqStream(
      response,
      onToken,
      emitted,
      firstTokenTimeoutMs,
      timeoutMs,
    );
  }

  /**
   * Groq's failure bodies carry the actual reason - which model is not
   * available to the key, whether the key was revoked, whether the org is
   * blocked. The old error text was just the bare status, which is why a
   * 403 looked indistinguishable from a transient blip.
   */
  private async groqError(response: Response): Promise<ApiErrorLike> {
    let detail = "";

    try {
      detail = (await response.text()).slice(0, 300);
    } catch {
      // Body already consumed or unreadable: the status alone still routes.
    }

    const error = new Error(
      `Groq request failed with status ${response.status}${
        detail ? `: ${detail}` : ""
      }`,
    ) as ApiErrorLike;

    error.status = response.status;

    return error;
  }

  /**
   * Reads Groq's OpenAI-style SSE stream. Without this, promoting Groq to
   * primary would silently drop token streaming: the answer would land in
   * the UI as one block at the end.
   */
  private async readGroqStream(
    response: Response,
    onToken: (token: string) => void,
    emitted: EmissionCounter,
    firstTokenTimeoutMs: number,
    timeoutMs: number,
  ): Promise<string> {
    const body = response.body;

    if (!body) {
      throw new Error("Groq streaming response had no body");
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let fullText = "";

    const consume = (rawEvent: string): boolean => {
      const { done, text } = this.parseGroqEvent(rawEvent);

      if (text) {
        fullText += text;
        emitted.count += text.length;
        onToken(text);
      }

      return done;
    };

    try {
      for (;;) {
        const { done, value } = await this.withTimeout(
          reader.read(),
          fullText ? timeoutMs : firstTokenTimeoutMs,
        );

        if (done) {
          break;
        }

        // Carriage returns are stripped so a single "\n\n" scan finds the
        // event boundary regardless of whether the server sends CRLF.
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");

        let boundary = buffer.indexOf("\n\n");

        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);

          buffer = buffer.slice(boundary + 2);

          if (consume(rawEvent)) {
            return fullText;
          }

          boundary = buffer.indexOf("\n\n");
        }
      }

      // A final event with no trailing blank line still carries tokens.
      if (buffer.trim()) {
        consume(buffer);
      }
    } catch (error) {
      // Release the socket instead of leaving a half-read stream open.
      try {
        await reader.cancel();
      } catch {
        // Cancelling a already-broken stream is not itself an error.
      }

      throw error;
    }

    return fullText;
  }

  private parseGroqEvent(rawEvent: string): { done: boolean; text: string } {
    let text = "";

    for (const line of rawEvent.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const payload = trimmed.slice("data:".length).trim();

      if (payload === "[DONE]") {
        return { done: true, text };
      }

      if (!payload) {
        continue;
      }

      try {
        const parsed = JSON.parse(payload) as GroqStreamChunk;

        text += parsed.choices?.[0]?.delta?.content ?? "";
      } catch {
        // A payload that does not parse is not worth killing a stream that
        // is otherwise delivering tokens.
      }
    }

    return { done: false, text };
  }

  // --------------------------------------------------
  // Per-provider attempt loop
  // --------------------------------------------------

  private async runProvider(
    provider: LlmProvider,
    request: GenerateRequest,
    onToken: ((token: string) => void) | undefined,
    emitted: EmissionCounter,
    ignoreCooldowns: boolean,
  ): Promise<string> {
    if (this.keyCount(provider) === 0) {
      throw new Error(`No API keys configured for ${provider}`);
    }

    if (!ignoreCooldowns) {
      if (this.providerIsCoolingDown(provider)) {
        throw new Error(`${provider} is cooling down`);
      }

      if (this.allKeysCoolingDown(provider)) {
        throw new Error(`All ${provider} keys are cooling down`);
      }
    }

    const maxAttempts = Math.min(this.keyCount(provider), MAX_KEY_ATTEMPTS);

    let lastError: unknown;
    let authFailures = 0;
    let timeoutFailures = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const keyIndex = this.nextKeyIndex(provider);

      llmLogger.debug("Calling LLM provider", {
        provider,
        attempt,
        keyIndex,
        model: this.modelFor(provider, request),
        task: request.task ?? "quality",
        streaming: Boolean(onToken),
        promptChars: request.userPrompt.length,
      });

      try {
        const text =
          provider === "groq"
            ? await this.groqCall(keyIndex, request, onToken, emitted)
            : await this.geminiCall(keyIndex, request, onToken, emitted);

        request.onProvider?.(provider);

        return text;
      } catch (error) {
        lastError = error;

        const kind = this.classifyFailure(provider, error);

        llmLogger.warn("LLM provider call failed", {
          provider,
          attempt,
          keyIndex,
          kind,
          status: (error as ApiErrorLike | null)?.status,
          error: error instanceof Error ? error.message : String(error),
        });

        // The user has already seen these tokens. Any recovery from here
        // would duplicate visible text, so stop.
        if (emitted.count > 0) {
          throw error;
        }

        if (kind === "capacity") {
          // Every key targets the same overloaded model pool, so rotating
          // keys is wasted time. Cool the provider and hand over now. This
          // is the fix for the 20s burn: two 503s used to cost ~16s here.
          this.coolProvider(provider, CAPACITY_COOLDOWN_MS, kind);

          throw error;
        }

        if (kind === "badRequest") {
          // Unknown model or malformed body: the next key fails identically.
          throw error;
        }

        if (kind === "auth") {
          authFailures++;

          this.coolKey(provider, keyIndex, AUTH_COOLDOWN_MS);

          if (authFailures >= this.keyCount(provider)) {
            this.coolProvider(provider, PROVIDER_AUTH_COOLDOWN_MS, kind);

            throw error;
          }
        }

        if (kind === "quota") {
          this.coolKey(provider, keyIndex, QUOTA_COOLDOWN_MS);
        }

        if (kind === "timeout") {
          timeoutFailures++;

          if (timeoutFailures >= MAX_TIMEOUT_ATTEMPTS) {
            throw error;
          }
        }

        this.advanceKey(provider);

        if (attempt === maxAttempts) {
          throw error;
        }

        // A rejected key is not a busy key: backing off changes nothing.
        if (kind !== "auth") {
          const backoff = Math.min(
            this.baseDelayMs * 2 ** (attempt - 1),
            MAX_BACKOFF_MS,
          );

          await this.delay(backoff + Math.random() * backoff);
        }
      }
    }

    throw lastError;
  }

  // --------------------------------------------------
  // Failover across providers
  // --------------------------------------------------

  private async generateWithFailover(
    request: GenerateRequest,
    onToken?: (token: string) => void,
  ): Promise<string> {
    const emitted: EmissionCounter = { count: 0 };

    const configured = this.providerOrder.filter(
      (provider) => this.keyCount(provider) > 0,
    );

    if (configured.length === 0) {
      throw new Error("No LLM providers configured");
    }

    const healthy = configured.filter(
      (provider) =>
        !this.providerIsCoolingDown(provider) &&
        !this.allKeysCoolingDown(provider),
    );

    // Prefer providers that are not cooling down. If every provider is
    // cooling down, still try them rather than refusing to answer.
    const order = healthy.length > 0 ? healthy : configured;
    const ignoreCooldowns = healthy.length === 0;

    let lastError: unknown;

    for (const provider of order) {
      try {
        return await this.runProvider(
          provider,
          request,
          onToken,
          emitted,
          ignoreCooldowns,
        );
      } catch (error) {
        lastError = error;

        // Partially streamed output cannot be retried on another provider.
        if (emitted.count > 0) {
          throw error;
        }

        const next = order[order.indexOf(provider) + 1];

        if (next) {
          llmLogger.info("Failing over to next LLM provider", {
            from: provider,
            to: next,
          });
        }
      }
    }

    throw lastError;
  }

  async generate(request: GenerateRequest, onToken?: (token: string) => void) {
    return this.withTimeout(
      this.generateWithFailover(request, onToken),
      this.overallTimeoutFor(request),
    );
  }

  async generateJson<T>(request: GenerateRequest): Promise<T> {
    const text = await this.withTimeout(
      // Native JSON mode where the provider supports it; the fence stripping
      // below stays as a safety net for models that ignore it.
      this.generateWithFailover({ ...request, json: true }),
      this.overallTimeoutFor(request),
    );

    return parseJsonResponse<T>(text);
  }
}

/**
 * Strips markdown fences and any prose around the JSON body. Kept separate
 * so callers that hand-roll their own parse can share it.
 */
export function parseJsonResponse<T>(text: string): T {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    // Some models still wrap JSON in a sentence. Fall back to the outermost
    // brace pair before giving up.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }

    throw error;
  }
}

export const llmService = new LLMService();
