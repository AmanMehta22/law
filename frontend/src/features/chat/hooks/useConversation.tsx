import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { chatReducer, initialChatState, ChatState, ChatAction } from '../chatReducer';
import { mockApi } from '../../../api/mockApi';

interface ChatContextType {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  resetConversation: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  useEffect(() => {
    // Start initial conversation session
    if (!state.conversationId) {
      mockApi.startConversation().then((conv) => {
        dispatch({
          type: 'CONVERSATION_STARTED',
          payload: { conversationId: conv.conversation_id },
        });
      });
    }
  }, [state.conversationId]);

  const resetConversation = async () => {
    dispatch({ type: 'RESET_CONVERSATION' });
    const conv = await mockApi.startConversation();
    dispatch({
      type: 'CONVERSATION_STARTED',
      payload: { conversationId: conv.conversation_id },
    });
  };

  return (
    <ChatContext.Provider value={{ state, dispatch, resetConversation }}>
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
