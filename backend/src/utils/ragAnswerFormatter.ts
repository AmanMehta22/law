import { RagResult } from "../services/rag.service";
import {
  buildCitation,
  extractClauseMarkers,
  getStatuteNode,
  getStatuteNodes,
  resolveStatuteNode,
  StatuteNode,
} from "./statuteIndex";

interface RagAnswerContext {
  conversation: string;
  currentMessage: string;
  retrievedResults: RagResult[];
}

/**
 * How many provisions a single card may contribute to PART A.
 *
 * Measured over the corpus: a card resolves to 1.67 provisions on average, but the
 * tail is severe — one card names 65 provisions (35,320 characters). Those are
 * index-like cards, not cards genuinely grounded in 65 places, and letting one
 * through would bury the provision that actually answers the question.
 */
const PROVISIONS_PER_CARD = Number(
  process.env.STATUTE_PROVISIONS_PER_CARD ?? 4,
);

/**
 * Character ceiling for PART A. A median top-5 context needs ~2,400 characters, so
 * this leaves generous headroom while capping the worst realistic case, which would
 * otherwise reach ~48,000 characters (~12,000 tokens) of statute alone.
 *
 * Provisions are dropped whole, never truncated: cutting a provision mid-sentence
 * risks removing the operative words — a proviso, an exception, a deadline — and an
 * answer built on half a provision is worse than one that admits the omission.
 *
 * Sized together with ANSWER_PROMPT_CHAR_BUDGET so statute + cards + question
 * stay inside free-tier request limits (Groq on-demand rejects >8,000 TPM).
 */
const PART_A_CHAR_BUDGET = Number(process.env.STATUTE_CHAR_BUDGET ?? 5_000);

/**
 * Ceiling on the whole retrieved context block (PART A + PART B combined).
 * Free-tier providers enforce a per-minute token budget shared by every
 * request in the pipeline (~8,000 TPM on Groq), and a long question plus a
 * fully-expanded top-5 retrieval once produced an ~11,500-token request.
 *
 * Cards are dropped whole, lowest-ranked first; provisions inside PART A are
 * already dropped whole by PART_A_CHAR_BUDGET.
 */
const RETRIEVED_CHAR_BUDGET = Number(
  process.env.RETRIEVED_CHAR_BUDGET ?? 6_500,
);

/**
 * Ceiling on the current question rendered into the prompt. Genuine user
 * messages past this length are almost always repetition of the same facts,
 * and each duplicate sentence spends shared free-tier tokens.
 */
const CURRENT_MESSAGE_CHAR_CAP = Number(
  process.env.CURRENT_MESSAGE_CHAR_CAP ?? 3_000,
);

/**
 * Hard ceiling for the whole assembled user prompt. Free-tier providers cap
 * request size (Groq's on-demand tier rejects anything over 8,000 tokens per
 * minute with HTTP 413, and a long user question duplicated across history
 * and the current-question block once produced an ~8,900-token prompt).
 *
 * ~20,000 characters measured ~6,200 real tokens on this corpus's mix of
 * statute text and conversational English (~3.2 characters per token, much
 * denser than the 4:1 rule of thumb), leaving headroom for the system
 * prompt and the generated answer inside an 8,000-token window.
 *
 * The budget is spent on what the answer depends on: retrieved legal
 * material always survives; conversation history is trimmed from the oldest
 * end first.
 */
const ANSWER_PROMPT_CHAR_BUDGET = Number(
  process.env.ANSWER_PROMPT_CHAR_BUDGET ?? 20_000,
);

/**
 * Build the user prompt for an answer turn.
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * This function used to render each knowledge card under a heading built from the
 * card's computed citation:
 *
 *     Section 2(22) of the Consumer Protection Act, 2019:
 *     <interpretive card content>
 *
 * That reads, to a language model, as "here is the text of section 2(22)". The card
 * content is not the text of section 2(22) — it is an editorial summary, and in some
 * cards the body is an example or a non-example. The verbatim `official_text` from
 * the dataset was never sent at all, so the model had no way to quote real law and
 * routinely presented card wording as statutory wording.
 *
 * The context is now split into two clearly labelled parts: PART A is the verbatim
 * statute expanded from each card's `derived_from` ids, PART B is the interpretive
 * cards. Cards are headed `[Source N]` — never a citation — and point at the Part A
 * provisions they were derived from.
 *
 * Fails soft: if the statute dataset is unavailable, PART A is omitted and the
 * answer degrades to interpretive material only rather than erroring.
 */
export function formatRagAnswerPrompt({
  conversation,
  currentMessage,
  retrievedResults,
}: RagAnswerContext): string {
  // A retrieved result is either a verbatim statute chunk (`source: "v1"`, carrying
  // `official_text`) or a knowledge card. They must not be rendered the same way:
  // one is the law, the other is commentary about it.
  const statuteResults = retrievedResults.filter(isStatuteChunk);
  const cardResults = retrievedResults.filter(
    (result) => !isStatuteChunk(result),
  );

  // Resolve each card's statutory grounding once. Per-card rather than in bulk,
  // because a card whose `derived_from` names another card only reaches the statute
  // through that card — the resolution is not a plain lookup, so the card needs to
  // know which provisions it ended up pointing at.
  const cards = cardResults.map((result) => {
    const derivedFrom = parseListMetadata(result.metadata.derived_from);

    return {
      result,
      derivedFrom,
      statute: getStatuteNodes(derivedFrom),
    };
  });

  // Union the provisions, then order them as they appear in the Act. Labels are
  // assigned after sorting so [A1], [A2], ... read in statutory order rather than in
  // whatever order the retriever happened to rank the cards.
  const statuteNodes: StatuteNode[] = [];
  const seen = new Set<string>();
  let budget = PART_A_CHAR_BUDGET;

  const collect = (node: StatuteNode | undefined): boolean => {
    if (!node) {
      return false;
    }

    if (seen.has(node.id)) {
      return true;
    }

    // The first provision goes in regardless of length. An answer with no law at
    // all is worse than an over-long one.
    if (statuteNodes.length > 0 && node.text.length > budget) {
      return false;
    }

    seen.add(node.id);
    statuteNodes.push(node);
    budget -= node.text.length;

    return true;
  };

  // Directly retrieved statute first — the retriever surfaced it deliberately, in
  // response to a query that named a section.
  for (const result of statuteResults) {
    collect(statuteChunkNode(result));
  }

  // Then breadth before depth: give every card its primary provision before giving
  // any card a second one, so a single broadly-grounded card cannot consume the
  // budget and leave the other cards with no statutory text.
  for (const card of cards) {
    collect(card.statute[0]);
  }

  for (const card of cards) {
    for (const node of card.statute.slice(1, PROVISIONS_PER_CARD)) {
      collect(node);
    }
  }

  statuteNodes.sort((a, b) => {
    const section = Number(a.section) - Number(b.section);

    if (section !== 0) {
      return section;
    }

    return Number(a.subsection ?? 0) - Number(b.subsection ?? 0);
  });

  const labels = new Map<string, string>();

  statuteNodes.forEach((node, index) => {
    labels.set(node.id, `A${index + 1}`);
  });

  const statuteBlock =
    statuteNodes.length > 0
      ? [
          "PART A — STATUTE (VERBATIM, AUTHORITATIVE)",
          "",
          "The exact enacted words of the Consumer Protection Act, 2019. Quote and",
          "cite from here when stating what the law provides.",
          "",
          statuteNodes.map(renderStatuteNode(labels)).join("\n\n"),
        ].join("\n")
      : "";

  const statuteLength = statuteBlock.length;

  // Render cards in retrieval rank order and stop when the retrieved context
  // as a whole exceeds its budget. Cards are dropped whole — a truncated
  // summary invites the model to treat half a card as the whole of it.
  const renderedCards: string[] = [];
  let usedChars = statuteLength;

  for (let index = 0; index < cards.length; index++) {
    const rendered = renderCard(
      cards[index].result,
      index,
      cards[index].derivedFrom,
      cards[index].statute,
      labels,
    );

    if (
      usedChars + rendered.length > RETRIEVED_CHAR_BUDGET &&
      renderedCards.length > 0
    ) {
      break;
    }

    renderedCards.push(rendered);
    usedChars += rendered.length + 2;
  }

  const cardBlock =
    renderedCards.length > 0
      ? [
          "PART B — INTERPRETIVE MATERIAL (NOT THE WORDS OF THE ACT)",
          "",
          "Editorial summaries, plain-language restatements and examples written to",
          "explain the Act. Use them for understanding and for simple wording. Do not",
          "quote them as statutory language.",
          "",
          renderedCards.join("\n\n"),
        ].join("\n")
      : "";

  const parts = [statuteBlock, cardBlock].filter((part) => part.length > 0);

  // Only claim nothing was found when nothing was. A section-specific question can
  // retrieve statute with no accompanying cards; that is a good answer context, not
  // an empty one.
  const retrievedContext =
    parts.length > 0
      ? parts.join("\n\n\n")
      : "No relevant legal material was retrieved.";

  const currentMessageForPrompt =
    currentMessage.length > CURRENT_MESSAGE_CHAR_CAP
      ? `${currentMessage.slice(0, CURRENT_MESSAGE_CHAR_CAP)}\n[rest of the question repeats the same details]`
      : currentMessage;

  const currentMessageBlock = `
CURRENT USER QUESTION

${currentMessageForPrompt}
`;

  const retrievedBlock = `
RETRIEVED LEGAL CONTEXT

${retrievedContext}
`;

  const fixedOverhead = currentMessageBlock.length + retrievedBlock.length;

  // Trim the history, oldest text first, until the whole prompt fits the
  // budget. Retrieved material is never touched: an answer built on trimmed
  // law is wrong in a way trimming chatter never is.
  let conversationForPrompt = conversation;

  if (fixedOverhead + conversationForPrompt.length > ANSWER_PROMPT_CHAR_BUDGET) {
    const available = Math.max(
      ANSWER_PROMPT_CHAR_BUDGET - fixedOverhead - 40,
      0,
    );

    const cutFrom = Math.max(0, conversationForPrompt.length - available);

    const kept = conversationForPrompt.slice(cutFrom);

    conversationForPrompt =
      cutFrom > 0 ? `[earlier history trimmed]\n\n${kept}` : kept;
  }

  return `
CONVERSATION HISTORY

${conversationForPrompt}
${currentMessageBlock}${retrievedBlock}`.trim();
}

function isStatuteChunk(result: RagResult): boolean {
  return (
    result.metadata.source === "v1" ||
    Boolean(result.metadata.v1_id) ||
    Boolean(result.metadata.official_text)
  );
}

/**
 * Turn a retrieved v1 chunk into a statute node.
 *
 * Prefer the indexed node from the dataset, because a chunk may be one slice of a
 * long provision (the index holds 476 chunks for 276 nodes) and the answer is better
 * served by the whole provision than by a fragment of it. Fall back to building a
 * node from the chunk's own metadata when the dataset file is unavailable.
 */
function statuteChunkNode(result: RagResult): StatuteNode | undefined {
  const id = result.metadata.v1_id?.trim();

  if (id) {
    const indexed = getStatuteNode(id);

    if (indexed) {
      return indexed;
    }
  }

  const text = result.metadata.official_text?.trim();
  const section = result.metadata.section_number?.trim();

  if (!text || !section) {
    return undefined;
  }

  const subsection =
    result.metadata.subsection_number?.trim().replace(/^\(|\)$/g, "") ||
    undefined;

  return {
    id: id || `v1:${section}${subsection ? `-${subsection}` : ""}`,
    section,
    subsection,
    text,
    citation: buildCitation(section, subsection),
    clauses: extractClauseMarkers(text),
  };
}

function renderStatuteNode(labels: Map<string, string>) {
  return (node: StatuteNode): string => {
    const lines = [`[${labels.get(node.id)}] ${node.citation}`];

    // Clause markers are surfaced because the corpus has no clause-level nodes:
    // 2(9)(i)-(vi) all sit inside one provision. Naming the markers is what lets an
    // answer cite 2(9)(iii) precisely, without splitting the statute (splitting
    // would invalidate the official_text checksums and dataset gate G2).
    if (node.clauses.length > 1) {
      lines.push(
        `Clauses inside this provision: ${node.clauses
          .map((clause) => `(${clause})`)
          .join(", ")} — cite the specific clause you rely on.`,
      );
    }

    lines.push('"""', node.text, '"""');

    return lines.join("\n");
  };
}

function renderCard(
  result: RagResult,
  index: number,
  derivedFrom: string[],
  statute: StatuteNode[],
  labels: Map<string, string>,
): string {
  const attributes: string[] = [];

  if (result.metadata.title) {
    attributes.push(`Title: ${result.metadata.title}`);
  }

  if (result.metadata.concept_type) {
    attributes.push(`Concept Type: ${result.metadata.concept_type}`);
  }

  if (result.metadata.review_status) {
    attributes.push(`Review Status: ${result.metadata.review_status}`);
  }

  if (derivedFrom.length > 0) {
    attributes.push(`Derived From: ${derivedFrom.join(", ")}`);
  }

  // Build the citation from the provision each reference actually resolves to,
  // falling back to parsing the id itself when it resolves to nothing. The fallback
  // is load-bearing: some cards carry ids whose chapter segment is wrong (the corpus
  // has `CPA2019-CH4-S38-1`, not `CPA2019-CH2-S38-1`), and a card with a slightly
  // malformed id should still be citable. Resolved statute nodes are appended so
  // cards grounded indirectly through another card get a citation at all — their own
  // `derived_from` holds concept ids and yields nothing on its own.
  const citation = dedupe([
    ...derivedFrom.flatMap((ref) => {
      const node = resolveStatuteNode(ref);

      return node ? [node.citation] : statuteCitations([ref]);
    }),
    ...statute.map((node) => node.citation),
  ]);

  if (citation.length > 0) {
    attributes.push(`Citation: ${citation.join("; ")}`);
  }

  const anchors = statute
    .map((node) => labels.get(node.id))
    .filter((label): label is string => Boolean(label))
    .map((label) => `[${label}]`);

  if (anchors.length > 0) {
    // Be explicit when provisions were left out, so the model treats this card as
    // partially evidenced rather than assuming PART A is exhaustive for it.
    const omitted = statute.length - anchors.length;
    const note =
      omitted > 0
        ? ` (${omitted} further provision${omitted === 1 ? "" : "s"} it ` +
          `references ${omitted === 1 ? "was" : "were"} omitted for length)`
        : "";

    attributes.push(
      `Statutory Text: see ${anchors.join(", ")} above for the enacted wording${note}`,
    );
  }

  const nature = contentNature(result.metadata.concept_type);

  if (nature) {
    attributes.push(`Content Nature: ${nature}`);
  }

  const attributeBlock =
    attributes.length > 0 ? `${attributes.join("\n")}\n` : "";

  // The heading is deliberately a neutral label, never the citation. A citation
  // heading made the card body read as the text of that section.
  return `[Source ${index + 1}]
${attributeBlock}${result.content}`;
}

function contentNature(conceptType: string | undefined): string {
  switch (conceptType) {
    case "definition":
      return "knowledge card summarising a statutory definition (interpretive)";
    case "example":
      return "illustrative example card (interpretive, not statutory wording)";
    case "right":
      return "explanatory card for a statutory right (interpretive)";
    case "obligation":
      return "obligation card (interpretive)";
    case "procedure":
      return "procedure card (interpretive)";
    case "remedy":
      return "remedy card (interpretive)";
    case "exception":
      return "exception card (interpretive)";
    case "evidence":
      return "evidence card (interpretive)";
    case "authority":
      return "authority card (interpretive)";
    case "penalty":
      return "penalty card (interpretive)";
    default:
      return "interpretive knowledge card";
  }
}

function dedupe(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function parseListMetadata(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  const trimmed = raw.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const inner = trimmed.startsWith("[") ? trimmed.slice(1, -1) : trimmed;

  return inner
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

// The optional third group is a clause segment (`...-S2-9-3` for 2(9)(iii)). It is
// matched so the card still gets a citation, but deliberately not rendered: the Act
// numbers clauses as roman numerals in some sections and letters in others, so
// turning "3" into "(iii)" would be a guess. The clause markers the model should
// cite are listed verbatim beside the provision text in PART A.
const STATUTE_ID_PATTERN = /^CPA2019-CH\d+-S(\d+)(?:-(\d+))?(?:-[0-9a-z]+)?$/i;

export function statuteCitations(derivedFrom: string[]): string[] {
  const citations: string[] = [];

  for (const item of derivedFrom) {
    const match = STATUTE_ID_PATTERN.exec(item.trim());

    if (!match) {
      continue;
    }

    const section = match[1];
    const subsection = match[2];

    const ref = subsection
      ? `Section ${section}(${subsection})`
      : `Section ${section}`;

    citations.push(`${ref} of the Consumer Protection Act, 2019`);
  }

  return citations;
}
