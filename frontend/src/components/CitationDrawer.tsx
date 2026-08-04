import React, { useEffect, useState } from 'react';
import { X, BookOpen, ShieldCheck, FileText, ExternalLink, Copy, Check } from 'lucide-react';
import { V2KnowledgeCard } from '../types/knowledgeCard';
import { V1StatuteNode } from '../types/statute';

interface CitationDrawerProps {
  card: V2KnowledgeCard | null;
  node: V1StatuteNode | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CitationDrawer: React.FC<CitationDrawerProps> = ({
  card,
  node,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || (!card && !node)) return null;

  const officialText =
    node?.official_text ||
    'Section 2(7): "consumer" means any person who buys any goods for a consideration which has been paid or promised or partly paid and partly promised...';

  const handleCopyStatute = () => {
    navigator.clipboard.writeText(officialText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container (Side drawer on desktop lg, Bottom sheet on mobile/tablet) */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 lg:pl-0">
        <div className="w-screen max-w-xl bg-white shadow-2xl border-l border-neutral-300 flex flex-col h-full animate-slide-left relative z-10">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#EAF1F8] text-[#1E3A5F] flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#1E3A5F]">
                  Verified Statutory Citation
                </span>
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 line-clamp-1">
                  {card?.title || node?.citations[0]?.title || 'Statute Reference'}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-neutral-500 hover:text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] cursor-pointer"
              aria-label="Close citation details"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body - Scrollable */}
          <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1">
            {/* Plain language summary callout */}
            {card && (
              <div className="p-4 bg-[#EAF1F8] rounded-xl border border-[#D6DAE0] space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#1E3A5F]">
                  <ShieldCheck className="w-4 h-4 text-[#1B7A4A]" />
                  <span>Plain Language Summary</span>
                </div>
                <p className="text-sm text-neutral-800 leading-relaxed">
                  {card.content.summary}
                </p>

                {card.content.key_points && card.content.key_points.length > 0 && (
                  <div className="pt-2 border-t border-neutral-300/60">
                    <div className="text-xs font-semibold text-neutral-700 mb-1.5">Key Highlights:</div>
                    <ul className="space-y-1 text-xs text-neutral-700 list-disc list-inside">
                      {card.content.key_points.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Verbatim Statute Text */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold tracking-wider text-neutral-500 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Verbatim Statute Text (Official Gazette)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyStatute}
                    className="p-1 px-2 text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded flex items-center gap-1 transition-colors cursor-pointer"
                    title="Copy official text"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-neutral-500" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  {node && (
                    <span className="text-xs font-mono bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded border border-neutral-200">
                      {node.id}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-300 shadow-2xs font-serif text-neutral-900 text-sm sm:text-base leading-relaxed space-y-2">
                <p>{officialText}</p>
              </div>

              <div className="text-xs text-neutral-500 space-y-1 pt-1">
                <div>
                  <strong>Act:</strong> The Consumer Protection Act, 2019 (Act No. 35 of 2019)
                </div>
                {node && (
                  <div>
                    <strong>Chapter:</strong> Chapter {node.chapter_number} · <strong>Section:</strong> Section {node.section_number}
                  </div>
                )}
                {card?.metadata.last_verified_by && (
                  <div className="text-[11px] text-[#1B7A4A] font-medium pt-1">
                    ✓ Verified by {card.metadata.last_verified_by}
                  </div>
                )}
              </div>
            </div>

            {/* Document link if available */}
            {node?.document?.url && (
              <div className="pt-2">
                <a
                  href={node.document.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] hover:underline"
                >
                  View Official Gazette Source Document
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-neutral-200 bg-neutral-50 text-right">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#1E3A5F] text-white rounded-lg text-xs font-semibold hover:bg-[#16293F] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] cursor-pointer"
            >
              Close Reference
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
