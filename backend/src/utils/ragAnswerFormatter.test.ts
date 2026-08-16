import { describe, expect, it } from "vitest";
import { formatRagAnswerPrompt } from "./ragAnswerFormatter";
import { RagResult } from "../services/rag.service";

const result: RagResult = {
  content: "Legal content here",
  metadata: {
    title: "Refund",
    concept_type: "remedy",
    review_status: "reviewed",
  },
};

describe("formatRagAnswerPrompt", () => {
  it("builds all sections of the prompt", () => {
    const prompt = formatRagAnswerPrompt({
      conversation: "USER:\nhi",
      currentMessage: "who can file?",
      retrievedResults: [],
    });

    expect(prompt).toContain("CONVERSATION HISTORY");
    expect(prompt).toContain("CURRENT USER QUESTION");
    expect(prompt).toContain("RETRIEVED LEGAL CONTEXT");
    expect(prompt).toContain("No relevant legal material was retrieved.");
  });

  it("renders title, concept type and review status per source", () => {
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "q",
      retrievedResults: [result],
    });

    expect(prompt).toContain("[Source 1]");
    expect(prompt).toContain("Title: Refund");
    expect(prompt).toContain("Concept Type: remedy");
    expect(prompt).toContain("Review Status: reviewed");
    expect(prompt).toContain("Legal content here");
  });

  it("omits metadata attributes that are missing", () => {
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "q",
      retrievedResults: [{ content: "bare content", metadata: {} }],
    });

    expect(prompt).not.toContain("Title:");
    expect(prompt).not.toContain("Concept Type:");
    expect(prompt).not.toContain("Review Status:");
    expect(prompt).toContain("bare content");
  });

  it("parses derived_from into the source attributes", () => {
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "q",
      retrievedResults: [
        {
          content: "card content",
          metadata: {
            title: "Right to Refund",
            concept_type: "right",
            review_status: "reviewed",
            derived_from: "['CPA2019-CH1-S2-7', 'CPA2019-CH2-S38-1']",
          },
        },
      ],
    });

    expect(prompt).toContain(
      "Derived From: CPA2019-CH1-S2-7, CPA2019-CH2-S38-1",
    );
  });
});