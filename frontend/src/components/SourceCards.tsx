import React, { useState } from 'react';
import { ChevronUp, ChevronDown, FileText } from 'lucide-react';
import { V2KnowledgeCard } from '../types/knowledgeCard';
import { cn } from '../utils/cn';

interface SourceCardsProps {
  cards: V2KnowledgeCard[];
}

const CONCEPT_LABELS: Record<string, string> = {
  definition: 'Definition',
  timeline: 'Timeline',
  jurisdiction: 'Jurisdiction',
  procedure: 'Procedure',
  penalty: 'Penalty',
};

const reviewBadgeClass = (reviewStatus: string): string =>
  reviewStatus === 'reviewed'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-[#FBF1DE] text-[#A66A00] border-[#E3C88F]';

export const SourceCards: React.FC<SourceCardsProps> = ({ cards }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!cards || cards.length === 0) return null;

  const reviewedCount = cards.filter(
    (c) => c.metadata?.review_status === 'reviewed',
  ).length;

  return (
    <div className="pt-2 border-t border-neutral-100">
      <button
        onClick={() => setIsOpen((open) => !open)}
        className="w-full flex items-center justify-between py-1.5 text-left cursor-pointer group"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 group-hover:text-[#1E3A5F]">
          <FileText className="w-3.5 h-3.5 text-neutral-400" />
          Sources used ({cards.length})
          {reviewedCount > 0 && (
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
              {reviewedCount} reviewed
            </span>
          )}
        </span>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 text-neutral-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-2 animate-fade-in">
          {cards.map((card, idx) => {
            const conceptLabel = CONCEPT_LABELS[card.concept_type] ?? card.concept_type;
            const reviewStatus = card.metadata?.review_status ?? 'draft';
            const confidence = card.metadata?.confidence;

            return (
              <div
                key={card.concept_id ?? idx}
                className="rounded-xl bg-white border border-neutral-200 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-neutral-900">
                    {card.title}
                  </span>
                  {typeof confidence === 'number' && (
                    <span className="text-[10px] font-medium text-neutral-400">
                      {Math.round(confidence * 100)}%
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EAF1F8] text-[#1E3A5F] border border-[#D6DAE0]">
                    {conceptLabel}
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                      reviewBadgeClass(reviewStatus),
                    )}
                  >
                    {reviewStatus}
                  </span>
                </div>
                {card.description && (
                  <p className="text-[11px] text-neutral-500 mt-1.5 leading-relaxed">
                    {card.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};