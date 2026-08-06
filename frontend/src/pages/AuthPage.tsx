import React, { useState } from 'react';
import { login, register } from '../api/auth';
import {
  Scale,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
  KeyRound,
  FileText,
  Clock,
  ShieldAlert,
} from 'lucide-react';

interface AuthPageProps {
  onAuthenticate: (userData: { email: string; loggedInAt: string }) => void;
}

type AuthView = 'home' | 'login' | 'signup';

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthenticate }) => {
  const [view, setView] = useState<AuthView>('home');

  // Form State - email, password, confirm password
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password Security Criteria
  const checkLength = password.length >= 8;
  const checkUpper = /[A-Z]/.test(password);
  const checkLower = /[a-z]/.test(password);
  const checkNumber = /[0-9]/.test(password);
  const checkSpecial = /[^A-Za-z0-9]/.test(password);

  const satisfiedCount = [checkLength, checkUpper, checkLower, checkNumber, checkSpecial].filter(
    Boolean
  ).length;

  const getStrengthLabel = () => {
    if (!password) return { label: 'Enter password', color: 'bg-neutral-200', text: 'text-neutral-500' };
    if (satisfiedCount <= 2) return { label: 'Weak', color: 'bg-red-500', text: 'text-red-600' };
    if (satisfiedCount === 3) return { label: 'Fair', color: 'bg-amber-500', text: 'text-amber-600' };
    if (satisfiedCount === 4) return { label: 'Good', color: 'bg-blue-500', text: 'text-blue-600' };
    return { label: 'Strong & Secure', color: 'bg-emerald-500', text: 'text-emerald-600' };
  };

  const handleSwitchView = (newView: AuthView) => {
    setView(newView);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async(e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    if (view === 'signup') {
      if (!confirmPassword) {
        setError('Please confirm your password.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please ensure both passwords are identical.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long for security.');
        return;
      }
      if (satisfiedCount < 3) {
        setError('Please create a stronger password with a mix of letters, numbers, or symbols.');
        return;
      }
    }

    setIsSubmitting(true);
    
    try{
      if(view==="login"){
        const data=await login(email,password);
        console.log("login successful : ",data);
        localStorage.setItem("legalbot_token", data.accessToken);
        onAuthenticate({
            email: email.trim(),
            loggedInAt: new Date().toISOString(),
        });
      }

      else if(view==="signup"){
        await register(email,password);
        const data=await login(email,password);
        localStorage.setItem("legalbot_token", data.accessToken);
        console.log("Sign up successful : ",data);
        onAuthenticate({
          email:email.trim(),
          loggedInAt: new Date().toISOString(),
        })
      }
    }
    catch(error){
      console.log("Authentication failed:", error);
      setError("Invalid email or password.");
    }
    finally{
      setIsSubmitting(false)
    }

  };

  const strength = getStrengthLabel();

  return (
    <div className="min-h-screen bg-[#F3F5F7] flex flex-col justify-between selection:bg-[#EAF1F8] selection:text-[#1E3A5F]">
      {/* Top Header Navigation */}
      <header className="bg-white border-b border-neutral-200 py-3.5 px-4 sm:px-8 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setView('home')}>
          <div className="w-9 h-9 rounded-lg bg-[#1E3A5F] flex items-center justify-center text-white shadow-xs">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-neutral-950 tracking-tight">LegalBot</span>
              <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded bg-[#EAF1F8] text-[#1E3A5F]">
                CPA 2019
              </span>
            </div>
            <p className="text-xs text-neutral-500 hidden sm:block">Consumer Protection Assistant</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {view === 'home' ? (
            <>
              <button
                onClick={() => handleSwitchView('login')}
                className="px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:text-[#1E3A5F] hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              >
                Log In
              </button>
              <button
                onClick={() => handleSwitchView('signup')}
                className="px-4 py-1.5 text-xs font-semibold bg-[#1E3A5F] text-white hover:bg-[#142843] rounded-lg transition-colors shadow-2xs cursor-pointer"
              >
                Sign Up
              </button>
            </>
          ) : (
            <button
              onClick={() => handleSwitchView('home')}
              className="px-3.5 py-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
            >
              Back to Home
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col items-center justify-center">
        {view === 'home' && (
          <div className="w-full max-w-3xl space-y-8 animate-fade-in text-center sm:text-left">
            {/* Hero Card */}
            <div className="bg-white rounded-2xl border border-neutral-300 p-6 sm:p-10 shadow-sm relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#EAF1F8] rounded-full blur-2xl opacity-60 pointer-events-none" />

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EAF1F8] border border-[#D6DAE0] text-[#1E3A5F] text-xs font-semibold mb-5">
                <Sparkles className="w-3.5 h-3.5 text-[#1E3A5F]" />
                <span>AI-Powered Legal Guidance under Consumer Protection Act 2019</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-bold text-neutral-950 tracking-tight leading-tight mb-4">
                Know Your Consumer Rights & Draft Legal Notices Instantly
              </h1>

              <p className="text-neutral-600 text-sm sm:text-base leading-relaxed max-w-2xl mb-8">
                Get clear, cited answers from Indian consumer protection laws, step-by-step complaint checklists, and ready-to-print legal notices for defective products or deficient services.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
                <button
                  onClick={() => handleSwitchView('signup')}
                  className="px-6 py-3 bg-[#1E3A5F] hover:bg-[#142843] text-white font-semibold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <span>Create Free Account</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>

                <button
                  onClick={() => handleSwitchView('login')}
                  className="px-6 py-3 bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <KeyRound className="w-4 h-4 text-[#1E3A5F]" />
                  <span>Log In to Account</span>
                </button>
              </div>
            </div>

            {/* Value Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-2xs flex flex-col justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#EAF1F8] text-[#1E3A5F] flex items-center justify-center mb-3">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 text-sm mb-1">CPA 2019 Citations</h3>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Verified legal citations with exact section numbers and statute references.
                  </p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-2xs flex flex-col justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#EAF1F8] text-[#1E3A5F] flex items-center justify-center mb-3">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 text-sm mb-1">Legal Notice Generator</h3>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Draft legal notices tailored to seller defects with copy and download tools.
                  </p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-2xs flex flex-col justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#EAF1F8] text-[#1E3A5F] flex items-center justify-center mb-3">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 text-sm mb-1">Filing Checklists</h3>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Interactive step-by-step guides for filing complaints at District or State Commissions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {(view === 'login' || view === 'signup') && (
          <div className="w-full max-w-md animate-fade-in">
            <div className="bg-white rounded-2xl border border-neutral-300 p-6 sm:p-8 shadow-sm">
              {/* Form Navigation Tabs */}
              <div className="flex border-b border-neutral-200 mb-6">
                <button
                  type="button"
                  onClick={() => handleSwitchView('login')}
                  className={`flex-1 pb-3 text-sm font-semibold text-center border-b-2 transition-colors cursor-pointer ${
                    view === 'login'
                      ? 'border-[#1E3A5F] text-[#1E3A5F]'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchView('signup')}
                  className={`flex-1 pb-3 text-sm font-semibold text-center border-b-2 transition-colors cursor-pointer ${
                    view === 'signup'
                      ? 'border-[#1E3A5F] text-[#1E3A5F]'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <div className="mb-6">
                <h2 className="text-xl font-bold text-neutral-950 mb-1">
                  {view === 'login' ? 'Welcome Back' : 'Create an Account'}
                </h2>
                <p className="text-xs text-neutral-500">
                  {view === 'login'
                    ? 'Enter your credentials to access your saved legal consultations.'
                    : 'Sign up with your email and a strong password to start.'}
                </p>
              </div>

              {error && (
                <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Input */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      required
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full pl-9 pr-10 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-neutral-800 cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Input (for Sign Up) */}
                {view === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className={`w-full pl-9 pr-10 py-2.5 bg-white border ${
                          confirmPassword && password !== confirmPassword
                            ? 'border-red-400 focus:ring-red-500'
                            : 'border-neutral-300 focus:ring-[#1E3A5F]'
                        } rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-neutral-800 cursor-pointer"
                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-[11px] font-medium text-red-600 mt-1">
                        Passwords do not match
                      </p>
                    )}
                  </div>
                )}

                {/* Password Security Meter (for Sign Up) */}
                {view === 'signup' && (
                  <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-neutral-600 flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-[#1E3A5F]" />
                        Password Security:
                      </span>
                      <span className={`text-[11px] font-bold ${strength.text}`}>
                        {strength.label}
                      </span>
                    </div>

                    {/* Strength Progress Bar */}
                    <div className="grid grid-cols-4 gap-1 h-1.5 w-full">
                      <div className={`rounded-full transition-colors ${satisfiedCount >= 1 ? strength.color : 'bg-neutral-200'}`} />
                      <div className={`rounded-full transition-colors ${satisfiedCount >= 3 ? strength.color : 'bg-neutral-200'}`} />
                      <div className={`rounded-full transition-colors ${satisfiedCount >= 4 ? strength.color : 'bg-neutral-200'}`} />
                      <div className={`rounded-full transition-colors ${satisfiedCount >= 5 ? strength.color : 'bg-neutral-200'}`} />
                    </div>

                    {/* Requirements checklist */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 text-[11px] text-neutral-600">
                      <div className="flex items-center gap-1.5">
                        {checkLength ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                        )}
                        <span className={checkLength ? 'text-neutral-900 font-medium' : ''}>8+ Characters</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {checkUpper ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                        )}
                        <span className={checkUpper ? 'text-neutral-900 font-medium' : ''}>Uppercase (A-Z)</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {checkNumber ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                        )}
                        <span className={checkNumber ? 'text-neutral-900 font-medium' : ''}>Number (0-9)</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {checkSpecial ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                        )}
                        <span className={checkSpecial ? 'text-neutral-900 font-medium' : ''}>Special symbol</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-[#1E3A5F] hover:bg-[#142843] text-white font-semibold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {isSubmitting ? (
                    <span>Authenticating...</span>
                  ) : (
                    <>
                      <span>{view === 'login' ? 'Log In to Chatbot' : 'Create Account & Enter'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-neutral-200 bg-white text-center text-xs text-neutral-500">
        <p>© 2026 LegalBot CPA 2019 Assistant. For informational consumer legal guidance.</p>
      </footer>
    </div>
  );
};
