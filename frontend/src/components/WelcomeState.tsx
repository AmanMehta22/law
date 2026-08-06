import React from 'react';
import { Scale, ArrowRight } from 'lucide-react';

interface WelcomeStateProps {
  onSelectPrompt: (prompt: string) => void;
}

const WELCOME_PROMPTS = [
  'I bought a product that is defective or damaged',
  'A service provider cheated me or gave poor service',
  'I was charged more than the displayed price',
  'How do I file a complaint under the Consumer Protection Act?',
];

export const WelcomeState: React.FC<WelcomeStateProps> = ({ onSelectPrompt }) => {
  const prompts = WELCOME_PROMPTS;

  return (
    <div className="py-8 sm:py-12 px-4 max-w-2xl mx-auto text-center space-y-8 animate-fade-in">
      {/* Icon Badge */}
      <div className="w-16 h-16 rounded-2xl bg-[#EAF1F8] border border-[#D6DAE0] text-[#1E3A5F] flex items-center justify-center mx-auto shadow-sm">
        <Scale className="w-8 h-8" />
      </div>

      {/* Main Headline */}
      <div className="space-y-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-950 tracking-tight">
          What happened with your purchase or service?
        </h1>
        <p className="text-sm sm:text-base text-neutral-600 max-w-lg mx-auto leading-relaxed">
          Describe your problem in plain language. Get grounded, cited explanations under the{' '}
          <strong className="text-neutral-900 font-semibold">Consumer Protection Act, 2019</strong>.
        </p>
      </div>

      {/* Example Prompt Pills */}
      <div className="space-y-3 pt-2">
        <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Tap a common situation to begin:
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl mx-auto text-left">
          {prompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => onSelectPrompt(prompt)}
              className="p-3.5 rounded-xl bg-white border border-neutral-300 hover:border-[#1E3A5F] hover:bg-[#EAF1F8]/50 text-neutral-800 text-xs sm:text-sm font-medium transition-all flex items-center justify-between group shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
            >
              <span>{prompt}</span>
              <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-[#1E3A5F] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
