import React from 'react';
import { ShieldCheck, Clock } from 'lucide-react';

interface ReviewStatusBadgeProps {
  status: string;
  confidence: number;
  isLowConfidence?: boolean;
}

export const ReviewStatusBadge: React.FC<ReviewStatusBadgeProps> = ({
  status,
  confidence,
  isLowConfidence,
}) => {
  const isVerified = (status === 'reviewed' || status === 'approved') && !isLowConfidence;
  const pct = Math.round(confidence * 100);

  return (
    <div
      className={`group relative inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold tracking-tight border transition-colors ${
        isVerified
          ? 'bg-[#E7F5EC] text-[#1B7A4A] border-[#1B7A4A]/20'
          : 'bg-[#FBF1DE] text-[#A66A00] border-[#A66A00]/20'
      }`}
      aria-label={isVerified ? `Verified Answer (${pct}% grounded)` : `Under Review (${pct}% confidence)`}
    >
      {isVerified ? (
        <>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Verified</span>
        </>
      ) : (
        <>
          <Clock className="w-3.5 h-3.5" />
          <span>Under Review</span>
        </>
      )}

      {/* Hover Tooltip showing exact confidence */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex group-focus:flex flex-col items-center z-30 pointer-events-none animate-fade-in">
        <div className="bg-neutral-900 text-white text-[11px] font-medium py-1 px-2 rounded-md shadow-lg whitespace-nowrap">
          {isVerified ? `Verified statutory grounding: ${pct}%` : `Review status: Draft (${pct}% confidence)`}
        </div>
        <div className="w-2 h-2 bg-neutral-900 rotate-45 -mt-1" />
      </div>
    </div>
  );
};
