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
        // Tracks whether `onDone` already settled this promise, so the
        // terminal handlers below cannot report a failure after a success.
        let settled = false;

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

            settled = true;

            resolve(botMessage);
          },
        })
          .then(() => {
            // Reached only if the stream closed cleanly without ever
            // delivering a `done` event. Nothing else would settle this
            // promise, so the composer would stay disabled forever.
            if (!settled) {
              reject(
                new Error(
                  'The server did not return an answer. Please try again.',
                ),
              );
            }
          })
          .catch((error: unknown) => {
            // The line this whole block exists for. `streamMessage` rejects on
            // a backend `event: error`, an expired session, or a dropped
            // connection. Without forwarding that rejection, the outer promise
            // never settles: React Query stays pending, `onError` never runs,
            // and the UI is pinned on the last status it saw
            // ("Writing your answer...") with no way out but a page reload.
            if (!settled) {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
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