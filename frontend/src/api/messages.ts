import { API_BASE_URL, clearAuthAndReload } from './client';
import { Message, IntakeContext, AnswerFormat } from '../types/conversation';
import { V2KnowledgeCard, ReviewStatus } from '../types/knowledgeCard';
import { getSessionId } from '../utils/sessionId';
import { STORAGE_KEYS } from '../constants/storageKeys';

export interface BackendMessageResult {
  conversationId: string;
  readyForRag: boolean;
  reply: string;
  answer_format?: AnswerFormat;
  cards_used?: V2KnowledgeCard[];
  suggested_follow_ups?: string[];
  overall_confidence?: number;
  overall_review_status?: ReviewStatus;
  disclaimer?: string;
  quick_replies?: string[];
  is_low_confidence?: boolean;
  is_out_of_scope?: boolean;
  provider?: 'gemini' | 'groq';
}

export interface MessageStreamHandlers {
  onStatus?: (status: string) => void;
  onToken?: (token: string) => void;
  onDone: (result: BackendMessageResult) => void;
}

export function toMessage(result: BackendMessageResult): Message {
  return {
    message_id: 'msg_b_' + Math.random().toString(36).substring(2, 9),
    conversation_id: result.conversationId,
    created_at: new Date().toISOString(),
    sender: 'bot',
    answer_text: result.reply,
    answer_format: result.answer_format ?? 'text',
    cards_used: result.cards_used ?? [],
    overall_confidence: result.overall_confidence ?? 1.0,
    overall_review_status: result.overall_review_status ?? 'reviewed',
    disclaimer: result.disclaimer ?? '',
    suggested_follow_ups: result.suggested_follow_ups ?? [],
    ...(result.is_low_confidence !== undefined
      ? { is_low_confidence: result.is_low_confidence }
      : {}),
    ...(result.is_out_of_scope !== undefined
      ? { is_out_of_scope: result.is_out_of_scope }
      : {}),
    ...(result.quick_replies ? { quick_replies: result.quick_replies } : {}),
    ...(result.provider ? { provider: result.provider } : {}),
  };
}

function dispatchEvent(
  eventName: string | null,
  data: string,
  handlers: MessageStreamHandlers,
): void {
  switch (eventName) {
    case 'status': {
      const { status } = JSON.parse(data) as { status: string };
      handlers.onStatus?.(status);
      break;
    }
    case 'delta': {
      const { text } = JSON.parse(data) as { text: string };
      handlers.onToken?.(text);
      break;
    }
    case 'done': {
      const { data: result } = JSON.parse(data) as {
        data: BackendMessageResult;
      };
      handlers.onDone(result);
      break;
    }
    case 'error': {
      const { error } = JSON.parse(data) as { error: string };
      throw new Error(error);
    }
    default:
      break;
  }
}

export async function streamMessage(
  conversationId: string | null,
  messageText: string,
  context: IntakeContext | undefined,
  handlers: MessageStreamHandlers,
): Promise<void> {
  const token = localStorage.getItem(STORAGE_KEYS.token);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Session-Id': getSessionId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        conversationId,
        message: messageText,
        ...(context && Object.keys(context).length > 0 ? { context } : {}),
      }),
    });
  } catch {
    throw new Error(
      'Cannot reach the server. Check your internet connection and try again.',
    );
  }

  if (response.status === 401) {
    clearAuthAndReload();
    throw new Error('Your session has expired. Please log in again.');
  }

  if (response.status === 429) {
    throw new Error('Daily AI quota reached. Please try again later.');
  }

  if (!response.ok || !response.body) {
    throw new Error(`Request failed (${response.status}). Please try again.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

      let separator = buffer.indexOf('\n\n');

      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);

        let eventName: string | null = null;
        const dataLines: string[] = [];

        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            // Per the SSE spec only ONE leading space after "data:" is the
            // separator; stripping all whitespace would corrupt token deltas
            // that intentionally begin or end with spaces.
            dataLines.push(line.slice(5).replace(/^ /, ''));
          }
        }

        if (dataLines.length > 0) {
          if (eventName === 'done') {
            receivedDone = true;
          }

          dispatchEvent(eventName, dataLines.join('\n'), handlers);
        }

        separator = buffer.indexOf('\n\n');
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Something went wrong. Please try again.');
  }

  if (!receivedDone) {
    throw new Error(
      'The server ended the response unexpectedly. Please try again.',
    );
  }
}