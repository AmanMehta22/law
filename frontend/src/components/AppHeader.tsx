import React, { useState, useEffect } from 'react';
import { Scale, RotateCcw, Type, ZoomIn, ZoomOut, User, LogOut, LogIn } from 'lucide-react';
import { useConversation } from '../features/chat/hooks/useConversation';

interface AppHeaderProps {
  user?: { email: string; loggedInAt?: string } | null;
  onLogout: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ user, onLogout }) => {
  const { resetConversation } = useConversation();
  // 0: 100%, 1: 115%, 2: 125%
  const [fontSizeLevel, setFontSizeLevel] = useState<number>(0);

  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', fontSizeLevel.toString());
  }, [fontSizeLevel]);

  const decreaseFontSize = () => {
    setFontSizeLevel((prev) => Math.max(0, prev - 1));
  };

  const increaseFontSize = () => {
    setFontSizeLevel((prev) => Math.min(2, prev + 1));
  };

  const getFontSizeLabel = () => {
    if (fontSizeLevel === 0) return '100%';
    if (fontSizeLevel === 1) return '115%';
    return '125%';
  };

  return (
    <header className="bg-white border-b border-neutral-300 sticky top-0 z-40 shadow-2xs">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1E3A5F] flex items-center justify-center text-white shadow-xs">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-neutral-950 tracking-tight">LegalBot</span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded bg-[#EAF1F8] text-[#1E3A5F]">
                CPA 2019
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 hidden sm:block">Consumer Protection Assistant</p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Improved Font Size Controller */}
          <div className="flex items-center bg-neutral-100 border border-neutral-200 rounded-lg p-0.5 shadow-2xs">
            <button
              onClick={decreaseFontSize}
              disabled={fontSizeLevel === 0}
              className="p-1 px-1.5 text-xs font-bold text-neutral-700 hover:bg-white hover:text-neutral-950 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-0.5"
              title="Decrease text size"
              aria-label="Decrease text size"
            >
              <ZoomOut className="w-3 h-3" />
              <span className="text-[11px]">A-</span>
            </button>
            <div className="px-1.5 text-[11px] font-bold text-[#1E3A5F] flex items-center gap-1 border-x border-neutral-200 select-none">
              <Type className="w-3 h-3 hidden sm:inline text-[#1E3A5F]" />
              <span>{getFontSizeLabel()}</span>
            </div>
            <button
              onClick={increaseFontSize}
              disabled={fontSizeLevel === 2}
              className="p-1 px-1.5 text-xs font-bold text-neutral-700 hover:bg-white hover:text-neutral-950 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-0.5"
              title="Increase text size"
              aria-label="Increase text size"
            >
              <span className="text-[11px]">A+</span>
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          <button
            onClick={resetConversation}
            className="p-1.5 text-neutral-600 hover:text-[#1E3A5F] hover:bg-neutral-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] cursor-pointer"
            title="Start new conversation"
            aria-label="Start new conversation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* User Account / Auth Logout Button */}
          {user ? (
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-neutral-200">
              <div
                className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neutral-100 border border-neutral-200 text-xs text-neutral-700 font-medium max-w-[140px] truncate"
                title={user.email}
              >
                <User className="w-3.5 h-3.5 text-[#1E3A5F] shrink-0" />
                <span className="truncate">{user.email.split('@')[0]}</span>
              </div>

              <button
                onClick={onLogout}
                className="flex items-center gap-1 p-1.5 text-xs font-semibold text-neutral-700 hover:text-red-700 hover:bg-red-50 border border-neutral-200 hover:border-red-200 rounded-lg transition-colors cursor-pointer"
                title="Log out and return to landing page"
                aria-label="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-[#1E3A5F] text-white hover:bg-[#142843] rounded-lg transition-colors shadow-2xs cursor-pointer ml-1"
              title="Sign in or create account"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Log In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
