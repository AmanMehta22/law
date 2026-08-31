#!/usr/bin/env node
/**
 * LLM key + model diagnostic.
 *
 *   cd backend
 *   node scripts/check-llm-keys.mjs
 *
 * Answers the question the server log cannot: is a 403/503 caused by a dead
 * key, a model your org is not entitled to, or an overloaded upstream pool?
 *
 * For every configured key it does two things per provider:
 *   1. lists the models that key can see
 *   2. makes the smallest possible real inference call against each model
 *      you have configured, because "visible in /models" and "callable by
 *      this org" are not the same thing
 *
 * Zero dependencies, and it never prints a key. Keys are shown as
 * "#1 ...abcd" so you can tell which one is broken without leaking it.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(HERE, "..", ".env");

/**
 * Minimal .env reader. dotenv would work too, but this script has to be
 * runnable even when node_modules is in a bad state - which is exactly the
 * situation where you most want to check your keys.
 */
function loadEnv(path) {
  const env = {};

  let raw;

  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(`Could not read ${path}. Run this from the backend folder.`);
    process.exit(1);
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");

    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Strip one matching pair of surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

const env = loadEnv(ENV_PATH);

function keys(...names) {
  const collected = [];

  for (const name of names) {
    for (const part of (env[name] ?? "").split(",")) {
      const key = part.trim();

      if (key && !collected.includes(key)) {
        collected.push(key);
      }
    }
  }

  return collected;
}

/** Never print a key. The tail is enough to identify which one it is. */
function label(index, key) {
  return `#${index + 1} ...${key.slice(-4)} (${key.length} chars)`;
}

const groqKeys = keys("GROQ_API_KEYS", "GROQ_API_KEY");
const geminiKeys = keys("GEMINI_API_KEYS", "GEMINI_API_KEY");

const groqModels = [
  env.GROQ_MODEL || "llama-3.3-70b-versatile",
  env.GROQ_FAST_MODEL || "llama-3.1-8b-instant",
];

const geminiModels = [
  env.GEMINI_MODEL || "gemini-flash-latest",
  env.GEMINI_FAST_MODEL || "gemini-flash-lite-latest",
];

const TIMEOUT_MS = 20_000;

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();

    return {
      status: response.status,
      ok: response.ok,
      body,
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      body: error?.name === "AbortError" ? "timed out" : String(error?.message ?? error),
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the useful sentence out of a provider error body. */
function reason(body) {
  try {
    const parsed = JSON.parse(body);
    const message =
      parsed?.error?.message ?? parsed?.message ?? parsed?.error?.status;

    if (message) {
      return String(message).slice(0, 200);
    }
  } catch {
    // Not JSON - fall through to the raw text.
  }

  return body.replace(/\s+/g, " ").trim().slice(0, 200) || "(empty body)";
}

/**
 * Interpretation is the whole point of this script - a bare status code is
 * what the server log already gave you.
 */
function verdict(status) {
  switch (status) {
    case 200:
      return "OK";
    case 401:
      return "KEY REJECTED - revoked, mistyped, or from a deleted project";
    case 403:
      return "FORBIDDEN - key is known but not allowed to use this model/org/region";
    case 404:
      return "NO SUCH MODEL - the name is wrong or retired on your account";
    case 429:
      return "RATE LIMITED / OUT OF QUOTA - key works, budget does not";
    case 500:
      return "UPSTREAM ERROR - on Gemini this is often quota in disguise";
    case 503:
      return "OVERLOADED - the shared model pool, not your key. Other keys will fail too";
    case 0:
      return "NO RESPONSE - network, proxy, or firewall";
    default:
      return "UNEXPECTED";
  }
}

function line(text = "") {
  console.log(text);
}

async function checkGroq() {
  line("=".repeat(72));
  line("GROQ");
  line("=".repeat(72));

  if (groqKeys.length === 0) {
    line("No GROQ_API_KEYS configured - skipping.");
    return;
  }

  line(`configured models: ${groqModels.join(", ")}`);
  line(`keys: ${groqKeys.length}`);
  line();

  for (const [index, key] of groqKeys.entries()) {
    line(`--- key ${label(index, key)}`);

    const list = await request("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });

    line(`  GET /models -> ${list.status} ${verdict(list.status)} (${list.ms}ms)`);

    if (list.ok) {
      let available = [];

      try {
        available = (JSON.parse(list.body).data ?? [])
          .map((model) => model.id)
          .sort();
      } catch {
        line("  (could not parse the model list)");
      }

      line(`  models visible to this key: ${available.length}`);

      for (const model of groqModels) {
        line(
          `    ${available.includes(model) ? "listed    " : "NOT LISTED"}  ${model}`,
        );
      }

      // Chat-capable models only, so the list stays useful.
      const chatModels = available.filter(
        (model) => !/whisper|tts|guard|prompt-guard/i.test(model),
      );

      if (chatModels.length > 0) {
        line(`  chat-capable options: ${chatModels.join(", ")}`);
      }
    } else {
      line(`  reason: ${reason(list.body)}`);
    }

    // A model can be listed and still refuse the call.
    for (const model of groqModels) {
      const call = await request(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
        },
      );

      line(
        `  POST ${model} -> ${call.status} ${verdict(call.status)} (${call.ms}ms)`,
      );

      if (!call.ok) {
        line(`    reason: ${reason(call.body)}`);
      }
    }

    line();
  }
}

async function checkGemini() {
  line("=".repeat(72));
  line("GEMINI");
  line("=".repeat(72));

  if (geminiKeys.length === 0) {
    line("No GEMINI_API_KEYS configured - skipping.");
    return;
  }

  line(`configured models: ${geminiModels.join(", ")}`);
  line(`keys: ${geminiKeys.length}`);
  line();

  for (const [index, key] of geminiKeys.entries()) {
    line(`--- key ${label(index, key)}`);

    const list = await request(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`,
    );

    line(`  GET /models -> ${list.status} ${verdict(list.status)} (${list.ms}ms)`);

    if (list.ok) {
      let available = [];

      try {
        available = (JSON.parse(list.body).models ?? [])
          .filter((model) =>
            (model.supportedGenerationMethods ?? []).includes("generateContent"),
          )
          .map((model) => String(model.name).replace(/^models\//, ""))
          .sort();
      } catch {
        line("  (could not parse the model list)");
      }

      line(`  generateContent models visible: ${available.length}`);

      for (const model of geminiModels) {
        // "-latest" aliases resolve server-side and often are not listed,
        // so a missing entry here is not proof of a problem - the POST is.
        line(
          `    ${available.includes(model) ? "listed    " : "not listed"}  ${model}`,
        );
      }

      const flash = available.filter((model) => model.includes("flash"));

      if (flash.length > 0) {
        line(`  flash-family options: ${flash.join(", ")}`);
      }
    } else {
      line(`  reason: ${reason(list.body)}`);
    }

    for (const model of geminiModels) {
      const call = await request(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
        },
      );

      line(
        `  POST ${model} -> ${call.status} ${verdict(call.status)} (${call.ms}ms)`,
      );

      if (!call.ok) {
        line(`    reason: ${reason(call.body)}`);
      }
    }

    line();
  }
}

line(`Reading ${ENV_PATH}`);
line("Keys are never printed - only the last 4 characters.");
line();

const order = (env.LLM_PROVIDER_ORDER || "groq,gemini")
  .split(",")
  .map((name) => name.trim().toLowerCase())
  .filter((name) => name === "groq" || name === "gemini");

line(`LLM_PROVIDER_ORDER = ${order.join(" -> ") || "(none valid)"}`);
line();

for (const provider of order.length > 0 ? order : ["groq", "gemini"]) {
  if (provider === "groq") {
    await checkGroq();
  } else {
    await checkGemini();
  }
}

line("=".repeat(72));
line("How to read this");
line("=".repeat(72));
line("Every POST returned 200        -> your config is fine; the log was a");
line("                                 transient upstream blip.");
line("403/404 on a model, all keys   -> the model name is the problem, not the");
line("                                 keys. Change GROQ_MODEL/GEMINI_MODEL in");
line("                                 .env to one of the listed options above.");
line("401/403 on one key only        -> remove that key from the list.");
line("429 everywhere                 -> quota. Failover cannot fix quota.");
line("503 on the first provider      -> capacity. The code now fails over");
line("                                 without burning your other keys.");
