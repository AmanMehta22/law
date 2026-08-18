import { conversationService } from "./conversation.service";
import { messageService } from "./message.service";
import { titleService } from "./title.service";
import { ragAnswerService } from "./ragAnswer.service";
import { GENERAL_ANSWER_PROMPT } from "../prompts/generalAnswer.prompt";
import { StreamHandlers } from "../types/stream.types";
import { logger } from "../logger";

class GeneralWorkflowService {
  async handle(
    userId: string,
    conversationId: string | null,
    message: string,
    handlers?: StreamHandlers,
  ) {
    const timer = logger.startTimer();

    logger.info("Starting General Workflow");

    // 1. Create conversation if needed
    let conversation;

    if (!conversationId) {
      conversation = await conversationService.createConversation(
        userId,
        titleService.generate(message),
      );
    } else {
      conversation = {
        id: conversationId,
      };
    }

    // 2. Save user message
    await messageService.createUserMessage(conversation.id, message);

    // 3. Retrieve legal context and generate a grounded answer
    const result = await ragAnswerService.retrieveAndAnswer({
      conversationId: conversation.id,
      currentMessage: message,
      systemPrompt: GENERAL_ANSWER_PROMPT,
      retrievalQuery: message,
      onStatus: handlers?.onStatus,
      onToken: handlers?.onToken,
    });

    timer.done("General Workflow completed");

    return result;
  }
}

export const generalWorkflowService = new GeneralWorkflowService();