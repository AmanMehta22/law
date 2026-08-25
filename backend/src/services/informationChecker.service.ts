import { llmService } from "./llm.service";
import { INFORMATION_CHECKER_PROMPT } from "../prompts/informationChecker.prompt";
import { InformationCheckerResult } from "../types/informationChecker.types";
import { logger } from "../logger";

const infoLogger = logger.child("INFO-CHECK");

class InformationCheckerService {
  async check(
    conversation: string,
    requirements: string,
  ): Promise<InformationCheckerResult> {
    const timer = infoLogger.startTimer();

    const prompt = `
Conversation

${conversation}

Requirements

${requirements}
`;

    const result = await llmService.generateJson<InformationCheckerResult>({
      systemPrompt: INFORMATION_CHECKER_PROMPT,
      userPrompt: prompt,
      // A structured slot check: small output, needs to be quick because it
      // runs on every turn of the case-intake loop.
      task: "fast",
    });

    timer.done("Information check completed", {
      readyForRag: result.readyForRag,
      missingFields: result.missingFields,
    });

    return result;
  }
}

export const informationCheckerService = new InformationCheckerService();
