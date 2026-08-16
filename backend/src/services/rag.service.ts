import { env } from "../config";

export interface RagMetadata {
  source?: string;
  concept_id?: string;
  concept_type?: string;
  title?: string;
  review_status?: string;
  derived_from?: string;
  related_concepts?: string;
}

export interface RagResult {
  content: string;
  metadata: RagMetadata;
}

export interface RagResponse {
  query: string;
  results: RagResult[];
}

interface RagApiResponse {
  query?: unknown;
  results?: unknown;
}

class RagService {
  private readonly baseUrl: string;
  private readonly timeoutMs = 30_000;
  private readonly topK: number;

  constructor() {
    this.baseUrl = env.RAG_API_URL.replace(/\/$/, "");
    this.topK = Number(env.RAG_TOP_K ?? 5);
  }

  async query(query: string): Promise<RagResponse> {
    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          top_k: this.topK,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`RAG service timed out after ${this.timeoutMs}ms`);
      }

      throw new Error(
        `RAG service unavailable: ${
          error instanceof Error ? error.message : "Unknown network error"
        }`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`RAG service returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as RagApiResponse;

    if (typeof data.query !== "string" || !Array.isArray(data.results)) {
      throw new Error("Invalid response from RAG service");
    }

    return data as RagResponse;
  }
}

export const ragService = new RagService();
