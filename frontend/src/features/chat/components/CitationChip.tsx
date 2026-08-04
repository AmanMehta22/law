import React from 'react';
import { BookOpen } from 'lucide-react';
import { V2KnowledgeCard } from '../../../types/knowledgeCard';

interface CitationChipProps {
  card: V2KnowledgeCard;
  onClick: () => void;
}

export const CitationChip: React.FC<CitationChipProps> = ({ card, onClick }) => {
  const isDraft = card.metadata.review_status === 'draft';

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] cursor-pointer ${
        isDraft
          ? 'bg-[#FBF1DE] text-[#A66A00] border border-[#A66A00]/30 hover:bg-[#f6e6c2]'
          : 'bg-[#EAF1F8] text-[#1E3A5F] border border-[#D6DAE0] hover:bg-[#d5e4f3]'
      }`}
      aria-label={`Citation: ${card.title}. Tap to open verbatim statute details.`}
    >
      <BookOpen className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate max-w-[200px]">{card.title}</span>
    </button>
  );
};
