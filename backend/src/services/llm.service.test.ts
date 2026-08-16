import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInstances } = vi.hoisted(() => ({
  mockInstances: [] as Array<{
    models: { generateContent: ReturnType<typeof vi.fn> };
  }>,
}));

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = { generateContent: vi.fn() };

    constructor() {
      mockInstances.push(this);
    }
  }

  return { GoogleGenAI: MockGoogleGenAI };
});

type LlmServiceModule = typeof import("./llm.service");

let module: LlmServiceModule;

beforeEach(async () => {
  vi.resetModules();
  mockInstances.length = 0;
  process.env.GEMINI_API_KEY = "key-one";
  process.env.GEMINI_API_KEYS = "key-one,key-two";
  module = await import("./llm.service");
});

afterAll(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEYS;
});

describe("LLMService key rotation", () => {
  it("creates one client per configured key", () => {
    expect(mockInstances).toHaveLength(2);
  });

  it("rotates to the next key on a 429 and succeeds", async () => {
    vi.useFakeTimers();

    try {
      mockInstances[0].models.generateContent.mockRejectedValueOnce({
        status: 429,
      });
      mockInstances[1].models.generateContent.mockResolvedValueOnce({
        text: "ok",
      });

      const promise = module.llmService.generate({
        systemPrompt: "s",
        userPrompt: "u",
      });

      await vi.advanceTimersByTimeAsync(60_000);

      await expect(promise).resolves.toBe("ok");
      expect(mockInstances[0].models.generateContent).toHaveBeenCalledTimes(1);
      expect(mockInstances[1].models.generateContent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rotates on 503 and gives up after max attempts", async () => {
    vi.useFakeTimers();

    try {
      mockInstances[0].models.generateContent.mockRejectedValue({
        status: 503,
      });
      mockInstances[1].models.generateContent.mockRejectedValue({
        status: 503,
      });

      const promise = module.llmService.generate({
        systemPrompt: "s",
        userPrompt: "u",
      });

      promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(120_000);

      await expect(promise).rejects.toMatchObject({ status: 503 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not rotate on non-retryable errors", async () => {
    mockInstances[0].models.generateContent.mockRejectedValueOnce({
      status: 400,
    });

    await expect(
      module.llmService.generate({ systemPrompt: "s", userPrompt: "u" }),
    ).rejects.toMatchObject({ status: 400 });

    expect(mockInstances[0].models.generateContent).toHaveBeenCalledTimes(1);
    expect(mockInstances[1].models.generateContent).not.toHaveBeenCalled();
  });

  it("switches keys when a request takes too long", async () => {
    vi.useFakeTimers();

    try {
      mockInstances[0].models.generateContent.mockReturnValue(
        new Promise(() => {}),
      );
      mockInstances[1].models.generateContent.mockResolvedValue({
        text: "fast",
      });

      const promise = module.llmService.generate({
        systemPrompt: "s",
        userPrompt: "u",
      });

      await vi.advanceTimersByTimeAsync(120_000);

      await expect(promise).resolves.toBe("fast");
      expect(mockInstances[0].models.generateContent).toHaveBeenCalledTimes(1);
      expect(mockInstances[1].models.generateContent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses the same key on success", async () => {
    mockInstances[0].models.generateContent.mockResolvedValue({ text: "one" });

    const first = await module.llmService.generate({
      systemPrompt: "s",
      userPrompt: "u",
    });
    const second = await module.llmService.generate({
      systemPrompt: "s",
      userPrompt: "u",
    });

    expect(first).toBe("one");
    expect(second).toBe("one");
    expect(mockInstances[0].models.generateContent).toHaveBeenCalledTimes(2);
    expect(mockInstances[1].models.generateContent).not.toHaveBeenCalled();
  });
});