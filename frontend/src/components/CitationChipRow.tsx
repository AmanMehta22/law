import React from 'react';
import { CitationChip } from './CitationChip';
import { V2KnowledgeCard } from '../types/knowledgeCard';

interface CitationChipRowProps {
  cards: V2KnowledgeCard[];
  onCitationClick: (card: V2KnowledgeCard) => void;
}

export const CitationChipRow: React.FC<CitationChipRowProps> = ({
  cards,
  onCitationClick,
}) => {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-neutral-200">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        Statutory Citations:
      </span>
      {cards.map((card) => (
        <CitationChip
          key={card.concept_id}
          card={card}
          onClick={() => onCitationClick(card)}
        />
      ))}
    </div>
  );
};
