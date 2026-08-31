import { env } from "../config";
import { logger } from "../logger";
import { pushService } from "../utils/requestContext";

const ragLogger = logger.child("RAG");

export interface RagMetadata {
  /** `"v1"` for a verbatim statute chunk, `"v2"` for a knowledge card. */
  source?: string;
  concept_id?: string;
  concept_type?: string;
  title?: string;
  review_status?: string;
  derived_from?: string;
  related_concepts?: string;

  // Present only on `source: "v1"` statute chunks. The retriever's dense search is
  // filtered to `source: "v2"`, so these arrive only via its section-lift path —
  // which fires when the query names a section explicitly. They must be recognised,
  // or genuine statutory text gets rendered to the model as interpretive material.
  v1_id?: string;
  official_text?: string;
  section_number?: string;
  subsection_number?: string;
  node_type?: string;
  content_type?: string;
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
    pushService("RagService");
    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const start = Date.now();

    ragLogger.info("Querying RAG service", {
      url: `${this.baseUrl}/query`,
      topK: this.topK,
      queryPreview: query.slice(0, 120),
    });

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
      ragLogger.error("RAG service request failed", {
        duration: `${Date.now() - start}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

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
      ragLogger.error("RAG service returned an error response", {
        status: response.status,
        duration: `${Date.now() - start}ms`,
      });

      throw new Error(`RAG service returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as RagApiResponse;

    if (typeof data.query !== "string" || !Array.isArray(data.results)) {
      ragLogger.error("RAG service returned a malformed response");

      throw new Error("Invalid response from RAG service");
    }

    ragLogger.info("RAG retrieval succeeded", {
      resultCount: data.results.length,
      duration: `${Date.now() - start}ms`,
    });

    return data as RagResponse;
  }
}

export const ragService = new RagService();
