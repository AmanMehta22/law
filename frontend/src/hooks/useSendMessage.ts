import { useMutation } from '@tanstack/react-query';
import { useConversation } from '../store/ChatContext';
import { streamMessage, toMessage } from '../api/messages';
import { getApiErrorMessage } from '../api/client';
import { Message, IntakeContext } from '../types/conversation';

interface SendMessageArgs {
  text: string;
  contextOverride?: IntakeContext;
}

export function useSendMessage() {
  const { state, dispatch } = useConversation();

  return useMutation<Message, Error, SendMessageArgs>({
    mutationFn: async ({ text, contextOverride }) => {
      const startedNew = !state.conversationId;
      const convId = state.conversationId;

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
        conversation_id: convId ?? '',
        created_at: new Date().toISOString(),
        sender: 'user',
        answer_text: text,
        answer_format: 'text',
        cards_used: [],
        overall_confidence: 1.0,
        overall_review_status: 'reviewed',
        disclaimer: '',
        suggested_follow_ups: [],
        context: mergedContext,
      };

      dispatch({ type: 'MESSAGE_SENT', payload: { userMessage } });

      // Start the SSE stream: status + token deltas flow into the chat
      // while the backend generates, then the final message arrives.
      dispatch({ type: 'STREAM_START' });
      dispatch({ type: 'STREAM_STATUS', payload: 'Thinking\u2026' });

      return new Promise<Message>((resolve, reject) => {
        streamMessage(convId, text, mergedContext, {
          onStatus: (status) =>
            dispatch({ type: 'STREAM_STATUS', payload: status }),
          onToken: (token) =>
            dispatch({ type: 'STREAM_DELTA', payload: { text: token } }),
          onDone: (result) => {
            if (startedNew) {
              dispatch({
                type: 'CONVERSATION_STARTED',
                payload: { conversationId: result.conversationId },
              });
            }

            const botMessage = toMessage(result);

            dispatch({ type: 'MESSAGE_RECEIVED', payload: { botMessage } });
            dispatch({ type: 'STREAM_END' });

            resolve(botMessage);
          },
        });
      });
    },
    onError: (error) => {
      dispatch({
        type: 'SET_ERROR',
        payload: getApiErrorMessage(error),
      });
    },
  });
}