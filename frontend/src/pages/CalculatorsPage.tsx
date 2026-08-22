import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Calculator, CalendarClock, Landmark, AlertTriangle, CheckCircle2, ArrowLeft, MessageCircle } from 'lucide-react';
import { SidePanel } from '../components/SidePanel';
import { AppHeader } from '../components/AppHeader';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import {
  calculateLimitation,
  calculateJurisdiction,
  LimitationResult,
  JurisdictionResult,
} from '../api/calculators';
import { getApiErrorMessage } from '../api/client';
import { UserData } from '../types/user';

export const CalculatorsPage: React.FC<{
  user: UserData | null;
  onLogout: () => void;
}> = ({ user, onLogout }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-[#F3F5F7] text-neutral-900">
      <SidePanel user={user} />

      <div className="flex-1 flex flex-col">
        <AppHeader user={user} onLogout={onLogout} />

        <DisclaimerBanner />

        <main className="flex-1 max-w-4xl w-full mx-auto py-6 px-4">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1E3A5F] text-white flex items-center justify-center">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Legal Calculators</h1>
                <p className="text-sm text-neutral-500">
                  Consumer Protection Act, 2019 — compute limitation and jurisdiction before you file.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/chat')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-[#EAF1F8] hover:text-[#1E3A5F] hover:border-[#D6DAE0] transition-colors cursor-pointer shrink-0"
              title="Back to chat"
            >
              <ArrowLeft className="w-4 h-4" />
              <MessageCircle className="w-4 h-4 hidden sm:block" />
              <span className="hidden sm:inline">Back to chat</span>
              <span className="sm:hidden">Exit</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LimitationCalculator />
            <JurisdictionCalculator />
          </div>
        </main>
      </div>
    </div>
  );
};

const LimitationCalculator: React.FC = () => {
  const [date, setDate] = useState('');
  const mutation = useMutation({
    mutationFn: (d: string) => calculateLimitation(d),
  });

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-2xs p-5 flex flex-col">
      <div className="flex items-center gap-2.5 mb-1">
        <CalendarClock className="w-5 h-5 text-[#1E3A5F]" />
        <h2 className="font-semibold">Limitation Period</h2>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        Section 69, CPA 2019 — complaints must be filed within 2 years of the cause of action.
      </p>

      <label className="text-xs font-medium text-neutral-600 mb-1.5">
        Date of cause of action (e.g. date of refusal of refund)
      </label>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:border-[#1E3A5F] transition-colors"
      />

      <button
        onClick={() => date && mutation.mutate(date)}
        disabled={!date || mutation.isPending}
        className="mt-3 w-full py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-medium hover:bg-[#16293F] disabled:opacity-50 transition-colors cursor-pointer"
      >
        {mutation.isPending ? 'Calculating...' : 'Calculate'}
      </button>

      {mutation.isError && (
        <p className="mt-3 text-xs text-red-600">
          {getApiErrorMessage(mutation.error)}
        </p>
      )}

      {mutation.data && <LimitationResultView result={mutation.data} />}
    </section>
  );
};

const LimitationResultView: React.FC<{ result: LimitationResult }> = ({ result }) => {
  return (
    <div className="mt-4 space-y-2 text-sm">
      <div
        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold ${
          result.expired
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}
      >
        {result.expired ? (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        ) : (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        )}
        {result.expired
          ? `Deadline passed ${result.daysRemaining} days ago — late filing needs sufficient cause (proviso to S.69)`
          : `${result.daysRemaining} days remaining`}
      </div>
      <div className="bg-neutral-50 rounded-lg p-3 space-y-1 text-neutral-700">
        <p>
          <span className="text-neutral-500">Cause of action:</span>{' '}
          <span className="font-medium">{result.causeOfActionDate}</span>
        </p>
        <p>
          <span className="text-neutral-500">Deadline:</span>{' '}
          <span className="font-medium">{result.deadline}</span>{' '}
          <span className="text-xs">({result.limitationPeriodYears} years)</span>
        </p>
        <p className="text-xs text-neutral-500 pt-1 border-t border-neutral-200">
          {result.section} — {result.explanation}
        </p>
      </div>
    </div>
  );
};

const JurisdictionCalculator: React.FC = () => {
  const [value, setValue] = useState('');
  const mutation = useMutation({
    mutationFn: (v: number) => calculateJurisdiction(v),
  });

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-2xs p-5 flex flex-col">
      <div className="flex items-center gap-2.5 mb-1">
        <Landmark className="w-5 h-5 text-[#1E3A5F]" />
        <h2 className="font-semibold">Pecuniary Jurisdiction</h2>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        Sections 34 / 47 / 58, CPA 2019 — which Commission hears your claim.
      </p>

      <label className="text-xs font-medium text-neutral-600 mb-1.5">
        Value of the goods or services paid as consideration, in ₹
      </label>
      <input
        type="number"
        min="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. 350000"
        className="w-full px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-sm focus:outline-none focus:border-[#1E3A5F] transition-colors"
      />

      <button
        onClick={() => {
          const parsed = Number(value);
          if (parsed > 0) mutation.mutate(parsed);
        }}
        disabled={!value || Number(value) <= 0 || mutation.isPending}
        className="mt-3 w-full py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-medium hover:bg-[#16293F] disabled:opacity-50 transition-colors cursor-pointer"
      >
        {mutation.isPending ? 'Calculating...' : 'Calculate'}
      </button>

      {mutation.isError && (
        <p className="mt-3 text-xs text-red-600">
          {getApiErrorMessage(mutation.error)}
        </p>
      )}

      {mutation.data && <JurisdictionResultView result={mutation.data} />}
    </section>
  );
};

const JurisdictionResultView: React.FC<{ result: JurisdictionResult }> = ({ result }) => {
  return (
    <div className="mt-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#EAF1F8] text-[#1E3A5F] border border-[#D6DAE0]">
        <Landmark className="w-4 h-4 shrink-0" />
        <span className="font-semibold">{result.forum}</span>
        <span className="text-xs font-normal">({result.valueRange})</span>
      </div>
      <div className="bg-neutral-50 rounded-lg p-3 space-y-1 text-neutral-700">
        <p>
          <span className="text-neutral-500">Claim value:</span>{' '}
          <span className="font-medium">
            {new Intl.NumberFormat('en-IN', {
              style: 'currency',
              currency: 'INR',
              maximumFractionDigits: 0,
            }).format(result.claimValue)}
          </span>
        </p>
        <p className="text-xs text-neutral-500 pt-1 border-t border-neutral-200">
          {result.section} — {result.explanation}
        </p>
      </div>
      {result.prescribedValueNote && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {result.prescribedValueNote}
        </p>
      )}
    </div>
  );
};

export default CalculatorsPage;