import React, { useState } from 'react';
import { useConversation } from '../store/ChatContext';
import { useSendMessage } from '../hooks/useSendMessage';
import { AppHeader } from '../components/AppHeader';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { CitationDrawer } from '../components/CitationDrawer';
import { ConversationView } from '../components/ConversationView';
import { Composer } from '../components/Composer';
import { SidePanel } from '../components/SidePanel';
import { mockStatuteNodes } from '../data';
import { V2KnowledgeCard } from '../types/knowledgeCard';
import { V1StatuteNode } from '../types/statute';
import { UserData } from '../types/user';

export const ChatPage: React.FC<{ user: UserData | null; onLogout: () => void }> = ({
  user,
  onLogout,
}) => {
  const { state } = useConversation();
  const sendMessageMutation = useSendMessage();

  const [activeCard, setActiveCard] = useState<V2KnowledgeCard | null>(null);
  const [activeNode, setActiveNode] = useState<V1StatuteNode | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleCitationClick = (card: V2KnowledgeCard) => {
    setActiveCard(card);
    const matchedNodeId = card.derived_from[0];
    const node = mockStatuteNodes.find((n) => n.id === matchedNodeId) || null;
    setActiveNode(node);
    setIsDrawerOpen(true);
  };

  const handleSendMessage = (text: string) => {
    sendMessageMutation.mutate({ text });
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
          <ConversationView onCitationClick={handleCitationClick} />
        </main>

        <Composer onSend={handleSendMessage} isSending={state.isSending} />
      </div>

      <CitationDrawer
        card={activeCard}
        node={activeNode}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
};

export default ChatPage;