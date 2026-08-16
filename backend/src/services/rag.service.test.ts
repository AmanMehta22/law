import { afterEach, describe, expect, it, vi } from "vitest";
import { ragService } from "./rag.service";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("RagService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns validated results on success", async () => {
    const body = {
      query: "q",
      results: [{ content: "c", metadata: { title: "t" } }],
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, body)));

    const result = await ragService.query("q");

    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toBe("c");
    expect(result.results[0].metadata.title).toBe("t");
  });

  it("throws on non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));

    await expect(ragService.query("q")).rejects.toThrow(
      "RAG service returned HTTP 500",
    );
  });

  it("throws on invalid response shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { query: "q" })),
    );

    await expect(ragService.query("q")).rejects.toThrow(
      "Invalid response from RAG service",
    );
  });

  it("wraps network failures with a clear message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(ragService.query("q")).rejects.toThrow(
      "RAG service unavailable",
    );
  });
});