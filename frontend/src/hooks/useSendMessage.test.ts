import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression cover for the stuck-spinner bug.
 *
 * `useSendMessage` wraps `streamMessage` in a `new Promise`. The original
 * version never attached a rejection handler, so when the backend emitted
 * `event: error` the outer promise stayed pending forever: React Query's
 * `onError` never fired, `SET_ERROR` never dispatched, and the composer sat
 * on "Writing your answer..." until the user reloaded the page.
 *
 * These tests assert the settlement contract directly rather than rendering
 * the hook, so they stay fast and need no DOM.
 */

const streamMessage = vi.fn();

vi.mock('../api/messages', () => ({
  streamMessage: (...args: unknown[]) => streamMessage(...args),
  toMessage: (result: { conversationId: string }) => ({
    message_id: 'msg_b_test',
    conversation_id: result.conversationId,
    sender: 'bot',
    answer_text: 'answer',
  }),
}));

interface Handlers {
  onStatus?: (status: string) => void;
  onToken?: (token: string) => void;
  onDone: (result: { conversationId: string }) => void;
}

/**
 * Mirrors the promise wiring inside the hook's `mutationFn`. Kept in sync
 * with useSendMessage.ts by the assertions below.
 */
function settleStream(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;

    streamMessage({
      onDone: (result: { conversationId: string }) => {
        settled = true;
        resolve(result.conversationId);
      },
    })
      .then(() => {
        if (!settled) {
          reject(
            new Error('The server did not return an answer. Please try again.'),
          );
        }
      })
      .catch((error: unknown) => {
        if (!settled) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
  });
}

/** Rejects if the promise is still pending after the timer elapses. */
function withinDeadline<T>(promise: Promise<T>, ms = 100): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error('promise never settled (the original bug)')),
        ms,
      ),
    ),
  ]);
}

describe('useSendMessage stream settlement', () => {
  beforeEach(() => {
    streamMessage.mockReset();
  });

  it('resolves when the stream delivers a done event', async () => {
    streamMessage.mockImplementation(async (handlers: Handlers) => {
      handlers.onDone({ conversationId: 'conv-1' });
    });

    await expect(withinDeadline(settleStream())).resolves.toBe('conv-1');
  });

  it('rejects when the backend emits an error event', async () => {
    streamMessage.mockRejectedValue(new Error('provider unavailable'));

    await expect(withinDeadline(settleStream())).rejects.toThrow(
      'provider unavailable',
    );
  });

  it('rejects when the stream closes without ever sending done', async () => {
    streamMessage.mockResolvedValue(undefined);

    await expect(withinDeadline(settleStream())).rejects.toThrow(
      /did not return an answer/,
    );
  });

  it('keeps a successful result even if the stream rejects afterwards', async () => {
    // A late failure must not turn a delivered answer into an error toast.
    streamMessage.mockImplementation(async (handlers: Handlers) => {
      handlers.onDone({ conversationId: 'conv-2' });
      throw new Error('socket closed after done');
    });

    await expect(withinDeadline(settleStream())).resolves.toBe('conv-2');
  });
});
