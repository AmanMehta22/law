import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { chatReducer, initialChatState, ChatState, ChatAction } from './chatReducer';
import { getConversations, getConversation } from '../api/conversations';
import { Conversation } from '../types/conversation';

const ACTIVE_CONVERSATION_KEY = 'legalbot_active_conversation';

interface ChatContextType {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  loadConversations: () => Promise<void>;
  openConversation: (conversationId: string) => Promise<boolean>;
  newChat: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  const loadConversations = useCallback(async () => {
    try {
      let conversations: Conversation[] = await getConversations();

      const placeholders = conversations.filter(
        (c) => !c.title || c.title === 'New Conversation',
      );

      if (placeholders.length > 0) {
        const placeholderIds = new Set(
          placeholders.map((c) => c.conversation_id),
        );
        const details = await Promise.allSettled(
          placeholders.map((c) => getConversation(c.conversation_id)),
        );
        const keptTitles = new Map<string, string>();

        details.forEach((result, i) => {
          if (result.status !== 'fulfilled') return;
          const conv = placeholders[i];
          if (result.value.messages.length === 0) return;
          const firstUser = result.value.messages.find((m) => m.sender === 'user');
          const text = firstUser ? firstUser.answer_text.trim() : conv.title;
          keptTitles.set(
            conv.conversation_id,
            text.length > 60 ? `${text.slice(0, 60).trimEnd()}...` : text,
          );
        });

        conversations = conversations
          .filter(
            (c) =>
              !placeholderIds.has(c.conversation_id) ||
              keptTitles.has(c.conversation_id),
          )
          .map((c) =>
            keptTitles.has(c.conversation_id)
              ? { ...c, title: keptTitles.get(c.conversation_id)! }
              : c,
          );
      }

      dispatch({ type: 'CONVERSATIONS_LOADED', payload: conversations });
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }, []);

  const openConversation = useCallback(async (conversationId: string) => {
    try {
      dispatch({ type: 'CONVERSATION_LOADING' });
      const detail = await getConversation(conversationId);

      dispatch({
        type: 'CONVERSATION_LOADED',
        payload: {
          conversationId: detail.conversation.conversation_id,
          messages: detail.messages,
        },
      });

      const title = detail.conversation.title;
      if (!title || title === 'New Conversation') {
        const firstUserMessage = detail.messages.find((m) => m.sender === 'user');
        if (firstUserMessage) {
          const text = firstUserMessage.answer_text.trim();
          const derived =
            text.length > 60 ? `${text.slice(0, 60).trimEnd()}...` : text;
          dispatch({
            type: 'CONVERSATION_TITLE_UPDATED',
            payload: {
              conversationId: detail.conversation.conversation_id,
              title: derived,
            },
          });
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to load conversation:', error);
      dispatch({ type: 'RESET_CONVERSATION' });
      return false;
    }
  }, []);

  const newChat = useCallback(() => {
    dispatch({ type: 'RESET_CONVERSATION' });
  }, []);

  useEffect(() => {
    if (state.conversationId) {
      localStorage.setItem(ACTIVE_CONVERSATION_KEY, state.conversationId);
    } else {
      localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    }
  }, [state.conversationId]);

  return (
    <ChatContext.Provider
      value={{ state, dispatch, loadConversations, openConversation, newChat }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export function useConversation() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useConversation must be used within a ChatProvider');
  }
  return context;
}
