import React, { useEffect, useState } from 'react';
import { Scale, X } from 'lucide-react';

export const LoadingIndicator: React.FC<{
  status?: string | null;
  elapsedSec?: number;
  onCancel?: () => void;
}> = ({ status, elapsedSec, onCancel }) => {
  const [tick, setTick] = useState(0);
  // Re-render every second to update elapsed display even if parent doesn't
  useEffect(() => {
    if (elapsedSec === undefined) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [elapsedSec]);

  // Use derived elapsed to avoid stale prop: elapsedSec is start-based, tick forces refresh
  void tick;

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
        <div className="flex flex-col">
          <span className="text-xs font-medium text-neutral-500 pl-1">
            {status ?? 'Analyzing CPA 2019 provisions...'}
          </span>
          {elapsedSec !== undefined && elapsedSec > 8 && (
            <span className="text-[11px] text-neutral-400 pl-1">
              {elapsedSec}s elapsed — {elapsedSec > 30 ? 'still working, you can cancel and retry' : 'this can take up to 30s for detailed answers'}
            </span>
          )}
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="ml-2 p-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
            title="Stop generating"
            aria-label="Stop generating"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};