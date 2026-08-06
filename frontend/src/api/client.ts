import axios from 'axios';
import { getSessionId } from '../utils/sessionId';
import { Conversation, ConversationDetail, Message } from '../types/conversation';

export class LegalBotApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, data: any) {
    super(data.message || 'API Request Failed');
    this.status = status;
    this.data = data;
    this.name = 'LegalBotApiError';
  }
}

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  config.headers['X-Session-Id'] = getSessionId();
  const token = localStorage.getItem('legalbot_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('legalbot_token');
      localStorage.removeItem('legalbot_authenticated');
      localStorage.removeItem('legalbot_user');
      localStorage.removeItem('legalbot_active_conversation');
      if (window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(error);
  },
);

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface BackendConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt:string;
}
interface BackendMessage{
  id:string;
  role:'USER'|'ASSISTANT'|'SYSTEM';
  content:string;
  createdAt:string;
  conversationId:string;
}

interface BackendConversationWithMessages{
  id:string;
  title:string;
  userId:string;
  createdAt:string;
  updatedAt:string;
  messages:BackendMessage[];
}

interface BackendMessageResult {
  conversationId: string;
  readyForRag: boolean;
  reply: string;
}

export const api = {
  async startConversation(): Promise<Conversation> {
    const response = await apiClient.post<ApiEnvelope<BackendConversation>>('/conversations');
    const conv = response.data.data;
    return {
      conversation_id: conv.id,
      title: conv.title,
      created_at: conv.createdAt,
      updated_at: conv.updatedAt,
    };
  },

  async sendMessage(
    conversationId: string,
    messageText: string
  ): Promise<Message> {
    const response = await apiClient.post<ApiEnvelope<BackendMessageResult>>(
      '/messages',
      { conversationId, message: messageText }
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
  },

  async getConversations(): Promise<Conversation[]> {
    const response = await apiClient.get<ApiEnvelope<BackendConversation[]>>(
      '/conversations',
    );
    return response.data.data.map((conv) => ({
      conversation_id: conv.id,
      title: conv.title,
      created_at: conv.createdAt,
      updated_at: conv.updatedAt,
    }));
  },

  async getConversation(conversationId: string): Promise<ConversationDetail> {
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
  },
};

