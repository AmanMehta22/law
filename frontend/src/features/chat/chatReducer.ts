import { Message, IntakeContext } from '../../types/conversation';

export interface ChatState {
  conversationId: string | null;
  messages: Message[];
  intakeContext: IntakeContext;
  isSending: boolean;
  error: string | null;
}

export type ChatAction =
  | { type: 'CONVERSATION_STARTED'; payload: { conversationId: string } }
  | { type: 'MESSAGE_SENT'; payload: { userMessage: Message } }
  | { type: 'MESSAGE_RECEIVED'; payload: { botMessage: Message } }
  | { type: 'SET_INTAKE_CONTEXT'; payload: IntakeContext }
  | { type: 'RESET_CONVERSATION' }
  | { type: 'SET_ERROR'; payload: string };

export const initialChatState: ChatState = {
  conversationId: null,
  messages: [],
  intakeContext: {},
  isSending: false,
  error: null,
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
      return {
        ...state,
        messages: [...state.messages, action.payload.botMessage],
        isSending: false,
        error: null,
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
      };

    case 'SET_ERROR':
      return {
        ...state,
        isSending: false,
        error: action.payload,
      };

    default:
      return state;
  }
}
