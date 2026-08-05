import { conversationService } from "./conversation.service";
import { messageService } from "./message.service";
import { titleService } from "./title.service";
import { logger } from "../logger";

class GeneralWorkflowService {
  async handle(userId: string, conversationId: string | null, message: string) {
    const timer = logger.startTimer();

    logger.info("Starting General Workflow");

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

    await messageService.createUserMessage(conversation.id, message);

    // TODO
    // Call RAG directly.

    const assistantMessage = await messageService.createAssistantMessage(
      conversation.id,
      "General workflow not implemented yet.",
    );

    timer.done("General Workflow completed");

    return {
      conversationId: conversation.id,
      readyForRag: true,
      reply: assistantMessage.content,
    };
  }
}

export const generalWorkflowService = new GeneralWorkflowService();
