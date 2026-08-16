import { conversationService } from "./conversation.service";
import { conversationRepository } from "../repositories/conversation.repository";
import { messageService } from "./message.service";
import { informationCheckerService } from "./informationChecker.service";
import { knowledgeService } from "./knowledge.service";
import { titleService } from "./title.service";
import { formatConversation } from "../utils/conversationFormatter";
import { formatRequirements } from "../utils/requirementFormatter";
import { CONSUMER_INFORMATION_REQUIREMENTS } from "../knowledge/consumer/consumer.fields";
import { ragAnswerService } from "./ragAnswer.service";
import { CASE_ANSWER_PROMPT } from "../prompts/caseAnswer.prompt";

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
    await messageService.createUserMessage(conversation.id, message);

    // 3. Load conversation with messages
    const conversationWithMessages =
      await conversationRepository.findByIdWithMessages(conversation.id);

    if (!conversationWithMessages) {
      logger.error("Conversation not found", {
        conversationId: conversation.id,
      });

      throw new Error("Conversation not found.");
    }

    // 4. Format conversation
    const formattedConversation = formatConversation(
      conversationWithMessages.messages,
    );

    // 5. Information Checker
    const check = await informationCheckerService.check(
      formattedConversation,
      formatRequirements(CONSUMER_INFORMATION_REQUIREMENTS),
    );

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

    // 7. Ready for RAG: retrieve legal context and generate grounded answer
    logger.info("Information complete");
    logger.info("Ready for RAG");

    const result = await ragAnswerService.retrieveAndAnswer({
      conversationId: conversation.id,
      currentMessage: message,
      systemPrompt: CASE_ANSWER_PROMPT,
      formattedConversation,
    });

    workflowTimer.done("Case Workflow completed");

    return result;
  }
}

export const caseWorkflowService = new CaseWorkflowService();