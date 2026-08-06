import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Mic, MicOff } from 'lucide-react';

interface ComposerProps {
  onSend: (text: string) => void;
  isSending?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({ onSend, isSending }) => {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isSending && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isSending]);

  const toggleListening = () => {
    const windowObj = window as any;
    const SpeechRecognition =
      windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Please type your query.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setText(transcript);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() || isSending) return;
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    onSend(text.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="sticky bottom-0 z-30 bg-neutral-100/90 backdrop-blur-md pt-2 pb-4 px-4 border-t border-neutral-300 shadow-md">
      <div className="max-w-2xl mx-auto space-y-1.5">
        {isListening && (
          <div className="flex items-center justify-between px-3 py-1 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 animate-pulse">
            <span className="font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
              Listening... Speak your complaint clearly.
            </span>
            <button
              onClick={toggleListening}
              className="font-bold underline hover:text-red-900 cursor-pointer text-[11px]"
            >
              Stop
            </button>
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
