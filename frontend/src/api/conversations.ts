import { apiClient, ApiEnvelope } from './client';
import {
  Conversation,
  ConversationDetail,
  Message,
  AnswerFormat,
} from '../types/conversation';
import { V2KnowledgeCard, ReviewStatus } from '../types/knowledgeCard';

interface BackendConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface BackendMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: string;
  conversationId: string;
  answer_format?: AnswerFormat;
  cards_used?: V2KnowledgeCard[];
  suggested_follow_ups?: string[];
  overall_confidence?: number;
  overall_review_status?: ReviewStatus;
  disclaimer?: string;
  quick_replies?: string[];
  is_low_confidence?: boolean;
  is_out_of_scope?: boolean;
}

interface BackendConversationWithMessages {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  messages: BackendMessage[];
}

// TODO: no limit/pagination today — fetch the full history in one call.
// Revisit once a user can accumulate hundreds of conversations.
export async function getConversations(): Promise<Conversation[]> {
  const response = await apiClient.get<ApiEnvelope<BackendConversation[]>>(
    '/conversations',
  );
  return response.data.data.map((conv) => ({
    conversation_id: conv.id,
    title: conv.title,
    created_at: conv.createdAt,
    updated_at: conv.updatedAt,
  }));
}

export async function getConversation(
  conversationId: string,
): Promise<ConversationDetail> {
  const response = await apiClient.get<ApiEnvelope<BackendConversationWithMessages>>(
    `/conversations/${conversationId}`,
  );
  const conv = response.data.data;
  return {
    conversation: {
      conversation_id: conv.id,
      title: conv.title,
      created_at: conv.createdAt,
      updated_at: conv.updatedAt,
    },
    messages: conv.messages
      .filter((m) => m.role !== 'SYSTEM')
      .map((m) => ({
        message_id: m.id,
        conversation_id: m.conversationId,
        created_at: m.createdAt,
        sender: m.role === 'USER' ? 'user' : 'bot',
        answer_text: m.content,
        answer_format: m.answer_format ?? 'text',
        cards_used: m.cards_used ?? [],
        overall_confidence: m.overall_confidence ?? 1.0,
        overall_review_status: m.overall_review_status ?? 'reviewed',
        disclaimer: m.disclaimer ?? '',
        suggested_follow_ups: m.suggested_follow_ups ?? [],
        ...(m.is_low_confidence !== undefined
          ? { is_low_confidence: m.is_low_confidence }
          : {}),
        ...(m.is_out_of_scope !== undefined
          ? { is_out_of_scope: m.is_out_of_scope }
          : {}),
        ...(m.quick_replies ? { quick_replies: m.quick_replies } : {}),
      })),
  };
}