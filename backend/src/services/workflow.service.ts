import { Intent } from "../types/intent.types";
import { StreamHandlers } from "../types/stream.types";

import { intentService } from "./intent.service";
import { caseWorkflowService } from "./caseWorkflow.service";
import { generalWorkflowService } from "./generalWorkflow.service";
import { documentWorkflowService } from "./documentWorkflow.service";

import { logger } from "../logger";

class WorkflowService {
  async processMessage(
    userId: string,
    conversationId: string | null,
    message: string,
    handlers?: StreamHandlers,
  ) {
    const workflowTimer = logger.startTimer();

    logger.info("Processing new message", {
      userId,
      conversationId,
      messagePreview: message.slice(0, 120),
    });

    // Step 1: Determine the user's intent
    const intentTimer = logger.startTimer();

    handlers?.onStatus?.("Understanding your question\u2026");

    const { intent } = await intentService.classify(message);

    intentTimer.done("Intent classified", {
      intent,
    });

    // Step 2: Route to the appropriate workflow
    switch (intent) {
      case Intent.GENERAL:
        logger.info("Routing to General Workflow");

        return generalWorkflowService.handle(
          userId,
          conversationId,
          message,
          handlers,
        );

      case Intent.CASE:
        logger.info("Routing to Case Workflow");

        return caseWorkflowService.handle(
          userId,
          conversationId,
          message,
          handlers,
        );

      case Intent.DOCUMENT:
        logger.info("Routing to Document Workflow");

        return documentWorkflowService.handle(
          userId,
          conversationId,
          message,
          handlers,
        );

      default:
        logger.error("Unknown intent received", {
          intent,
        });

        throw new Error("Unsupported intent.");
    }
  }
}

export const workflowService = new WorkflowService();