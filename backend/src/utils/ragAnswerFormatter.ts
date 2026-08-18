import { RagResult } from "../services/rag.service";

interface RagAnswerContext {
  conversation: string;
  currentMessage: string;
  retrievedResults: RagResult[];
}

export function formatRagAnswerPrompt({
  conversation,
  currentMessage,
  retrievedResults,
}: RagAnswerContext): string {
  const retrievedContext =
    retrievedResults.length > 0
      ? retrievedResults
          .map((result, index) => {
            const attributes: string[] = [];

            if (result.metadata.title) {
              attributes.push(`Title: ${result.metadata.title}`);
            }

            if (result.metadata.concept_type) {
              attributes.push(
                `Concept Type: ${result.metadata.concept_type}`,
              );
            }

            if (result.metadata.review_status) {
              attributes.push(
                `Review Status: ${result.metadata.review_status}`,
              );
            }

            const derivedFrom = parseListMetadata(
              result.metadata.derived_from,
            );

            if (derivedFrom.length > 0) {
              attributes.push(
                `Derived From: ${derivedFrom.join(", ")}`,
              );
            }

            const citation = statuteCitations(derivedFrom);

            if (citation.length > 0) {
              attributes.push(`Citation: ${citation.join("; ")}`);
            }

            const attributeBlock =
              attributes.length > 0 ? `${attributes.join("\n")}\n` : "";

            return `[Source ${index + 1}]
${attributeBlock}${result.content}`;
          })
          .join("\n\n")
      : "No relevant legal material was retrieved.";

  return `
CONVERSATION HISTORY

${conversation}


CURRENT USER QUESTION

${currentMessage}


RETRIEVED LEGAL CONTEXT

${retrievedContext}
`.trim();
}

function parseListMetadata(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  const trimmed = raw.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const inner = trimmed.startsWith("[")
    ? trimmed.slice(1, -1)
    : trimmed;

  return inner
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

const STATUTE_ID_PATTERN = /^CPA2019-CH\d+-S(\d+)(?:-(\d+))?$/;

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