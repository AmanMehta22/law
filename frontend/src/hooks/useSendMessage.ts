import { useMutation } from '@tanstack/react-query';
import { useConversation } from '../store/ChatContext';
import { mockApi } from '../api/mockApi';
import { Message, IntakeContext } from '../types/conversation';

interface SendMessageArgs {
  text: string;
  contextOverride?: IntakeContext;
}

export function useSendMessage() {
  const { state, dispatch } = useConversation();

  return useMutation<Message, Error, SendMessageArgs>({
    mutationFn: async ({ text, contextOverride }) => {
      let convId = state.conversationId;
      if (!convId) {
        const newConv = await mockApi.startConversation();
        convId = newConv.conversation_id;
        dispatch({
          type: 'CONVERSATION_STARTED',
          payload: { conversationId: convId },
        });
      }

      // Updated context
      const mergedContext: IntakeContext = {
        ...state.intakeContext,
        ...contextOverride,
      };

      if (contextOverride) {
        dispatch({
          type: 'SET_INTAKE_CONTEXT',
          payload: contextOverride,
        });
      }

      // Add user message immediately
      const userMessage: Message = {
        message_id: 'msg_u_' + Math.random().toString(36).substring(2, 9),
        conversation_id: convId,
        created_at: new Date().toISOString(),
        sender: 'user',
        answer_text: text,
        answer_format: 'text',
        cards_used: [],
        v1_nodes_used: [],
        overall_confidence: 1.0,
        overall_review_status: 'reviewed',
        disclaimer: '',
        suggested_follow_ups: [],
        context: mergedContext,
      };

      dispatch({ type: 'MESSAGE_SENT', payload: { userMessage } });

      // Call API
      const botResponse = await mockApi.sendMessage(convId, text, mergedContext);
      return botResponse;
    },
    onSuccess: (botMessage) => {
      dispatch({ type: 'MESSAGE_RECEIVED', payload: { botMessage } });
    },
    onError: (error) => {
      dispatch({
        type: 'SET_ERROR',
        payload: error.message || 'Failed to generate response. Please try again.',
      });
    },
  });
}
