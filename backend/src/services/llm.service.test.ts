import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInstances } = vi.hoisted(() => ({
  mockInstances: [] as Array<{
    models: {
      generateContent: ReturnType<typeof vi.fn>;
      generateContentStream: ReturnType<typeof vi.fn>;
    };
  }>,
}));

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
    };

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
  // Neutralize .env-provided keys so Gemini-only tests never hit Groq;
  // dotenv will not override a variable that already exists.
  process.env.GROQ_API_KEYS = "";
  module = await import("./llm.service");
});

afterAll(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEYS;
});

function makeChunks(...texts: string[]): AsyncGenerator<{ text: string }> {
  async function* generator() {
    for (const text of texts) {
      yield { text };
    }
  }

  return generator();
}

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

describe("LLMService streaming", () => {
  it("streams incremental chunks and returns the full text", async () => {
    mockInstances[0].models.generateContentStream.mockResolvedValue(
      makeChunks("Hel", "lo", "!"),
    );

    const received: string[] = [];

    const text = await module.llmService.generate(
      { systemPrompt: "s", userPrompt: "u" },
      (token) => received.push(token),
    );

    expect(text).toBe("Hello!");
    expect(received).toEqual(["Hel", "lo", "!"]);
  });

  it("streams a single chunk and returns the full text", async () => {
    mockInstances[0].models.generateContentStream.mockResolvedValue(
      makeChunks("full"),
    );

    const received: string[] = [];

    const text = await module.llmService.generate(
      { systemPrompt: "s", userPrompt: "u" },
      (token) => received.push(token),
    );

    expect(text).toBe("full");
    expect(received).toEqual(["full"]);
  });

  it("does not retry a stream that already emitted tokens", async () => {
    async function* failingChunks() {
      yield { text: "partial" };
      throw { status: 503 };
    }

    mockInstances[0].models.generateContentStream.mockResolvedValue(
      failingChunks(),
    );
    mockInstances[1].models.generateContentStream.mockResolvedValue(
      makeChunks("should-not-run"),
    );

    await expect(
      module.llmService.generate(
        { systemPrompt: "s", userPrompt: "u" },
        () => {},
      ),
    ).rejects.toMatchObject({ status: 503 });

    expect(mockInstances[1].models.generateContentStream).not.toHaveBeenCalled();
  });

  it("rotates to the next key when the stream times out before the first chunk", async () => {
    vi.useFakeTimers();

    try {
      mockInstances[0].models.generateContentStream.mockReturnValue(
        new Promise(() => {}),
      );
      mockInstances[1].models.generateContentStream.mockResolvedValue(
        makeChunks("recovered"),
      );

      const promise = module.llmService.generate(
        { systemPrompt: "s", userPrompt: "u" },
        () => {},
      );

      await vi.advanceTimersByTimeAsync(120_000);

      await expect(promise).resolves.toBe("recovered");
      expect(mockInstances[1].models.generateContentStream).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("LLMService Groq fallback", () => {
  async function reloadWithGroqKeys(keys: string): Promise<void> {
    process.env.GROQ_API_KEYS = keys;
    vi.resetModules();
    mockInstances.length = 0;
    module = await import("./llm.service");
  }

  afterEach(() => {
    delete process.env.GROQ_API_KEYS;
    vi.unstubAllGlobals();
  });

  it("falls back to Groq when every Gemini key is out of quota", async () => {
    await reloadWithGroqKeys("groq-one");

    mockInstances[0].models.generateContent.mockRejectedValue({ status: 429 });
    mockInstances[1].models.generateContent.mockRejectedValue({ status: 429 });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "groq answer" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const text = await module.llmService.generate({
      systemPrompt: "s",
      userPrompt: "u",
    });

    expect(text).toBe("groq answer");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = fetchMock.mock.calls[0][0];
    const options = fetchMock.mock.calls[0][1];
    expect(url).toContain("api.groq.com");
    expect(options.headers.Authorization).toBe("Bearer groq-one");
  });

  it("rotates Groq keys on 429 and succeeds with the next key", async () => {
    vi.useFakeTimers();

    try {
      await reloadWithGroqKeys("groq-one,groq-two");

      mockInstances[0].models.generateContent.mockRejectedValue({
        status: 503,
      });
      mockInstances[1].models.generateContent.mockRejectedValue({
        status: 503,
      });

      const fetchMock = vi.fn();
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "second key wins" } }],
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const promise = module.llmService.generate({
        systemPrompt: "s",
        userPrompt: "u",
      });

      await vi.advanceTimersByTimeAsync(60_000);

      await expect(promise).resolves.toBe("second key wins");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
        "Bearer groq-two",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fall back to Groq on non-retryable Gemini errors", async () => {
    await reloadWithGroqKeys("groq-one");

    mockInstances[0].models.generateContent.mockRejectedValueOnce({
      status: 400,
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      module.llmService.generate({ systemPrompt: "s", userPrompt: "u" }),
    ).rejects.toMatchObject({ status: 400 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fall back when no Groq keys are configured", async () => {
    mockInstances[0].models.generateContent.mockRejectedValue({ status: 429 });
    mockInstances[1].models.generateContent.mockRejectedValue({ status: 429 });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      module.llmService.generate({ systemPrompt: "s", userPrompt: "u" }),
    ).rejects.toMatchObject({ status: 429 });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});