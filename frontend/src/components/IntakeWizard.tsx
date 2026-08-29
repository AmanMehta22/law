import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronLeft, ChevronRight, Sparkles, RefreshCw } from 'lucide-react';
import { getIntakeRequirements, IntakeField } from '../api/intake';
import { getApiErrorMessage } from '../api/client';
import { cn } from '../utils/cn';

interface IntakeWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (composedMessage: string) => void;
}

export const IntakeWizard: React.FC<IntakeWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const { data: fields, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['intake-requirements'],
    queryFn: getIntakeRequirements,
    enabled: isOpen,
  });

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentValue, setCurrentValue] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  const reset = () => {
    setStep(0);
    setAnswers({});
    setCurrentValue('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Move focus into the dialog on open and restore it to the trigger on
  // close, so keyboard users do not get stranded.
  useEffect(() => {
    if (!isOpen) return;

    const previousActive = document.activeElement as HTMLElement | null;

    requestAnimationFrame(() => dialogRef.current?.focus());

    return () => previousActive?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTrapKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, input, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const field = fields?.[step];

  const isLast = fields ? step === fields.length - 1 : false;

  const canAdvance = field
    ? !field.required || currentValue.trim().length > 0
    : false;

  const handleNext = () => {
    if (!field) return;

    const updated = { ...answers, [field.id]: currentValue.trim() };
    setAnswers(updated);
    setCurrentValue('');

    if (isLast) {
      const composed = fields
        .map((f) => `${f.label}: ${updated[f.id] || '(not provided)'}`)
        .join('; ');

      reset();
      onComplete(
        `Here are the details of my consumer complaint: ${composed}. Please help me.`,
      );
      return;
    }

    setStep(step + 1);
  };

  const handleBack = () => {
    if (step === 0) return;

    setStep(step - 1);
    const prevId = fields?.[step - 1]?.id;
    setCurrentValue(prevId ? answers[prevId] ?? '' : '');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canAdvance) handleNext();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intake-wizard-title"
        tabIndex={-1}
        onKeyDown={handleTrapKeyDown}
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[80vh] focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-neutral-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1E3A5F] text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="intake-wizard-title" className="font-semibold text-sm">Guided intake</h2>
              <p className="text-xs text-neutral-500">
                Answer a few questions — the bot will use your details to help you.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <p className="text-sm text-neutral-500">Loading questions...</p>
          )}

          {isError && (
            <div className="text-sm text-red-600 space-y-2">
              <p>{getApiErrorMessage(error)}</p>
              <button
                onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1E3A5F] text-white rounded-lg text-xs font-semibold hover:bg-[#16293F] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </button>
            </div>
          )}

          {field && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Question {step + 1} of {fields?.length}
                </span>
                {field.required && (
                  <span className="text-[11px] font-semibold text-[#A66A00] bg-[#FBF1DE] border border-[#E3C88F] px-1.5 py-0.5 rounded-full">
                    Required
                  </span>
                )}
              </div>

              <div className="h-1 bg-neutral-100 rounded-full mb-4 overflow-hidden">
                <div
                  className="h-full bg-[#1E3A5F] transition-all duration-300"
                  style={{
                    width: `${((step + 1) / (fields?.length ?? 1)) * 100}%`,
                  }}
                />
              </div>

              <h3 className="font-semibold mb-1">{field.question}</h3>
              {field.description && (
                <p className="text-xs text-neutral-500 mb-3">
                  {field.description}
                </p>
              )}

              {field.id === 'purchaseDate' ? (
                <input
                  type="date"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:border-[#1E3A5F] transition-colors"
                />
              ) : (
                <textarea
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={3}
                  placeholder={`Your ${field.label.toLowerCase()}...`}
                  className="w-full px-3 py-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:border-[#1E3A5F] transition-colors resize-none"
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className={cn(
              'flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-neutral-600 transition-colors cursor-pointer',
              step === 0
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-neutral-100',
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <button
            onClick={handleNext}
            disabled={!canAdvance}
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-medium hover:bg-[#16293F] disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isLast ? 'Start chat' : 'Next'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default IntakeWizard;