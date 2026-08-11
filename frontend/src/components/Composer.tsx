import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Mic, MicOff } from 'lucide-react';

interface ComposerProps {
  onSend: (text: string) => void;
  isSending?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({ onSend, isSending }) => {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speechLanguage, setSpeechLanguage] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef('');

  useEffect(() => {
    if (!isSending && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isSending]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startListening = async () => {
    setError(null);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(
        'Voice input is not supported in this browser. Please use Chrome or Edge.',
      );
      return;
    }

    baseTextRef.current = textareaRef.current?.value || text;

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = speechLanguage;

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = 0; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const combinedFinal =
          baseTextRef.current +
          (baseTextRef.current && finalTranscript ? ' ' : '') +
          finalTranscript;
        const currentText =
          combinedFinal +
          (interimTranscript
            ? (combinedFinal ? ' ' : '') + interimTranscript
            : '');

        setText(currentText);
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setError(
            'Microphone access is blocked. Allow it in your browser settings, then try again.',
          );
        } else {
          setError(`Voice input failed: ${event.error}. Try again.`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setError('Could not start voice input. Please try again.');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      return;
    }
    startListening();
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const value = textareaRef.current?.value || text;
    if (!value.trim() || isSending) return;
    if (isListening) {
      setIsListening(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      return;
    }
    onSend(value.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isSpeechRecognitionSupported =
    typeof window !== 'undefined' &&
    (typeof (window as any).SpeechRecognition !== 'undefined' ||
      typeof (window as any).webkitSpeechRecognition !== 'undefined');

  return (
    <div className="sticky bottom-0 z-30 bg-neutral-100/90 backdrop-blur-md pt-2 pb-4 px-4 border-t border-neutral-300 shadow-md">
      <div className="max-w-2xl mx-auto space-y-1.5">
        {isListening && (
          <div className="flex items-center justify-between px-3 py-1 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 animate-pulse">
            <span className="font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
              Listening ({speechLanguage === 'en-IN' ? 'English' : 'Hindi'})... text appears as you speak.
            </span>
            <button
              onClick={toggleListening}
              className="font-bold underline hover:text-red-900 cursor-pointer text-[11px]"
            >
              Stop
            </button>
          </div>
        )}

        {error && !isListening && (
          <div className="flex items-center justify-between px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            <span>
              <span className="font-semibold">Voice input unavailable:</span>{' '}
              {error}
            </span>
            <button
              onClick={() => setError(null)}
              className="font-bold underline hover:text-amber-700 cursor-pointer text-[11px] shrink-0 ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {isSpeechRecognitionSupported && (
          <div className="flex items-center justify-between text-xs text-neutral-600 px-1 select-none">
            <span className="text-[11px] text-neutral-500 font-medium">Speech language:</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setSpeechLanguage('en-IN')}
                disabled={isListening}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all duration-150 cursor-pointer ${
                  speechLanguage === 'en-IN'
                    ? 'bg-[#1E3A5F] text-white shadow-xs'
                    : 'bg-neutral-200/80 text-neutral-700 hover:bg-neutral-300/80'
                } disabled:opacity-50`}
              >
                English (IN)
              </button>
              <button
                type="button"
                onClick={() => setSpeechLanguage('hi-IN')}
                disabled={isListening}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all duration-150 cursor-pointer ${
                  speechLanguage === 'hi-IN'
                    ? 'bg-[#1E3A5F] text-white shadow-xs'
                    : 'bg-neutral-200/80 text-neutral-700 hover:bg-neutral-300/80'
                } disabled:opacity-50`}
              >
                हिंदी (HI)
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative flex items-center">
          <label htmlFor="chat-composer-input" className="sr-only">
            Describe your consumer problem
          </label>
          <textarea
            id="chat-composer-input"
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            rows={1}
            placeholder={
              isListening
                ? 'Listening to your voice...'
                : "Describe your dispute (e.g. 'Laptop arrived damaged, seller won't refund')..."
            }
            className="w-full pl-4 pr-22 py-3 bg-white text-neutral-950 placeholder-neutral-500 rounded-xl border border-neutral-300 focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/20 text-sm sm:text-base leading-relaxed transition-all shadow-xs resize-none disabled:opacity-60"
          />

          <div className="absolute right-2 flex items-center gap-1">
            {/* Mic Button */}
            <button
              type="button"
              onClick={toggleListening}
              disabled={isSending}
              className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] cursor-pointer ${
                isListening
                  ? 'bg-red-600 text-white animate-bounce'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
              title={isListening ? 'Stop listening' : 'Speak your complaint'}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {/* Send Button */}
            <button
              type="submit"
              disabled={!text.trim() || isSending}
              className="p-2 rounded-lg bg-[#1E3A5F] text-white hover:bg-[#16293F] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] disabled:opacity-40 disabled:hover:bg-[#1E3A5F] cursor-pointer"
              aria-label="Send message"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </form>

        <p className="text-[11px] text-neutral-500 text-center mt-1">
          Press <kbd className="font-mono px-1 py-0.5 bg-neutral-200 rounded text-[10px]">Enter</kbd> to send, <kbd className="font-mono px-1 py-0.5 bg-neutral-200 rounded text-[10px]">Shift+Enter</kbd> for newline
        </p>
      </div>
    </div>
  );
};