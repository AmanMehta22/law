import { llmService } from "./llm.service";
import { RETRIEVAL_QUERY_PROMPT } from "../prompts/retrievalQuery.prompt";

class RetrievalQueryService {
  async generate(conversation: string): Promise<string> {
    const response = await llmService.generate({
      systemPrompt: RETRIEVAL_QUERY_PROMPT,
      userPrompt: conversation,
      temperature: 0,
    });

    return response.trim();
  }
}

export const retrievalQueryService = new RetrievalQueryService();
