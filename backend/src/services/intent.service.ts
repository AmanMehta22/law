import { llmService, parseJsonResponse } from "./llm.service";
import { INTENT_ROUTER_PROMPT } from "../prompts/intentRouter.prompt";
import { Intent, IntentResult } from "../types/intent.types";
import { classifyIntentByHeuristic } from "./intentFallback";
import { logger } from "../logger";
import { pushService } from "../utils/requestContext";

const intentLogger = logger.child("INTENT");

const VALID_INTENTS = new Set<string>([
  Intent.GENERAL,
  Intent.CASE,
  Intent.DOCUMENT,
]);

class IntentService {
  async classify(message: string): Promise<IntentResult> {
    pushService("IntentService");
    const timer = intentLogger.startTimer();

    intentLogger.debug("Classifying user query", {
      messagePreview: message.slice(0, 120),
    });

    try {
      // A three-way label from a short message: the fast tier is the right
      // size for this, and it keeps the big model's quota for real answers.
      const response = await llmService.generate({
        systemPrompt: INTENT_ROUTER_PROMPT,
        userPrompt: message,
        task: "fast",
        json: true,
      });

      const result = parseJsonResponse<IntentResult>(response);

      if (!VALID_INTENTS.has(result?.intent)) {
        throw new Error(`Model returned an unknown intent: ${result?.intent}`);
      }

      timer.done("Query classified", {
        intent: result.intent,
      });

      return result;
    } catch (error) {
      // Classification gates the entire request. Rather than fail the
      // message outright when every provider is down or the JSON is
      // unusable, fall back to deterministic rules.
      const fallback = classifyIntentByHeuristic(message);

      intentLogger.warn("Intent classification fell back to heuristics", {
        intent: fallback.intent,
        confident: fallback.confident,
        error: error instanceof Error ? error.message : String(error),
      });

      timer.done("Query classified by heuristic", {
        intent: fallback.intent,
      });

      return { intent: fallback.intent };
    }
  }
}

export const intentService = new IntentService();
