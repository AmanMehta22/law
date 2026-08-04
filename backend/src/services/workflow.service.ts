import { conversationService } from "./conversation.service";
import { conversationRepository } from "../repositories/conversation.repository";
import { messageService } from "./message.service";
import { informationCheckerService } from "./informationChecker.service";

import { formatConversation } from "../utils/conversationFormatter";
import { formatRequirements } from "../utils/requirementFormatter";
import { CONSUMER_INFORMATION_REQUIREMENTS } from "../knowledge/consumer/consumer.fields";
import { knowledgeService } from "./knowledge.service";

class WorkflowService {
  async processMessage(
    userId: string,
    conversationId: string | null,
    message: string,
  ) {
    // 1. Create conversation if needed
    let conversation;

    if (!conversationId) {
      conversation = await conversationService.createConversation(userId);
    } else {
      conversation = { id: conversationId };
    }

    // 2. Save user message
    await messageService.createUserMessage(conversation.id, message);

    // 3. Load complete conversation
    const conversationWithMessages =
      await conversationRepository.findByIdWithMessages(conversation.id);

    if (!conversationWithMessages) {
      throw new Error("Conversation not found.");
    }

    // 4. Format conversation for the LLM
    const formattedConversation = formatConversation(
      conversationWithMessages.messages,
    );

    // 5. Run Information Checker
    const check = await informationCheckerService.check(
      formattedConversation,
      formatRequirements(CONSUMER_INFORMATION_REQUIREMENTS),
    );

    // 6. Not enough information -> ask next question
    if (!check.readyForRag) {
      const nextRequirement = knowledgeService.getNextRequirement(
        check.missingFields,
      );
      const assistantMessage = await messageService.createAssistantMessage(
        conversation.id,
        nextRequirement.question,
      );

      return {
        conversationId: conversation.id,
        readyForRag: false,
        reply: assistantMessage.content,
      };
    }

    // 7. Ready for RAG
    // TODO: Replace this with the real RAG service

    const assistantMessage = await messageService.createAssistantMessage(
      conversation.id,
      "✅ Enough information has been collected. RAG will be called next.",
    );

    return {
      conversationId: conversation.id,
      readyForRag: true,
      reply: assistantMessage.content,
    };
  }
}

export const workflowService = new WorkflowService();
