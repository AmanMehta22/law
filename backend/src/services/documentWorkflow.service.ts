import { conversationService } from "./conversation.service";
import { messageService } from "./message.service";

import { logger } from "../logger";

class DocumentWorkflowService {
  async handle(userId: string, conversationId: string | null, message: string) {
    const timer = logger.startTimer();

    logger.info("Starting Document Workflow");

    let conversation;

    if (!conversationId) {
      conversation = await conversationService.createConversation(userId);
    } else {
      conversation = {
        id: conversationId,
      };
    }

    await messageService.createUserMessage(conversation.id, message);

    // TODO
    // Collect document-specific information.

    const assistantMessage = await messageService.createAssistantMessage(
      conversation.id,
      "Document workflow not implemented yet.",
    );

    timer.done("Document Workflow completed");

    return {
      conversationId: conversation.id,
      readyForRag: false,
      reply: assistantMessage.content,
    };
  }
}

export const documentWorkflowService = new DocumentWorkflowService();
