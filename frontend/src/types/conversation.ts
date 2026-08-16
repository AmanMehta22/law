import { V2KnowledgeCard, ReviewStatus } from './knowledgeCard';

export type AnswerFormat = 'text' | 'checklist' | 'document_draft' | 'quick_reply';

export interface IntakeContext {
  issue_type?: string;
  amount_band?: string;
  state?: string;
}

export interface DocumentDraft {
  id: string;
  title: string;
  type: 'notice' | 'complaint' | 'checklist';
  target_authority: string;
  body: string;
  created_at: string;
}

export interface Message {
  message_id: string;
  conversation_id: string;
  created_at: string;
  sender: 'user' | 'bot';
  answer_text: string;
  answer_format: AnswerFormat;
  checklist_ref?: V2KnowledgeCard | null;
  document_draft?: DocumentDraft | null;
  cards_used: V2KnowledgeCard[];
  overall_confidence: number;
  overall_review_status: ReviewStatus;
  disclaimer: string;
  suggested_follow_ups: string[];
  context?: IntakeContext;
  quick_replies?: string[];
  is_low_confidence?: boolean;
  is_out_of_scope?: boolean;
}

export interface Conversation {
  conversation_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
}

export interface ApiError {
  error: string;
  message: string;
  suggested_domain?: string;
  retry_after_seconds?: number;
}
