import React, { useRef, useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useConversation } from '../store/ChatContext';
import { useSendMessage } from '../hooks/useSendMessage';
import { WelcomeState } from './WelcomeState';
import { UserMessageBubble } from './UserMessageBubble';
import { BotMessageCard } from './BotMessageCard';
import { LoadingIndicator } from './LoadingIndicator';

export const ConversationView: React.FC = () => {
  const { state } = useConversation();
  const sendMessageMutation = useSendMessage();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, isSending, isLoadingConversation, error } = state;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  const handleSelectPrompt = (prompt: string) => {
    sendMessageMutation.mutate({ text: prompt });
  };

  const handleQuickReply = (replyText: string) => {
    sendMessageMutation.mutate({ text: replyText });
  };

  const handleRetry = () => {
    const lastUserMessage = [...messages].reverse().find((m) => m.sender === 'user');
    if (lastUserMessage) {
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

      {(isSending || isLoadingConversation) && <LoadingIndicator />}

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
