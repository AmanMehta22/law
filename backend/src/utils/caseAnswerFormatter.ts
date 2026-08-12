import { RagResult } from "../services/rag.service";

interface CaseAnswerContext {
  conversation: string;
  currentMessage: string;
  retrievedResults: RagResult[];
}

export function formatCaseAnswerPrompt({
  conversation,
  currentMessage,
  retrievedResults,
}: CaseAnswerContext): string {
  const retrievedContext =
    retrievedResults.length > 0
      ? retrievedResults
          .map((result, index) => {
            const title = result.metadata.title
              ? `Title: ${result.metadata.title}\n`
              : "";

            return `[Source ${index + 1}]
${title}${result.content}`;
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
