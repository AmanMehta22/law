import { describe, it, expect } from 'vitest';
import { chatReducer, initialChatState, ChatState } from './chatReducer';
import { Message, Conversation } from '../types/conversation';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    message_id: 'msg_1',
    conversation_id: 'conv_1',
    created_at: '2026-08-06T00:00:00.000Z',
    sender: 'user',
    answer_text: 'hello',
    answer_format: 'text',
    cards_used: [],
    overall_confidence: 1,
    overall_review_status: 'reviewed',
    disclaimer: '',
    suggested_follow_ups: [],
    ...overrides,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    conversation_id: 'conv_1',
    title: 'Title',
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

const chatState: ChatState = { ...initialChatState, conversationId: 'conv_1' };

describe('chatReducer', () => {
  it('appends a user message and flags isSending on MESSAGE_SENT', () => {
    const userMsg = makeMessage({ message_id: 'msg_u_abc' });
    const next = chatReducer(chatState, {
      type: 'MESSAGE_SENT',
      payload: { userMessage: userMsg },
    });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].message_id).toBe('msg_u_abc');
    expect(next.isSending).toBe(true);
    expect(next.error).toBeNull();
  });

  it('appends a bot message when its conversation matches the active one', () => {
    const botMsg = makeMessage({
      message_id: 'msg_b_1',
      conversation_id: 'conv_1',
      sender: 'bot',
    });
    const next = chatReducer(
      { ...chatState, isSending: true },
      { type: 'MESSAGE_RECEIVED', payload: { botMessage: botMsg } },
    );
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].message_id).toBe('msg_b_1');
    expect(next.isSending).toBe(false);
  });

  it('drops a stale bot response for a different conversation', () => {
    const botMsg = makeMessage({
      message_id: 'msg_b_1',
      conversation_id: 'conv_OTHER',
      sender: 'bot',
    });
    const next = chatReducer(
      { ...chatState, isSending: true },
      { type: 'MESSAGE_RECEIVED', payload: { botMessage: botMsg } },
    );
    expect(next.messages).toHaveLength(0);
    expect(next.isSending).toBe(false);
  });

  it('STREAM_START/STATUS/DELTA accumulate text for the active conversation', () => {
    let next = chatReducer(chatState, { type: 'STREAM_START' });
    expect(next.isSending).toBe(true);
    expect(next.streamConversationId).toBe('conv_1');

    next = chatReducer(next, { type: 'STREAM_STATUS', payload: 'Writing…' });
    next = chatReducer(next, { type: 'STREAM_DELTA', payload: { text: 'Hel' } });
    next = chatReducer(next, { type: 'STREAM_DELTA', payload: { text: 'lo' } });

    expect(next.streamingText).toBe('Hello');
    expect(next.streamStatus).toBe('Writing…');
  });

  it('STREAM_DELTA drops tokens when the conversation was switched', () => {
    const started = chatReducer(chatState, { type: 'STREAM_START' });
    const switched = chatReducer(
      { ...started, conversationId: 'conv_OTHER' },
      { type: 'STREAM_DELTA', payload: { text: 'x' } },
    );
    expect(switched.streamingText).toBe('');
  });

  it('STREAM_END clears streaming state', () => {
    const next = chatReducer(
      {
        ...chatState,
        streamingText: 'abc',
        streamStatus: 'Writing…',
        streamConversationId: 'conv_1',
      },
      { type: 'STREAM_END' },
    );
    expect(next.streamingText).toBe('');
    expect(next.streamStatus).toBeNull();
    expect(next.streamConversationId).toBeNull();
    expect(next.isSending).toBe(false);
  });

  it('MESSAGE_RECEIVED clears streaming state', () => {
    const botMsg = makeMessage({ message_id: 'msg_b_1', sender: 'bot' });
    const next = chatReducer(
      {
        ...chatState,
        isSending: true,
        streamingText: 'partial',
        streamStatus: 'Writing…',
      },
      { type: 'MESSAGE_RECEIVED', payload: { botMessage: botMsg } },
    );
    expect(next.streamingText).toBe('');
    expect(next.streamStatus).toBeNull();
    expect(next.messages).toHaveLength(1);
  });

  it('REMOVE_MESSAGE deletes only the targeted message', () => {
    const m1 = makeMessage({ message_id: 'a' });
    const m2 = makeMessage({ message_id: 'b' });
    const next = chatReducer(
      { ...chatState, messages: [m1, m2] },
      { type: 'REMOVE_MESSAGE', payload: { messageId: 'a' } },
    );
    expect(next.messages.map((m) => m.message_id)).toEqual(['b']);
  });

  it('SET_ERROR clears isSending and stores the message', () => {
    const next = chatReducer(
      { ...chatState, isSending: true },
      { type: 'SET_ERROR', payload: 'quota exceeded' },
    );
    expect(next.isSending).toBe(false);
    expect(next.error).toBe('quota exceeded');
  });

  it('CONVERSATIONS_LOADED pins the active conversation to the top', () => {
    const convs = [
      makeConversation({ conversation_id: 'c1' }),
      makeConversation({ conversation_id: 'c2' }),
      makeConversation({ conversation_id: 'c3' }),
    ];
    const next = chatReducer(
      { ...initialChatState, conversationId: 'c3' },
      { type: 'CONVERSATIONS_LOADED', payload: convs },
    );
    expect(next.conversations.map((c) => c.conversation_id)).toEqual([
      'c3',
      'c1',
      'c2',
    ]);
  });

  it('CONVERSATIONS_LOADED keeps order when there is no active conversation', () => {
    const convs = [
      makeConversation({ conversation_id: 'c1' }),
      makeConversation({ conversation_id: 'c2' }),
    ];
    const next = chatReducer(initialChatState, {
      type: 'CONVERSATIONS_LOADED',
      payload: convs,
    });
    expect(next.conversations.map((c) => c.conversation_id)).toEqual([
      'c1',
      'c2',
    ]);
  });

  it('CONVERSATION_TITLE_UPDATED renames the matching conversation only', () => {
    const state: ChatState = {
      ...chatState,
      conversations: [
        makeConversation({ conversation_id: 'c1', title: 'Old' }),
        makeConversation({ conversation_id: 'c2', title: 'Keep' }),
      ],
    };
    const next = chatReducer(state, {
      type: 'CONVERSATION_TITLE_UPDATED',
      payload: { conversationId: 'c1', title: 'New' },
    });
    expect(next.conversations[0].title).toBe('New');
    expect(next.conversations[1].title).toBe('Keep');
  });

  it('RESET_CONVERSATION clears the chat but keeps the conversation list', () => {
    const state: ChatState = {
      ...chatState,
      conversations: [makeConversation()],
      messages: [makeMessage()],
    };
    const next = chatReducer(state, { type: 'RESET_CONVERSATION' });
    expect(next.conversationId).toBeNull();
    expect(next.messages).toHaveLength(0);
    expect(next.conversations).toHaveLength(1);
  });

  it('CONVERSATION_LOADED replaces messages and clears loading state', () => {
    const botMsg = makeMessage({ message_id: 'm1', sender: 'bot' });
    const next = chatReducer(
      { ...chatState, isLoadingConversation: true, messages: [makeMessage()] },
      {
        type: 'CONVERSATION_LOADED',
        payload: { conversationId: 'conv_9', messages: [botMsg] },
      },
    );
    expect(next.conversationId).toBe('conv_9');
    expect(next.messages.map((m) => m.message_id)).toEqual(['m1']);
    expect(next.isLoadingConversation).toBe(false);
  });

  it('returns the same state for unknown actions', () => {
    const next = chatReducer(chatState, { type: 'UNKNOWN' } as never);
    expect(next).toBe(chatState);
  });
});
