import axios from 'axios';
import { getSessionId } from '../utils/sessionId';
import { processUserQuery, mockStatuteNodes, mockKnowledgeCards } from '../data';
import { Conversation, Message, IntakeContext } from '../types/conversation';
import { V1StatuteNode } from '../types/statute';
import { V2KnowledgeCard } from '../types/knowledgeCard';

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
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  config.headers['X-Session-Id'] = getSessionId();
  return config;
});

export const mockApi = {
  async startConversation(): Promise<Conversation> {
    try {
      const response = await apiClient.post<Conversation>('/conversations');
      return response.data;
    } catch {
      // Fallback if server endpoint is offline
      return {
        conversation_id: 'conv_' + Math.random().toString(36).substring(2, 10),
        created_at: new Date().toISOString(),
      };
    }
  },

  async sendMessage(
    conversationId: string,
    messageText: string,
    context?: IntakeContext
  ): Promise<Message> {
    try {
      const response = await apiClient.post<Message>(
        '/messages',
        { conversationId, message: messageText, context }
      );
      return response.data;
    } catch (err: any) {
      if (err.response) {
        throw new LegalBotApiError(err.response.status, err.response.data || {});
      }
      // Client-side execution fallback
      await new Promise((r) => setTimeout(r, 600)); // Simulating smooth network latency
      return processUserQuery(conversationId, messageText, context);
    }
  },

  async getCitation(v1NodeId: string): Promise<V1StatuteNode | null> {
    try {
      const response = await apiClient.get<V1StatuteNode>(`/citations/${v1NodeId}`);
      return response.data;
    } catch {
      return mockStatuteNodes.find((n) => n.id === v1NodeId) || null;
    }
  },

  async searchKnowledgeCards(query: string): Promise<V2KnowledgeCard[]> {
    try {
      const response = await apiClient.get<{ items: V2KnowledgeCard[] }>(
        `/knowledge-cards?search=${encodeURIComponent(query)}`
      );
      return response.data.items || [];
    } catch {
      const lq = query.toLowerCase();
      return mockKnowledgeCards.filter(
        (c) =>
          c.title.toLowerCase().includes(lq) ||
          c.description.toLowerCase().includes(lq) ||
          c.search.keywords.some((k) => k.toLowerCase().includes(lq))
      );
    }
  },
};
