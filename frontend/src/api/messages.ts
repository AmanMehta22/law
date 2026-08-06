import { apiClient, ApiEnvelope } from './client';
import { Message, IntakeContext } from '../types/conversation';
import { V2KnowledgeCard, ReviewStatus } from '../types/knowledgeCard';
import { V1StatuteNode } from '../types/statute';

export interface BackendMessageResult {
  conversationId: string;
  readyForRag: boolean;
  reply: string;
  cards_used?: V2KnowledgeCard[];
  v1_nodes_used?: V1StatuteNode[];
  suggested_follow_ups?: string[];
  overall_confidence?: number;
  overall_review_status?: ReviewStatus;
  disclaimer?: string;
  quick_replies?: string[];
}

export async function sendMessage(
  conversationId: string | null,
  messageText: string,
  context?: IntakeContext,
): Promise<Message> {
  const response = await apiClient.post<ApiEnvelope<BackendMessageResult>>(
    '/messages',
    {
      conversationId,
      message: messageText,
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    },
  );
  const result = response.data.data;
  return {
    message_id: 'msg_b_' + Math.random().toString(36).substring(2, 9),
    conversation_id: result.conversationId,
    created_at: new Date().toISOString(),
    sender: 'bot',
    answer_text: result.reply,
    answer_format: 'text',
    cards_used: result.cards_used ?? [],
    v1_nodes_used: result.v1_nodes_used ?? [],
    overall_confidence: result.overall_confidence ?? 1.0,
    overall_review_status: result.overall_review_status ?? 'reviewed',
    disclaimer: result.disclaimer ?? '',
    suggested_follow_ups: result.suggested_follow_ups ?? [],
    ...(result.quick_replies ? { quick_replies: result.quick_replies } : {}),
  };
}