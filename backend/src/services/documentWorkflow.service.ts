import { conversationService } from "./conversation.service";
import { messageService } from "./message.service";
import { titleService } from "./title.service";
import { ragAnswerService } from "./ragAnswer.service";
import { documentTemplateService } from "./documentTemplate.service";
import { DOCUMENT_ANSWER_PROMPT } from "../prompts/documentAnswer.prompt";
import { DocumentTemplate } from "../templates/documentTemplates";
import { StreamHandlers } from "../types/stream.types";
import { logger } from "../logger";

function buildTemplateContext(template: DocumentTemplate): string {
  return `DOCUMENT TEMPLATE

You must follow this fixed template exactly, section by section, filling
the placeholders (e.g. [Your Name], [Date], [Amount]) with the user's
stated facts or clearly marked placeholders when a fact is missing:

${template.structure}

Use only the sections present in this template. Do not add, remove, or
reorder sections.`;
}

class DocumentWorkflowService {
  async handle(
    userId: string,
    conversationId: string | null,
    message: string,
    handlers?: StreamHandlers,
  ) {
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

    // 3. Select the document template for this request
    const template = documentTemplateService.selectTemplate(message);

    logger.info("Document template selected", {
      template: template.id,
    });

    // 4. Retrieve legal context and generate a grounded document draft
    handlers?.onStatus?.("Preparing your document\u2026");

    const result = await ragAnswerService.retrieveAndAnswer({
      conversationId: conversation.id,
      currentMessage: message,
      systemPrompt: DOCUMENT_ANSWER_PROMPT,
      retrievalQuery: message,
      additionalContext: buildTemplateContext(template),
      onStatus: handlers?.onStatus,
      onToken: handlers?.onToken,
    });

    timer.done("Document Workflow completed");

    return result;
  }
}

export const documentWorkflowService = new DocumentWorkflowService();