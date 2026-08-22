import React, { useRef, useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useConversation } from '../store/ChatContext';
import { useSendMessage } from '../hooks/useSendMessage';
import { WelcomeState } from './WelcomeState';
import { UserMessageBubble } from './UserMessageBubble';
import { BotMessageCard } from './BotMessageCard';
import { TextAnswer } from './TextAnswer';
import { LoadingIndicator } from './LoadingIndicator';

export const ConversationView: React.FC = () => {
  const { state, dispatch } = useConversation();
  const sendMessageMutation = useSendMessage();
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isSending,
    isLoadingConversation,
    error,
    streamingText,
    streamStatus,
  } = state;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending, streamingText, streamStatus]);

  const handleSelectPrompt = (prompt: string) => {
    if (isSending || isLoadingConversation) return;
    sendMessageMutation.mutate({ text: prompt });
  };

  const handleQuickReply = (replyText: string) => {
    if (isSending || isLoadingConversation) return;
    sendMessageMutation.mutate({ text: replyText });
  };

  const handleRetry = () => {
    if (isSending || isLoadingConversation) return;
    const lastUserMessage = [...messages].reverse().find((m) => m.sender === 'user');
    if (lastUserMessage) {
      dispatch({
        type: 'REMOVE_MESSAGE',
        payload: { messageId: lastUserMessage.message_id },
      });
      sendMessageMutation.mutate({ text: lastUserMessage.answer_text });
    }
  };

  if (messages.length === 0 && !isLoadingConversation) {
    return <WelcomeState onSelectPrompt={handleSelectPrompt} />;
  }

  return (
    <div className="flex-1 py-6 px-4 max-w-2xl mx-auto w-full space-y-4" role="log" aria-live="polite">
      {messages.map((msg) =>
        msg.sender === 'user' ? (
          <UserMessageBubble key={msg.message_id} text={msg.answer_text} />
        ) : (
          <BotMessageCard
            key={msg.message_id}
            message={msg}
            onQuickReplySelect={handleQuickReply}
            isSending={isSending}
          />
        )
      )}

      {streamingText ? (
        <div className="flex justify-start my-4 animate-fade-in">
          <div className="w-full max-w-[88%] sm:max-w-[85%] bg-white border border-neutral-300 rounded-2xl rounded-tl-xs p-4 sm:p-5 shadow-2xs space-y-2">
            {streamStatus && (
              <p className="text-[11px] font-medium text-neutral-400">
                {streamStatus}
              </p>
            )}
            <div className="relative">
              <TextAnswer text={streamingText} />
              <span className="inline-block w-1.5 h-4 bg-[#1E3A5F] ml-0.5 align-middle animate-pulse" />
            </div>
          </div>
        </div>
      ) : (
        (isSending || isLoadingConversation) && (
          <LoadingIndicator status={isLoadingConversation ? null : streamStatus} />
        )
      )}

      {error && (
        <div className="p-4 bg-[#FBF1DE] rounded-xl border border-[#A66A00]/30 text-[#A66A00] my-4 flex items-start gap-3 shadow-2xs animate-fade-in">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-2 text-xs sm:text-sm flex-1">
            <p className="font-semibold text-neutral-900">{error}</p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1E3A5F] text-white rounded-md text-xs font-semibold hover:bg-[#16293F] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Request</span>
            </button>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};