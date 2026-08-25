import { llmService } from "./llm.service";
import { RETRIEVAL_QUERY_PROMPT } from "../prompts/retrievalQuery.prompt";
import { logger } from "../logger";

const retrievalLogger = logger.child("RETRIEVAL-QUERY");

class RetrievalQueryService {
  async generate(conversation: string): Promise<string> {
    const timer = retrievalLogger.startTimer();

    const response = await llmService.generate({
      systemPrompt: RETRIEVAL_QUERY_PROMPT,
      userPrompt: conversation,
      temperature: 0,
      // Rewriting a conversation into a search query is a short mechanical
      // transformation, not legal reasoning.
      task: "fast",
    });

    const query = response.trim();

    timer.done("Retrieval query generated", {
      queryPreview: query.slice(0, 120),
    });

    return query;
  }
}

export const retrievalQueryService = new RetrievalQueryService();
