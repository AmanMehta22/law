import React, { useState } from 'react';
import { AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';

export const DisclaimerBanner: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  return (
    <aside
      aria-label="Legal Disclaimer"
      className="bg-[#EAF1F8] border-b border-[#D6DAE0] text-neutral-800 text-xs px-4 py-2 transition-all duration-200"
    >
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <AlertCircle className="w-4 h-4 text-[#1E3A5F] shrink-0" />
          {isCollapsed ? (
            <p className="truncate text-neutral-700 font-medium">
              Legal Disclaimer: General legal information under Consumer Protection Act, 2019 — not legal advice.
            </p>
          ) : (
            <p className="text-neutral-800 leading-relaxed">
              <strong className="font-semibold text-[#1E3A5F]">Legal Notice:</strong> LegalBot CPA delivers grounded information citing the Consumer Protection Act, 2019. It does not provide formal legal representation or advocate services. Always review drafts before sending.
            </p>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-[#1E3A5F] hover:text-[#16293F] p-1 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] shrink-0 cursor-pointer"
          aria-label={isCollapsed ? 'Expand legal disclaimer' : 'Collapse legal disclaimer'}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
};
