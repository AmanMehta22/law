import React from 'react';

interface UserMessageBubbleProps {
  text: string;
}

export const UserMessageBubble: React.FC<UserMessageBubbleProps> = ({ text }) => {
  return (
    <div className="flex justify-end my-3 animate-fade-in">
      <div className="max-w-[85%] sm:max-w-[80%] bg-[#EAF1F8] text-[#14181F] border border-[#D6DAE0] rounded-2xl rounded-tr-xs px-4 py-3 text-sm sm:text-base leading-relaxed shadow-2xs">
        {text}
      </div>
    </div>
  );
};
