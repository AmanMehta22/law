import { describe, expect, it } from "vitest";
import { classifyIntentByHeuristic } from "./intentFallback";
import { Intent } from "../types/intent.types";

/**
 * These cases are lifted from INTENT_ROUTER_PROMPT so the fallback agrees
 * with the model on the examples the prompt itself teaches.
 */
describe("classifyIntentByHeuristic", () => {
  const general = [
    "Who can file a consumer complaint?",
    "How do I file a complaint?",
    "What is the limitation period?",
    "Explain Consumer Protection Act 2019.",
    "What are my consumer rights?",
  ];

  const cases = [
    "I bought a laptop that stopped working.",
    "Amazon delivered a damaged phone.",
    "My insurance company rejected my claim.",
    "The seller refuses to replace the product.",
    "I bought a product that is defective or damaged",
  ];

  const documents = [
    "Draft a legal notice.",
    "Write a consumer complaint.",
    "Generate a complaint letter.",
  ];

  it.each(general)("routes %j to GENERAL", (message) => {
    expect(classifyIntentByHeuristic(message).intent).toBe(Intent.GENERAL);
  });

  it.each(cases)("routes %j to CASE", (message) => {
    expect(classifyIntentByHeuristic(message).intent).toBe(Intent.CASE);
  });

  it.each(documents)("routes %j to DOCUMENT", (message) => {
    expect(classifyIntentByHeuristic(message).intent).toBe(Intent.DOCUMENT);
  });

  it("treats an eligibility question inside a personal story as GENERAL", () => {
    const message =
      "I received a laptop as a gift from my father and it is defective. Am I considered a consumer under the Act?";

    expect(classifyIntentByHeuristic(message).intent).toBe(Intent.GENERAL);
  });

  it("treats a procedure question about drafting as GENERAL, not DOCUMENT", () => {
    expect(
      classifyIntentByHeuristic("How do I write a legal notice?").intent,
    ).toBe(Intent.GENERAL);
  });

  it("treats a polite drafting request as DOCUMENT", () => {
    expect(
      classifyIntentByHeuristic("Can you draft a legal notice for me?").intent,
    ).toBe(Intent.DOCUMENT);
  });

  // Regression: "damag" was previously wrapped in a trailing \b, so it could
  // never match "damaged" and this routed to GENERAL.
  it("matches inflected dispute words like 'damaged' and 'rejected'", () => {
    expect(
      classifyIntentByHeuristic("Amazon delivered a damaged phone.").intent,
    ).toBe(Intent.CASE);

    expect(
      classifyIntentByHeuristic("My insurance company rejected my claim.")
        .intent,
    ).toBe(Intent.CASE);
  });

  // Regression: verb-initial questions match no opener keyword, so their
  // dispute nouns used to drag them into CASE.
  it("treats a verb-initial question as GENERAL", () => {
    expect(
      classifyIntentByHeuristic("Is a seller liable for a damaged product?")
        .intent,
    ).toBe(Intent.GENERAL);

    expect(
      classifyIntentByHeuristic("Does the Act cover online purchases?").intent,
    ).toBe(Intent.GENERAL);
  });

  it("defaults to GENERAL and flags low confidence when nothing matches", () => {
    const result = classifyIntentByHeuristic("hello there");

    expect(result.intent).toBe(Intent.GENERAL);
    expect(result.confident).toBe(false);
  });
});
