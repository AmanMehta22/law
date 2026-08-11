import React from 'react';

interface QuickReplyRowProps {
  replies: string[];
  onSelect: (replyText: string) => void;
  disabled?: boolean;
}

export const QuickReplyRow: React.FC<QuickReplyRowProps> = ({
  replies,
  onSelect,
  disabled,
}) => {
  if (!replies || replies.length === 0) return null;

  return (
    <div className="pt-2 flex flex-wrap gap-2 animate-fade-in" aria-label="Quick reply suggestions">
      {replies.map((reply, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(reply)}
          disabled={disabled}
          className="px-3.5 py-2 rounded-full text-xs font-semibold bg-[#EAF1F8] text-[#1E3A5F] border border-[#D6DAE0] hover:bg-[#1E3A5F] hover:text-white transition-all transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] disabled:opacity-50 cursor-pointer"
        >
          {reply}
        </button>
      ))}
    </div>
  );
};
