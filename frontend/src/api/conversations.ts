import { apiClient, ApiEnvelope } from './client';
import { Conversation, ConversationDetail, Message } from '../types/conversation';

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
        answer_format: 'text',
        cards_used: [],
        v1_nodes_used: [],
        overall_confidence: 1.0,
        overall_review_status: 'reviewed',
        disclaimer: '',
        suggested_follow_ups: [],
      })),
  };
}