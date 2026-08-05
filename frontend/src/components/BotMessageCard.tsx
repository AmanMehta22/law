import React, { useState } from 'react';
import { Scale, Volume2, VolumeX, Copy, Check } from 'lucide-react';
import { Message } from '../types/conversation';
import { V2KnowledgeCard } from '../types/knowledgeCard';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { TextAnswer } from './TextAnswer';
import { ChecklistAnswer } from './ChecklistAnswer';
import { DocumentDraftAnswer } from './DocumentDraftAnswer';
import { CitationChipRow } from './CitationChipRow';
import { QuickReplyRow } from './QuickReplyRow';

interface BotMessageCardProps {
  message: Message;
  onCitationClick: (card: V2KnowledgeCard) => void;
  onQuickReplySelect: (reply: string) => void;
  isSending?: boolean;
}

export const BotMessageCard: React.FC<BotMessageCardProps> = ({
  message,
  onCitationClick,
  onQuickReplySelect,
  isSending,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleSpeak = () => {
    if (!('speechSynthesis' in window)) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    const textToSpeak = message.answer_text.replace(/[*#]/g, '');
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsPlayingAudio(true);
  };

  const handleCopyText = () => {
    let copyContent = message.answer_text;
    if (message.document_draft) {
      copyContent = message.document_draft.body;
    }
    navigator.clipboard.writeText(copyContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="flex justify-start my-4 animate-fade-in">
      <div className="w-full max-w-[88%] sm:max-w-[85%] bg-white border border-neutral-300 rounded-2xl rounded-tl-xs p-4 sm:p-5 shadow-2xs space-y-4">
        {/* Card Header: Bot Identity, Audio TTS, Copy & Status Badge */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-neutral-200/80">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#1E3A5F] text-white flex items-center justify-center">
              <Scale className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-neutral-900 tracking-tight">LegalBot CPA</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Audio Listen / Speak Button */}
            {'speechSynthesis' in window && (
              <button
                onClick={handleSpeak}
                className={`p-1.5 rounded-md text-xs transition-colors flex items-center gap-1 cursor-pointer ${
                  isPlayingAudio
                    ? 'bg-[#EAF1F8] text-[#1E3A5F] font-bold ring-1 ring-[#1E3A5F]'
                    : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100'
                }`}
                title={isPlayingAudio ? 'Stop audio' : 'Listen to answer'}
                aria-label={isPlayingAudio ? 'Stop speech synthesis' : 'Read answer aloud'}
              >
                {isPlayingAudio ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-[#1E3A5F] animate-pulse" />
                    <span className="text-[10px] hidden sm:inline text-[#1E3A5F]">Playing...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span className="text-[10px] hidden sm:inline">Listen</span>
                  </>
                )}
              </button>
            )}

            {/* Copy button */}
            <button
              onClick={handleCopyText}
              className="p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
              title="Copy text"
              aria-label="Copy message text"
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[10px] text-emerald-600 font-semibold hidden sm:inline">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[10px] hidden sm:inline">Copy</span>
                </>
              )}
            </button>

            <ReviewStatusBadge
              status={message.overall_review_status}
              confidence={message.overall_confidence}
              isLowConfidence={message.is_low_confidence}
            />
          </div>
        </div>

        {/* Content according to answer_format */}
        {message.answer_format === 'document_draft' && message.document_draft ? (
          <DocumentDraftAnswer draft={message.document_draft} />
        ) : message.answer_format === 'checklist' && message.checklist_ref ? (
          <ChecklistAnswer card={message.checklist_ref} introText={message.answer_text} />
        ) : (
          <TextAnswer text={message.answer_text} />
        )}

        {/* Quick replies if provided */}
        {message.quick_replies && message.quick_replies.length > 0 && (
          <QuickReplyRow
            replies={message.quick_replies}
            onSelect={onQuickReplySelect}
            disabled={isSending}
          />
        )}

        {/* Citation chips */}
        {message.cards_used && message.cards_used.length > 0 && (
          <CitationChipRow cards={message.cards_used} onCitationClick={onCitationClick} />
        )}

        {/* Disclaimer footer if needed */}
        {message.disclaimer && (
          <p className="text-[11px] text-neutral-400 italic pt-1 border-t border-neutral-100">
            {message.disclaimer}
          </p>
        )}
      </div>
    </div>
  );
};
