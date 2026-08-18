import React, { useEffect, useState } from 'react';
import { useConversation } from '../store/ChatContext';
import { useSendMessage } from '../hooks/useSendMessage';
import { AppHeader } from '../components/AppHeader';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { ConversationView } from '../components/ConversationView';
import { Composer } from '../components/Composer';
import { SidePanel } from '../components/SidePanel';
import { IntakeWizard } from '../components/IntakeWizard';
import { UserData } from '../types/user';
import { STORAGE_KEYS } from '../constants/storageKeys';

export const ChatPage: React.FC<{ user: UserData | null; onLogout: () => void }> = ({
  user,
  onLogout,
}) => {
  const { state, loadConversations, openConversation } = useConversation();
  const sendMessageMutation = useSendMessage();
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);

  useEffect(() => {
    loadConversations();
    const saved = localStorage.getItem(STORAGE_KEYS.activeConversation);
    if (saved) {
      openConversation(saved).then((ok) => {
        if (!ok) localStorage.removeItem(STORAGE_KEYS.activeConversation);
      });
    }
  }, [loadConversations, openConversation]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') {
        loadConversations();
      }
    };

    document.addEventListener('visibilitychange', refreshOnFocus);

    return () => document.removeEventListener('visibilitychange', refreshOnFocus);
  }, [loadConversations]);

  const handleSendMessage = (text: string) => {
    if (state.isSending || state.isLoadingConversation) return;
    sendMessageMutation.mutate(
      { text },
      { onSuccess: () => { loadConversations(); } },
    );
  };

  const handleIntakeComplete = (composedMessage: string) => {
    setIsIntakeOpen(false);
    handleSendMessage(composedMessage);
  };

  return (
    <div className="min-h-screen flex bg-[#F3F5F7] text-neutral-900">
      {/* Left sidebar */}
      <SidePanel user={user} />

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <AppHeader user={user} onLogout={onLogout} />

        <DisclaimerBanner />

        <main className="flex-1 flex flex-col max-w-4xl w-full mx-auto pb-6">
          <ConversationView />
        </main>

        <div className="max-w-4xl w-full mx-auto px-4 pb-2">
          <button
            onClick={() => setIsIntakeOpen(true)}
            className="text-xs text-[#1E3A5F] hover:underline cursor-pointer"
          >
            Not sure what to say? Start a guided intake →
          </button>
        </div>

        <Composer
          onSend={handleSendMessage}
          isSending={state.isSending || state.isLoadingConversation}
        />

        <IntakeWizard
          isOpen={isIntakeOpen}
          onClose={() => setIsIntakeOpen(false)}
          onComplete={handleIntakeComplete}
        />
      </div>
    </div>
  );
};

export default ChatPage;
