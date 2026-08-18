import { Message, IntakeContext, Conversation } from '../types/conversation';

export interface ChatState {
  conversationId: string | null;
  messages: Message[];
  intakeContext: IntakeContext;
  conversations: Conversation[];
  isSending: boolean;
  isLoadingConversation: boolean;
  error: string | null;
  streamingText: string;
  streamStatus: string | null;
  streamConversationId: string | null;
}

export type ChatAction =
  | { type: 'CONVERSATION_STARTED'; payload: { conversationId: string } }
  | { type: 'MESSAGE_SENT'; payload: { userMessage: Message } }
  | { type: 'MESSAGE_RECEIVED'; payload: { botMessage: Message } }
  | { type: 'REMOVE_MESSAGE'; payload: { messageId: string } }
  | { type: 'SET_INTAKE_CONTEXT'; payload: IntakeContext }
  | { type: 'RESET_CONVERSATION' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_STATUS'; payload: string }
  | { type: 'STREAM_DELTA'; payload: { text: string } }
  | { type: 'STREAM_END' }
  | { type: 'CONVERSATIONS_LOADED'; payload: Conversation[] }
  | { type: 'CONVERSATION_LOADING' }
  | { type: 'CONVERSATION_TITLE_UPDATED'; payload: { conversationId: string; title: string } }
  | {
      type: 'CONVERSATION_LOADED';
      payload: { conversationId: string; messages: Message[] };
    };

export const initialChatState: ChatState = {
  conversationId: null,
  messages: [],
  intakeContext: {},
  conversations: [],
  isSending: false,
  isLoadingConversation: false,
  error: null,
  streamingText: '',
  streamStatus: null,
  streamConversationId: null,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'CONVERSATION_STARTED':
      return {
        ...state,
        conversationId: action.payload.conversationId,
        error: null,
      };

    case 'MESSAGE_SENT':
      return {
        ...state,
        messages: [...state.messages, action.payload.userMessage],
        isSending: true,
        error: null,
      };

    case 'MESSAGE_RECEIVED':
      if (action.payload.botMessage.conversation_id !== state.conversationId) {
        return {
          ...state,
          isSending: false,
          streamingText: '',
          streamStatus: null,
          streamConversationId: null,
          error:
            'Your latest answer was saved to another conversation. Open it from the sidebar to see it.',
        };
      }
      return {
        ...state,
        messages: [...state.messages, action.payload.botMessage],
        isSending: false,
        streamingText: '',
        streamStatus: null,
        streamConversationId: null,
        error: null,
      };

    case 'STREAM_START':
      return {
        ...state,
        isSending: true,
        error: null,
        streamingText: '',
        streamStatus: null,
        streamConversationId: state.conversationId,
      };

    case 'STREAM_STATUS':
      return {
        ...state,
        streamStatus: action.payload,
      };

    case 'STREAM_DELTA':
      if (state.streamConversationId !== state.conversationId) {
        return state;
      }

      return {
        ...state,
        streamingText: state.streamingText + action.payload.text,
      };

    case 'STREAM_END':
      return {
        ...state,
        streamingText: '',
        streamStatus: null,
        streamConversationId: null,
      };

    case 'REMOVE_MESSAGE':
      return {
        ...state,
        messages: state.messages.filter(
          (m) => m.message_id !== action.payload.messageId,
        ),
      };

    case 'SET_INTAKE_CONTEXT':
      return {
        ...state,
        intakeContext: {
          ...state.intakeContext,
          ...action.payload,
        },
      };

    case 'RESET_CONVERSATION':
      return {
        ...initialChatState,
        conversations: state.conversations,
      };

    case 'SET_ERROR':
      return {
        ...state,
        isSending: false,
        streamingText: '',
        streamStatus: null,
        streamConversationId: null,
        error: action.payload,
      };

    case 'CONVERSATIONS_LOADED':
      return {
        ...state,
        conversations: moveToTop(action.payload, state.conversationId),
      };

    case 'CONVERSATION_TITLE_UPDATED':
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.conversation_id === action.payload.conversationId
            ? { ...c, title: action.payload.title }
            : c,
        ),
      };

    case 'CONVERSATION_LOADING':
      return {
        ...state,
        isLoadingConversation: true,
        isSending: false,
        error: null,
      };

    case 'CONVERSATION_LOADED':
      return {
        ...state,
        conversationId: action.payload.conversationId,
        messages: action.payload.messages,
        isLoadingConversation: false,
        isSending: false,
        streamingText: '',
        streamStatus: null,
        streamConversationId: null,
        error: null,
      };

    default:
      return state;
  }
}

function moveToTop(
  conversations: Conversation[],
  activeConversationId: string | null,
): Conversation[] {
  if (!activeConversationId) {
    return conversations;
  }

  const list = [...conversations];
  const idx = list.findIndex(
    (c) => c.conversation_id === activeConversationId,
  );

  if (idx <= 0) {
    return list;
  }

  const [active] = list.splice(idx, 1);
  list.unshift(active);

  return list;
}
