import React, { useState } from 'react';
import { Check, FileCheck, Landmark, AlertCircle } from 'lucide-react';
import { V2KnowledgeCard, ProcedureContent } from '../../../types/knowledgeCard';

interface ChecklistAnswerProps {
  card: V2KnowledgeCard;
  introText?: string;
}

export const ChecklistAnswer: React.FC<ChecklistAnswerProps> = ({ card, introText }) => {
  const content = card.content as ProcedureContent;
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (stepNumber: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) {
        next.delete(stepNumber);
      } else {
        next.add(stepNumber);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {introText && <p className="text-sm sm:text-base text-neutral-800 leading-relaxed">{introText}</p>}

      {/* Steps List */}
      <div className="space-y-3">
        {content.steps?.map((step) => {
          const isChecked = checkedSteps.has(step.step_number);
          return (
            <div
              key={step.step_number}
              onClick={() => toggleStep(step.step_number)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                isChecked
                  ? 'bg-[#E7F5EC] border-[#1B7A4A]/40 text-neutral-900'
                  : 'bg-white border-neutral-300 hover:border-[#1E3A5F]/40 hover:bg-neutral-50'
              }`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={isChecked}
                aria-label={`Step ${step.step_number}: ${step.title}`}
                className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                  isChecked
                    ? 'bg-[#1B7A4A] text-white'
                    : 'border-2 border-neutral-400 bg-white text-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </button>

              <div className="space-y-1">
                <div className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                    Step {step.step_number}
                  </span>
                  <span>{step.title}</span>
                </div>
                <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Details: Required Documents & Responsible Authority */}
      <div className="p-4 bg-neutral-100/80 rounded-xl border border-neutral-300 space-y-3 text-xs sm:text-sm text-neutral-800">
        {content.required_documents && content.required_documents.length > 0 && (
          <div>
            <div className="font-semibold text-[#1E3A5F] flex items-center gap-1.5 mb-1.5">
              <FileCheck className="w-4 h-4" />
              <span>Required Documents Checklist:</span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-1">
              {content.required_documents.map((doc, idx) => (
                <li key={idx} className="flex items-center gap-1.5 text-neutral-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1E3A5F] shrink-0" />
                  <span>{doc}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {content.responsible_authority && (
          <div className="pt-2 border-t border-neutral-200 flex items-start gap-2 text-neutral-700">
            <Landmark className="w-4 h-4 text-[#1E3A5F] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-neutral-900">Responsible Forum / Portal: </span>
              <span>{content.responsible_authority}</span>
            </div>
          </div>
        )}

        {content.fee_structure && (
          <div className="flex items-start gap-2 text-neutral-700 pt-1">
            <AlertCircle className="w-4 h-4 text-[#1E3A5F] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-neutral-900">Official Court Fees: </span>
              <span>{content.fee_structure}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
