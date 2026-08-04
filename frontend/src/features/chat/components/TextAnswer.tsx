import React from 'react';

interface TextAnswerProps {
  text: string;
}

export const TextAnswer: React.FC<TextAnswerProps> = ({ text }) => {
  // Format bolding and newlines nicely
  const paragraphs = text.split('\n\n');

  return (
    <div className="space-y-3 text-[#14181F] text-sm sm:text-base leading-relaxed">
      {paragraphs.map((p, idx) => {
        // Handle bold markdown formatting like **text**
        const parts = p.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={idx}>
            {parts.map((part, pIdx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <strong key={pIdx} className="font-semibold text-neutral-950">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return part;
            })}
          </p>
        );
      })}
    </div>
  );
};
