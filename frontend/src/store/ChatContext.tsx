import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { chatReducer, initialChatState, ChatState, ChatAction } from './chatReducer';
import { getConversations, getConversation } from '../api/conversations';
import { getApiErrorMessage } from '../api/client';
import { Conversation } from '../types/conversation';
import { STORAGE_KEYS } from '../constants/storageKeys';

/** How often the reopened conversation is re-fetched while an answer is
 *  still being generated on the server. */
const AWAIT_REPLY_POLL_MS = 2_500;
/** Give up polling after ~2.5 minutes; the answer still lands in history. */
const AWAIT_REPLY_MAX_POLLS = 60;

interface ChatContextType {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  loadConversations: () => Promise<void>;
  openConversation: (conversationId: string) => Promise<boolean>;
  newChat: () => void;
  cancelGeneration: () => void;
  setStreamController: (controller: AbortController | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  // Latest state for use inside async polling callbacks.
  const stateRef = useRef(state);
  stateRef.current = state;

  const pollTimerRef = useRef<number | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  // Conversations the user explicitly cancelled — reopening them must NOT
  // resume polling (the "process start again" bug). Persisted so a reload
  // also respects the permanent stop. Cleared when a new message is sent.
  const cancelledRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.cancelledConversations);
        return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        return new Set<string>();
      }
    })(),
  );

  const persistCancelled = useCallback(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.cancelledConversations,
        JSON.stringify([...cancelledRef.current]),
      );
    } catch {
      // quota/privatemode — ignore, in-memory set still works for session
    }
  }, []);

  const markCancelled = useCallback(
    (id: string | null) => {
      if (!id) return;
      cancelledRef.current.add(id);
      persistCancelled();
    },
    [persistCancelled],
  );

  const clearCancelled = useCallback(
    (id: string | null) => {
      if (!id) return;
      if (cancelledRef.current.delete(id)) persistCancelled();
    },
    [persistCancelled],
  );

  const cancelAwaitReply = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const cancelGeneration = useCallback(() => {
    // Permanent stop for the active conversation — reopening it must not poll
    const cid = stateRef.current.conversationId;
    if (cid) markCancelled(cid);

    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    cancelAwaitReply();
    // Only dispatch if actually streaming; reducer is idempotent anyway.
    dispatch({ type: 'STREAM_CANCEL' });
  }, [cancelAwaitReply, markCancelled]);

  const setStreamController = useCallback(
    (controller: AbortController | null) => {
      streamAbortRef.current = controller;
      // A new generation is starting in the current conversation — it is no
      // longer "cancelled permanently". Clear the flag so retries work.
      if (controller) {
        const cid = stateRef.current.conversationId;
        if (cid) clearCancelled(cid);
      }
    },
    [clearCancelled],
  );

  useEffect(() => cancelAwaitReply, [cancelAwaitReply]);

  // Abort any in-flight generation if the tab is closed/refreshed — lets the
  // backend's disconnectController abort the LLM call and save quota.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (streamAbortRef.current) streamAbortRef.current.abort();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  /**
   * The conversation's last message is from the user with no answer yet —
   * the backend is still generating (it finishes and persists the answer
   * even if this tab was refreshed mid-stream). Poll until it appears.
   */
  const beginAwaitingReply = useCallback(
    (conversationId: string) => {
      cancelAwaitReply();

      dispatch({ type: 'AWAIT_REPLY', payload: { conversationId } });

      const tick = async (attempt: number) => {
        // The user navigated away from this conversation: stop silently.
        if (stateRef.current.conversationId !== conversationId) return;

        try {
          const detail = await getConversation(conversationId);
          const last = detail.messages[detail.messages.length - 1];

          if (last && last.sender === 'bot') {
            if (stateRef.current.conversationId === conversationId) {
              dispatch({ type: 'MESSAGE_RECEIVED', payload: { botMessage: last } });
            }
            return;
          }
        } catch {
          // Transient network failure: keep polling.
        }

        if (attempt >= AWAIT_REPLY_MAX_POLLS) {
          if (stateRef.current.conversationId === conversationId) {
            dispatch({ type: 'AWAIT_REPLY_TIMEOUT' });
          }
          return;
        }

        pollTimerRef.current = window.setTimeout(
          () => tick(attempt + 1),
          AWAIT_REPLY_POLL_MS,
        );
      };

      pollTimerRef.current = window.setTimeout(() => tick(0), AWAIT_REPLY_POLL_MS);
    },
    [cancelAwaitReply],
  );

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
      dispatch({
        type: 'SET_ERROR',
        payload: getApiErrorMessage(
          error,
          'Failed to load conversations. Please refresh.',
        ),
      });
    }
  }, []);

  const openConversation = useCallback(async (conversationId: string) => {
    try {
      // Permanent stop for the conversation we are leaving — reopening it
      // must not resume polling. Abort fetch → backend LLM abort.
      const prevId = stateRef.current.conversationId;
      if (prevId && prevId !== conversationId) markCancelled(prevId);

      // Stop any generation for the previous conversation; the fetch
      // abort triggers the backend's res.on('close') -> LLM abort.
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
        streamAbortRef.current = null;
      }
      cancelAwaitReply();
      dispatch({ type: 'STREAM_CANCEL' });
      dispatch({ type: 'CONVERSATION_LOADING' });
      const detail = await getConversation(conversationId);

      dispatch({
        type: 'CONVERSATION_LOADED',
        payload: {
          conversationId: detail.conversation.conversation_id,
          messages: detail.messages,
        },
      });

      // If the last message is still an unanswered user question, the
      // backend is mid-generation (e.g. this tab was refreshed while the
      // answer streamed). Keep watching until it lands — UNLESS the user
      // explicitly cancelled this conversation (permanent stop).
      const lastMessage = detail.messages[detail.messages.length - 1];
      if (
        lastMessage &&
        lastMessage.sender === 'user' &&
        !cancelledRef.current.has(detail.conversation.conversation_id)
      ) {
        beginAwaitingReply(detail.conversation.conversation_id);
      }

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
      console.error('Failed to load conversation:', getApiErrorMessage(error));
      dispatch({ type: 'RESET_CONVERSATION' });
      return false;
    }
  }, [beginAwaitingReply, cancelAwaitReply, markCancelled]);

  const newChat = useCallback(() => {
    const cid = stateRef.current.conversationId;
    if (cid) markCancelled(cid);
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    cancelAwaitReply();
    dispatch({ type: 'STREAM_CANCEL' });
    dispatch({ type: 'RESET_CONVERSATION' });
  }, [cancelAwaitReply, markCancelled]);

  useEffect(() => {
    if (state.conversationId) {
      localStorage.setItem(STORAGE_KEYS.activeConversation, state.conversationId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.activeConversation);
    }
  }, [state.conversationId]);

  return (
    <ChatContext.Provider
      value={{
        state,
        dispatch,
        loadConversations,
        openConversation,
        newChat,
        cancelGeneration,
        setStreamController,
      }}
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
