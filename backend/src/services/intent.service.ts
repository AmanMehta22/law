import { llmService } from "./llm.service";
import { INTENT_ROUTER_PROMPT } from "../prompts/intentRouter.prompt";
import { IntentResult } from "../types/intent.types";

class IntentService {
  async classify(message: string): Promise<IntentResult> {
    const response = await llmService.generate({
      systemPrompt: INTENT_ROUTER_PROMPT,
      userPrompt: message,
    });

    const cleaned = response
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned) as IntentResult;
  }
}

export const intentService = new IntentService();
