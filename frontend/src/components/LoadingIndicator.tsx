import React from 'react';
import { Scale } from 'lucide-react';

export const LoadingIndicator: React.FC<{ status?: string | null }> = ({
  status,
}) => {
  return (
    <div className="flex justify-start my-4 animate-fade-in">
      <div className="bg-white border border-neutral-300 rounded-2xl rounded-tl-xs p-4 shadow-2xs flex items-center gap-3">
        <div className="w-6 h-6 rounded-md bg-[#1E3A5F] text-white flex items-center justify-center">
          <Scale className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-1 py-1">
          <div className="w-2 h-2 rounded-full bg-[#1E3A5F] animate-bounce [animation-delay:-0.3s]" />
          <div className="w-2 h-2 rounded-full bg-[#1E3A5F] animate-bounce [animation-delay:-0.15s]" />
          <div className="w-2 h-2 rounded-full bg-[#1E3A5F] animate-bounce" />
        </div>
        <span className="text-xs font-medium text-neutral-500 pl-1">
          {status ?? 'Analyzing CPA 2019 provisions...'}
        </span>
      </div>
    </div>
  );
};