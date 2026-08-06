import React, { useEffect } from 'react';
import { useConversation } from '../store/ChatContext';
import { useSendMessage } from '../hooks/useSendMessage';
import { AppHeader } from '../components/AppHeader';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { ConversationView } from '../components/ConversationView';
import { Composer } from '../components/Composer';
import { SidePanel } from '../components/SidePanel';
import { UserData } from '../types/user';

export const ChatPage: React.FC<{ user: UserData | null; onLogout: () => void }> = ({
  user,
  onLogout,
}) => {
  const { state, loadConversations, openConversation } = useConversation();
  const sendMessageMutation = useSendMessage();

  useEffect(() => {
    loadConversations();
    const saved = localStorage.getItem('legalbot_active_conversation');
    if (saved) {
      openConversation(saved).then((ok) => {
        if (!ok) localStorage.removeItem('legalbot_active_conversation');
      });
    }
  }, [loadConversations, openConversation]);

  const handleSendMessage = (text: string) => {
    sendMessageMutation.mutate(
      { text },
      { onSuccess: () => { loadConversations(); } },
    );
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

        <Composer onSend={handleSendMessage} isSending={state.isSending} />
      </div>
    </div>
  );
};

export default ChatPage;
