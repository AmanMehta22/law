import { apiClient, ApiEnvelope } from './client';
import { Message } from '../types/conversation';

interface BackendMessageResult {
  conversationId: string;
  readyForRag: boolean;
  reply: string;
}

export async function sendMessage(
  conversationId: string | null,
  messageText: string,
): Promise<Message> {
  const response = await apiClient.post<ApiEnvelope<BackendMessageResult>>(
    '/messages',
    { conversationId, message: messageText },
  );
  const result = response.data.data;
  return {
    message_id: 'msg_b_' + Math.random().toString(36).substring(2, 9),
    conversation_id: result.conversationId,
    created_at: new Date().toISOString(),
    sender: 'bot',
    answer_text: result.reply,
    answer_format: 'text',
    cards_used: [],
    v1_nodes_used: [],
    overall_confidence: 1.0,
    overall_review_status: 'reviewed',
    disclaimer: '',
    suggested_follow_ups: [],
  };
}