import { conversationService } from "./conversation.service";
import { messageService } from "./message.service";
import { titleService } from "./title.service";
import { ragAnswerService } from "./ragAnswer.service";
import { DOCUMENT_ANSWER_PROMPT } from "../prompts/documentAnswer.prompt";
import { logger } from "../logger";

class DocumentWorkflowService {
  async handle(userId: string, conversationId: string | null, message: string) {
    const timer = logger.startTimer();

    logger.info("Starting Document Workflow");

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

    // 3. Retrieve legal context and generate a grounded document draft
    const result = await ragAnswerService.retrieveAndAnswer({
      conversationId: conversation.id,
      currentMessage: message,
      systemPrompt: DOCUMENT_ANSWER_PROMPT,
      retrievalQuery: message,
    });

    timer.done("Document Workflow completed");

    return result;
  }
}

export const documentWorkflowService = new DocumentWorkflowService();