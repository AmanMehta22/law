import { Prisma } from "@prisma/client";
import { conversationRepository } from "../repositories/conversation.repository";
import {
  dropCurrentMessageFromHistory,
  formatConversation,
} from "../utils/conversationFormatter";
import { formatRagAnswerPrompt } from "../utils/ragAnswerFormatter";
import { AppError } from "../errors/AppError";
import { NotFoundError } from "../errors/NotFoundError";
import { logger } from "../logger";

import { llmService } from "./llm.service";
import { messageService } from "./message.service";
import { ragService, RagResult } from "./rag.service";
import { retrievalQueryService } from "./retrievalQuery.service";

interface RetrieveAndAnswerParams {
  userId: string;
  conversationId: string;
  currentMessage: string;
  systemPrompt: string;
  retrievalQuery?: string;
  formattedConversation?: string;
  additionalContext?: string;
  onStatus?: (status: string) => void;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

const SEARCH_ONLY_CONCEPT_TYPES = new Set(["alias", "intent", "relationship"]);

const DISCLAIMER =
  "I am an AI legal information assistant, not a lawyer. This information is provided for educational purposes based on available legal materials and does not constitute formal legal advice.";

class RagAnswerService {
  async retrieveAndAnswer({
    userId,
    conversationId,
    currentMessage,
    systemPrompt,
    retrievalQuery: queryOverride,
    formattedConversation: formattedConversationOverride,
    additionalContext,
    onStatus,
    onToken,
    signal,
  }: RetrieveAndAnswerParams) {
    // 1. Load and format conversation (skipped when the caller already has it)
    let formattedConversation = formattedConversationOverride;

    if (!formattedConversation) {
      const loadConversationTimer = logger.startTimer();

      const conversationWithMessages =
        await conversationRepository.findByIdWithMessages(
          conversationId,
          userId,
        );

      if (!conversationWithMessages) {
        logger.error("Conversation not found", {
          conversationId,
        });

        throw new NotFoundError("Conversation not found.");
      }

      loadConversationTimer.done("Conversation loaded", {
        messageCount: conversationWithMessages.messages.length,
      });

      formattedConversation = formatConversation(
        dropCurrentMessageFromHistory(
          conversationWithMessages.messages,
          currentMessage,
        ),
      );
    }

    // 2. Determine retrieval query (override skips a Gemini call)
    let retrievalQuery = queryOverride;

    if (!retrievalQuery) {
      const retrievalQueryTimer = logger.startTimer();

      retrievalQuery = await retrievalQueryService.generate(
        formattedConversation,
      );

      retrievalQueryTimer.done("Retrieval query generated", {
        retrievalQuery,
      });
    }

    // 3. Retrieve relevant legal context
    const ragTimer = logger.startTimer();

    onStatus?.("Searching the Consumer Protection Act\u2026");

    let ragResponse;

    try {
      ragResponse = await ragService.query(retrievalQuery);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown RAG service error";

      logger.error("RAG retrieval failed", {
        message,
      });

      throw new AppError(message, 503);
    }

    ragTimer.done("RAG retrieval completed", {
      resultCount: ragResponse.results.length,
    });

    // 4. Keep only answer-capable material for the LLM context:
    //    exclude search-only concept types (alias/intent/relationship)
    const answerableResults = ragResponse.results.filter(
      (result) =>
        !SEARCH_ONLY_CONCEPT_TYPES.has(result.metadata.concept_type ?? ""),
    );

    // 5. Build final answer prompt
    const answerPrompt = formatRagAnswerPrompt({
      conversation: formattedConversation,
      currentMessage,
      retrievedResults: answerableResults,
    });

    const userPrompt = additionalContext
      ? `${answerPrompt}\n\n${additionalContext}`
      : answerPrompt;

    // 6. Generate final answer (streamed token by token)
    const llmTimer = logger.startTimer();

    onStatus?.("Writing your answer\u2026");

    let provider: "gemini" | "groq" | undefined;

    const answer = await llmService.generate(
      {
        systemPrompt,
        userPrompt,
        // The one call that earns the big model: it writes the cited legal
        // answer the user actually reads.
        task: "quality",
        onProvider: (chosen) => {
          provider = chosen;
        },
        // Stop generating when the SSE client disconnects mid-answer.
        signal,
      },
      onToken,
    );

    llmTimer.done("Answer generated", { provider });

    // 7. Save assistant response
    const cardsUsed = answerableResults.map((result) => ({
      concept_id: result.metadata.concept_id,
      concept_type: result.metadata.concept_type,
      title: result.metadata.title,
      review_status: result.metadata.review_status,
    }));

    const quickReplies = buildQuickReplies(answerableResults);

    const isLowConfidence = cardsUsed.length === 0;

    const isOutOfScope = ragResponse.results.length === 0;

    const hasDraftCard = cardsUsed.some(
      (card) => card.review_status !== "reviewed",
    );

    const overallReviewStatus =
      cardsUsed.length === 0
        ? "reviewed"
        : hasDraftCard
          ? "draft"
          : "reviewed";

    const overallConfidence =
      cardsUsed.length === 0
        ? 0.2
        : cardsUsed.reduce(
            (sum, card) =>
              sum + (card.review_status === "reviewed" ? 0.9 : 0.5),
            0,
          ) / cardsUsed.length;

    const assistantMessage = await messageService.createAssistantMessage(
      conversationId,
      answer,
      {
        answerFormat: "text",
        cardsUsed: cardsUsed as Prisma.InputJsonValue,
        overallConfidence: Math.round(overallConfidence * 100) / 100,
        overallReviewStatus,
        disclaimer: DISCLAIMER,
        suggestedFollowUps: quickReplies,
        quickReplies,
        isLowConfidence,
        isOutOfScope,
      },
    );

    logger.info("Assistant response stored");

    // 8. Build the RAG-aware response envelope
    return {
      conversationId,
      readyForRag: true,
      reply: assistantMessage.content,
      answer_format: "text",
      cards_used: cardsUsed,
      overall_confidence: Math.round(overallConfidence * 100) / 100,
      overall_review_status: overallReviewStatus,
      disclaimer: DISCLAIMER,
      suggested_follow_ups: quickReplies,
      quick_replies: quickReplies,
      is_low_confidence: isLowConfidence,
      is_out_of_scope: isOutOfScope,
      provider,
    };
  }
}

function buildQuickReplies(cards: RagResult[]): string[] {
  const replies: string[] = [];

  for (const card of cards) {
    const title = card.metadata.title;

    if (title && !replies.includes(`Tell me more about ${title}`)) {
      replies.push(`Tell me more about ${title}`);
    }

    if (replies.length >= 3) {
      break;
    }
  }

  return replies;
}

export const ragAnswerService = new RagAnswerService();