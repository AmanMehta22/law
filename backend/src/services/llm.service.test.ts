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

/**
 * Model names are asserted below, so they are pinned here rather than left to
 * whatever a local .env happens to provide.
 */
function pinModelEnv(): void {
  process.env.GROQ_MODEL = "groq-quality";
  process.env.GROQ_FAST_MODEL = "groq-fast";
  process.env.GEMINI_MODEL = "gemini-quality";
  process.env.GEMINI_FAST_MODEL = "gemini-fast";
}

async function loadModule(): Promise<void> {
  vi.resetModules();
  mockInstances.length = 0;
  module = await import("./llm.service");
}

beforeEach(async () => {
  pinModelEnv();
  process.env.GEMINI_API_KEY = "key-one";
  process.env.GEMINI_API_KEYS = "key-one,key-two";
  // Gemini-only by default so the provider under test is unambiguous;
  // dotenv will not override a variable that already exists.
  process.env.GROQ_API_KEYS = "";
  delete process.env.LLM_PROVIDER_ORDER;

  await loadModule();
});

afterAll(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEYS;
  delete process.env.GROQ_API_KEYS;
  delete process.env.GROQ_MODEL;
  delete process.env.GROQ_FAST_MODEL;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_FAST_MODEL;
});

function makeChunks(...texts: string[]): AsyncGenerator<{ text: string }> {
  async function* generator() {
    for (const text of texts) {
      yield { text };
    }
  }

  return generator();
}

/** Minimal stand-in for a Groq JSON (non-streaming) response. */
function groqJson(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

/** Minimal stand-in for a Groq error response, body included. */
function groqFailure(status: number, detail = "") {
  return {
    ok: false,
    status,
    text: async () => detail,
  };
}

/** Minimal stand-in for Groq's OpenAI-style SSE stream. */
function groqStream(...frames: string[]) {
  const encoder = new TextEncoder();

  let index = 0;

  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          index < frames.length
            ? { done: false, value: encoder.encode(frames[index++]) }
            : { done: true, value: undefined },
        cancel: async () => {},
      }),
    },
  };
}

function deltaFrame(text: string): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content: text } }],
  })}\n\n`;
}

async function reloadWithGroq(keys: string): Promise<void> {
  process.env.GROQ_API_KEYS = keys;

  await loadModule();
}

describe("LLMService Gemini key rotation", () => {
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

  it("does NOT rotate keys on a 503, because every key shares one model pool", async () => {
    mockInstances[0].models.generateContent.mockRejectedValue({ status: 503 });
    mockInstances[1].models.generateContent.mockRejectedValue({ status: 503 });

    await expect(
      module.llmService.generate({ systemPrompt: "s", userPrompt: "u" }),
    ).rejects.toMatchObject({ status: 503 });

    // The old code burned a second key plus a backoff here for nothing.
    expect(mockInstances[0].models.generateContent).toHaveBeenCalledTimes(1);
    expect(mockInstances[1].models.generateContent).not.toHaveBeenCalled();
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

describe("LLMService model tiers", () => {
  it("sends fast tasks to the lightweight Gemini model", async () => {
    mockInstances[0].models.generateContent.mockResolvedValue({ text: "ok" });

    await module.llmService.generate({
      systemPrompt: "s",
      userPrompt: "u",
      task: "fast",
    });

    expect(
      mockInstances[0].models.generateContent.mock.calls[0][0].model,
    ).toBe("gemini-fast");
  });

  it("sends quality tasks to the full Gemini model", async () => {
    mockInstances[0].models.generateContent.mockResolvedValue({ text: "ok" });

    await module.llmService.generate({
      systemPrompt: "s",
      userPrompt: "u",
      task: "quality",
    });

    expect(
      mockInstances[0].models.generateContent.mock.calls[0][0].model,
    ).toBe("gemini-quality");
  });

  it("requests native JSON when asked", async () => {
    mockInstances[0].models.generateContent.mockResolvedValue({
      text: '{"intent":"GENERAL"}',
    });

    await module.llmService.generateJson({
      systemPrompt: "s",
      userPrompt: "u",
      task: "fast",
    });

    expect(
      mockInstances[0].models.generateContent.mock.calls[0][0].config
        .responseMimeType,
    ).toBe("application/json");
  });

  it("sends fast tasks to the lightweight Groq model", async () => {
    await reloadWithGroq("groq-one");

    const fetchMock = vi.fn().mockResolvedValue(groqJson("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await module.llmService.generate({
      systemPrompt: "s",
      userPrompt: "u",
      task: "fast",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("groq-fast");
  });
});

describe("LLMService provider order", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LLM_PROVIDER_ORDER;
  });

  it("tries Groq first when both providers are configured", async () => {
    await reloadWithGroq("groq-one");

    const fetchMock = vi.fn().mockResolvedValue(groqJson("groq answer"));
    vi.stubGlobal("fetch", fetchMock);

    const text = await module.llmService.generate({
      systemPrompt: "s",
      userPrompt: "u",
    });

    expect(text).toBe("groq answer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("api.groq.com");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer groq-one",
    );
    // Gemini must not be touched while Groq is healthy.
    expect(mockInstances[0].models.generateContent).not.toHaveBeenCalled();
  });

  it("honours an explicit gemini-first order", async () => {
    process.env.LLM_PROVIDER_ORDER = "gemini,groq";
    await reloadWithGroq("groq-one");

    mockInstances[0].models.generateContent.mockResolvedValue({
      text: "gemini answer",
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      module.llmService.generate({ systemPrompt: "s", userPrompt: "u" }),
    ).resolves.toBe("gemini answer");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to Gemini when Groq is out of quota", async () => {
    vi.useFakeTimers();

    try {
      await reloadWithGroq("groq-one");

      const fetchMock = vi.fn().mockResolvedValue(groqFailure(429));
      vi.stubGlobal("fetch", fetchMock);

      mockInstances[0].models.generateContent.mockResolvedValue({
        text: "gemini rescue",
      });

      const promise = module.llmService.generate({
        systemPrompt: "s",
        userPrompt: "u",
      });

      await vi.advanceTimersByTimeAsync(60_000);

      await expect(promise).resolves.toBe("gemini rescue");
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails over to Gemini immediately on a Groq 503 without rotating keys", async () => {
    await reloadWithGroq("groq-one,groq-two");

    const fetchMock = vi.fn().mockResolvedValue(groqFailure(503, "overloaded"));
    vi.stubGlobal("fetch", fetchMock);

    mockInstances[0].models.generateContent.mockResolvedValue({
      text: "gemini rescue",
    });

    await expect(
      module.llmService.generate({ systemPrompt: "s", userPrompt: "u" }),
    ).resolves.toBe("gemini rescue");

    // One Groq call, not one per key: capacity is not a key problem.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tries each Groq key once on 403 then fails over, without backoff", async () => {
    await reloadWithGroq("groq-one,groq-two");

    const fetchMock = vi
      .fn()
      .mockResolvedValue(groqFailure(403, "model not available"));
    vi.stubGlobal("fetch", fetchMock);

    mockInstances[0].models.generateContent.mockResolvedValue({
      text: "gemini rescue",
    });

    // Real timers: a 403 path that still slept would hang this test's budget.
    await expect(
      module.llmService.generate({ systemPrompt: "s", userPrompt: "u" }),
    ).resolves.toBe("gemini rescue");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer groq-two",
    );
  });

  it("surfaces the Groq error body so a 403 reason is visible", async () => {
    process.env.GEMINI_API_KEYS = "";
    process.env.GEMINI_API_KEY = "";
    await reloadWithGroq("groq-one");

    const fetchMock = vi
      .fn()
      .mockResolvedValue(groqFailure(403, "org_not_permitted"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      module.llmService.generate({ systemPrompt: "s", userPrompt: "u" }),
    ).rejects.toThrow(/org_not_permitted/);

    process.env.GEMINI_API_KEY = "key-one";
    process.env.GEMINI_API_KEYS = "key-one,key-two";
  });

  it("skips a provider that is already cooling down", async () => {
    await reloadWithGroq("groq-one");

    const fetchMock = vi.fn().mockResolvedValue(groqFailure(503));
    vi.stubGlobal("fetch", fetchMock);

    mockInstances[0].models.generateContent.mockResolvedValue({
      text: "gemini",
    });

    await module.llmService.generate({ systemPrompt: "s", userPrompt: "u" });
    await module.llmService.generate({ systemPrompt: "s", userPrompt: "u" });

    // The second request must not pay for Groq again while it is cooling.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockInstances[0].models.generateContent).toHaveBeenCalledTimes(2);
  });

  it("does not fall back when only one provider is configured", async () => {
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

describe("LLMService Gemini streaming", () => {
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

describe("LLMService Groq streaming", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams tokens from Groq's SSE frames", async () => {
    await reloadWithGroq("groq-one");

    const fetchMock = vi.fn().mockResolvedValue(
      groqStream(
        deltaFrame("Under "),
        deltaFrame("section 2(7)"),
        "data: [DONE]\n\n",
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const received: string[] = [];

    const text = await module.llmService.generate(
      { systemPrompt: "s", userPrompt: "u" },
      (token) => received.push(token),
    );

    expect(text).toBe("Under section 2(7)");
    expect(received).toEqual(["Under ", "section 2(7)"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
  });

  it("handles frames split across network chunks", async () => {
    await reloadWithGroq("groq-one");

    const frame = deltaFrame("split");
    const midpoint = Math.floor(frame.length / 2);

    const fetchMock = vi.fn().mockResolvedValue(
      groqStream(frame.slice(0, midpoint), frame.slice(midpoint)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const received: string[] = [];

    const text = await module.llmService.generate(
      { systemPrompt: "s", userPrompt: "u" },
      (token) => received.push(token),
    );

    expect(text).toBe("split");
    expect(received).toEqual(["split"]);
  });

  it("does not fail over to Gemini once Groq has emitted tokens", async () => {
    await reloadWithGroq("groq-one");

    const encoder = new TextEncoder();

    let call = 0;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            call++;

            if (call === 1) {
              return { done: false, value: encoder.encode(deltaFrame("half")) };
            }

            throw new Error("stream broke");
          },
          cancel: async () => {},
        }),
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    mockInstances[0].models.generateContentStream.mockResolvedValue(
      makeChunks("should-not-run"),
    );

    await expect(
      module.llmService.generate(
        { systemPrompt: "s", userPrompt: "u" },
        () => {},
      ),
    ).rejects.toThrow(/stream broke/);

    expect(
      mockInstances[0].models.generateContentStream,
    ).not.toHaveBeenCalled();
  });
});

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    expect(module.parseJsonResponse('{"intent":"CASE"}')).toEqual({
      intent: "CASE",
    });
  });

  it("strips markdown fences", () => {
    expect(
      module.parseJsonResponse('```json\n{"intent":"GENERAL"}\n```'),
    ).toEqual({ intent: "GENERAL" });
  });

  it("recovers JSON wrapped in prose", () => {
    expect(
      module.parseJsonResponse('Sure! {"intent":"DOCUMENT"} hope that helps'),
    ).toEqual({ intent: "DOCUMENT" });
  });

  it("throws when there is no JSON at all", () => {
    expect(() => module.parseJsonResponse("no json here")).toThrow();
  });
});
