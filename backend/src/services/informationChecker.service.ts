import { llmService } from "./llm.service";
import { INFORMATION_CHECKER_PROMPT } from "../prompts/informationChecker.prompt";
import { InformationCheckerResult } from "../types/informationChecker.types";

class InformationCheckerService {
  async check(
    conversation: string,
    requirements: string,
  ): Promise<InformationCheckerResult> {
    const prompt = `
Conversation

${conversation}

Requirements

${requirements}
`;

    return await llmService.generateJson<InformationCheckerResult>({
      systemPrompt: INFORMATION_CHECKER_PROMPT,
      userPrompt: prompt,
    });
  }
}

export const informationCheckerService = new InformationCheckerService();
