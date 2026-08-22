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
    expect(prompt).toContain(
      "Citation: Section 2(7) of the Consumer Protection Act, 2019; Section 38(1) of the Consumer Protection Act, 2019",
    );
  });

  it("renders section-only citations without a subsection", () => {
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "q",
      retrievedResults: [
        {
          content: "card content",
          metadata: {
            derived_from: "['CPA2019-CH2-S7']",
          },
        },
      ],
    });

    expect(prompt).toContain("Citation: Section 7 of the Consumer Protection Act, 2019");
    expect(prompt).not.toContain("Section 7(7)");
  });
});

/**
 * These lock in the fix for the defect that made the bot quote editorial card
 * wording to users as though it were the Act: the verbatim statute was never sent to
 * the model at all, and each card was rendered under a heading built from its own
 * citation, so the card body read as the text of that section.
 *
 * They depend on the real dataset at
 * `legal-dataset/acts/consumer-protection-act-2019/final/`, resolved by walking up
 * from the backend directory. If that ever moves, these fail loudly — which is the
 * intent. Silent loss of statutory grounding is the failure mode worth catching.
 */
describe("formatRagAnswerPrompt — statutory grounding", () => {
  const definitionCard: RagResult = {
    content: "A defect is a fault or shortcoming in quality.",
    metadata: {
      title: "Defect",
      concept_type: "definition",
      review_status: "reviewed",
      derived_from: "['CPA2019-CH1-S2-10']",
    },
  };

  it("sends the verbatim words of the Act, not just the card summary", () => {
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "what is a defect?",
      retrievedResults: [definitionCard],
    });

    expect(prompt).toContain("PART A — STATUTE (VERBATIM, AUTHORITATIVE)");
    expect(prompt).toContain("[A1] Section 2(10) of the Consumer Protection Act, 2019");

    // The actual enacted wording, which no card contains.
    expect(prompt).toContain("any fault, imperfection or shortcoming in the quality");
  });

  it("never uses a citation as a card heading", () => {
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "q",
      retrievedResults: [definitionCard],
    });

    // The regression being guarded: a line that is *only* a citation followed by a
    // colon reads as "here is the text of that section", and the card body then gets
    // quoted as statutory language.
    expect(prompt).not.toMatch(
      /^Section 2\(10\) of the Consumer Protection Act, 2019:$/m,
    );
    expect(prompt).toContain("[Source 1]");
    expect(prompt).toContain("PART B — INTERPRETIVE MATERIAL");
  });

  it("lists the clause markers inside a provision so the answer can cite one", () => {
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "what rights do I have?",
      retrievedResults: [
        {
          content: "Consumers have six rights.",
          metadata: {
            title: "Consumer rights",
            concept_type: "right",
            derived_from: "['CPA2019-CH1-S2-9']",
          },
        },
      ],
    });

    // s.2(9) has no clause-level nodes in the corpus — (i) to (vi) all live inside
    // the one provision — so naming the markers is what makes 2(9)(v) citable.
    expect(prompt).toContain("Clauses inside this provision:");
    expect(prompt).toContain("(v)");
  });

  it("grounds a card that only reaches the statute through another card", () => {
    // All 621 example cards are like this: `derived_from` names a concept, not a
    // statute node. Before one-hop resolution they arrived with no statutory text
    // and no citation, which is why their illustrative wording got quoted as law.
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "q",
      retrievedResults: [
        {
          content: "Scenario: a phone overheats. Outcome: this is a defect.",
          metadata: {
            title: "Overheating phone",
            concept_type: "example",
            review_status: "draft",
            derived_from: "['definition.defect']",
          },
        },
      ],
    });

    expect(prompt).toContain("Citation: Section 2(10) of the Consumer Protection Act, 2019");
    expect(prompt).toContain("Statutory Text: see [A1] above");
    expect(prompt).toContain("any fault, imperfection or shortcoming in the quality");
  });

  it("puts a retrieved v1 statute chunk in PART A, not among the cards", () => {
    // The retriever's dense search is filtered to `source: "v2"`, but its
    // section-lift path returns v1 chunks when the query names a section. Rendering
    // one under "NOT THE WORDS OF THE ACT" would mislabel real law as commentary.
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "what does section 2(10) say?",
      retrievedResults: [
        {
          content: "Section 2(10) of the Consumer Protection Act, 2019: ...",
          metadata: {
            source: "v1",
            v1_id: "CPA2019-CH1-S2-10",
            section_number: "2",
            subsection_number: "(10)",
            official_text: "\"defect\" means any fault ...",
          },
        },
      ],
    });

    expect(prompt).toContain("PART A — STATUTE (VERBATIM, AUTHORITATIVE)");
    expect(prompt).toContain("[A1] Section 2(10) of the Consumer Protection Act, 2019");
    expect(prompt).not.toContain("PART B");
    expect(prompt).not.toContain("[Source 1]");
    expect(prompt).not.toContain("No relevant legal material was retrieved.");
  });

  it("orders provisions as they appear in the Act, not by retrieval rank", () => {
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "q",
      retrievedResults: [
        { content: "later", metadata: { derived_from: "['CPA2019-CH1-S2-10']" } },
        { content: "earlier", metadata: { derived_from: "['CPA2019-CH1-S2-9']" } },
      ],
    });

    expect(prompt).toContain("[A1] Section 2(9) of the Consumer Protection Act, 2019");
    expect(prompt).toContain("[A2] Section 2(10) of the Consumer Protection Act, 2019");
  });

  it("still says nothing was found when nothing was retrieved", () => {
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "q",
      retrievedResults: [],
    });

    expect(prompt).toContain("No relevant legal material was retrieved.");
    expect(prompt).not.toContain("PART A");
  });

  it("falls back to parsing an id whose chapter segment is wrong", () => {
    // The corpus has CPA2019-CH4-S38-1; a card carrying CH2 should still be citable
    // rather than silently losing its citation.
    const prompt = formatRagAnswerPrompt({
      conversation: "c",
      currentMessage: "q",
      retrievedResults: [
        { content: "c", metadata: { derived_from: "['CPA2019-CH2-S38-1']" } },
      ],
    });

    expect(prompt).toContain(
      "Citation: Section 38(1) of the Consumer Protection Act, 2019",
    );
  });
});