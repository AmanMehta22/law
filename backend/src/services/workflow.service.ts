import { conversationService } from "./conversation.service";
import { messageService } from "./message.service";

class WorkflowService {
  async processMessage(
    userId: string,
    conversationId: string | null,
    message: string,
  ) {
    let conversation;

    if (!conversationId) {
      conversation = await conversationService.createConversation(userId);
    } else {
      conversation = {
        id: conversationId,
      };
    }

    const userMessage = await messageService.createUserMessage(
      conversation.id,
      message,
    );

    return {
      conversation,
      userMessage,
    };
  }
}

export const workflowService = new WorkflowService();
