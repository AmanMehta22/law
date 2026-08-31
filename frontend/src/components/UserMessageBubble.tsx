import React from 'react';

interface UserMessageBubbleProps {
  text: string;
  createdAt?: string;
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export const UserMessageBubble: React.FC<UserMessageBubbleProps> = ({ text, createdAt }) => {
  return (
    <div className="flex justify-end my-3 animate-fade-in">
      <div className="max-w-[85%] sm:max-w-[80%] bg-[#EAF1F8] text-[#14181F] border border-[#D6DAE0] rounded-2xl rounded-tr-xs px-4 py-3 text-sm sm:text-base leading-relaxed shadow-2xs">
        <div>{text}</div>
        {createdAt && (
          <div className="text-[11px] text-neutral-500 text-right mt-1.5 select-none">
            {formatTime(createdAt)}
          </div>
        )}
      </div>
    </div>
  );
};
