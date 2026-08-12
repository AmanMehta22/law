import { env } from "../config";

export interface RagMetadata {
  concept_id?: string;
  concept_type?: string;
  title?: string;
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

  constructor() {
    this.baseUrl = env.RAG_API_URL.replace(/\/$/, "");
  }

  async query(query: string): Promise<RagResponse> {
    const response = await fetch(`${this.baseUrl}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
      }),
    });

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
