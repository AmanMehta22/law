import { conversationService } from "./conversation.service";
import { conversationRepository } from "../repositories/conversation.repository";
import { messageService } from "./message.service";
import { informationCheckerService } from "./informationChecker.service";
import { knowledgeService } from "./knowledge.service";
import { titleService } from "./title.service";
import { formatConversation } from "../utils/conversationFormatter";
import { formatRequirements } from "../utils/requirementFormatter";
import { CONSUMER_INFORMATION_REQUIREMENTS } from "../knowledge/consumer/consumer.fields";

import { logger } from "../logger";
class CaseWorkflowService {
  async handle(userId: string, conversationId: string | null, message: string) {
    const workflowTimer = logger.startTimer();

    logger.info("Starting Case Workflow", {
      userId,
      conversationId,
    });

    // 1. Create conversation if needed
    let conversation;

    if (!conversationId) {
      logger.info("Creating new conversation");

      conversation = await conversationService.createConversation(
        userId,
        titleService.generate(message),
      );

      logger.info("Conversation created", {
        conversationId: conversation.id,
      });
    } else {
      logger.info("Using existing conversation", {
        conversationId,
      });

      conversation = {
        id: conversationId,
      };
    }

    // 2. Save user message
    const saveMessageTimer = logger.startTimer();

    await messageService.createUserMessage(conversation.id, message);

    saveMessageTimer.done("User message saved");

    // 3. Load conversation with messages
    const loadConversationTimer = logger.startTimer();

    const conversationWithMessages =
      await conversationRepository.findByIdWithMessages(conversation.id);

    if (!conversationWithMessages) {
      logger.error("Conversation not found", {
        conversationId: conversation.id,
      });

      throw new Error("Conversation not found.");
    }

    loadConversationTimer.done("Conversation loaded", {
      messageCount: conversationWithMessages.messages.length,
    });

    // 4. Format conversation
    const formattedConversation = formatConversation(
      conversationWithMessages.messages,
    );

    // 5. Information Checker
    const checkerTimer = logger.startTimer();

    const check = await informationCheckerService.check(
      formattedConversation,
      formatRequirements(CONSUMER_INFORMATION_REQUIREMENTS),
    );

    checkerTimer.done("Information Checker completed", check);

    // 6. Ask follow-up question
    if (!check.readyForRag) {
      logger.info("Information incomplete");

      const nextRequirement = knowledgeService.getNextRequirement(
        check.missingFields,
      );

      logger.info("Next question selected", {
        field: nextRequirement.id,
      });

      const assistantMessage = await messageService.createAssistantMessage(
        conversation.id,
        nextRequirement.question,
      );

      logger.info("Follow-up question stored");

      workflowTimer.done("Case Workflow completed");

      return {
        conversationId: conversation.id,
        readyForRag: false,
        reply: assistantMessage.content,
      };
    }

    // 7. Ready for RAG
    logger.info("Information complete");
    logger.info("Ready for RAG");

    // TODO: Replace this with ragService.answer()

    const assistantMessage = await messageService.createAssistantMessage(
      conversation.id,
      "✅ Enough information has been collected. RAG will be called next.",
    );

    workflowTimer.done("Workflow completed");

    return {
      conversationId: conversation.id,
      readyForRag: true,
      reply: assistantMessage.content,
    };
  }
}

export const caseWorkflowService = new CaseWorkflowService();
