import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ChatProvider, useConversation } from './features/chat/hooks/useConversation';
import { useSendMessage } from './features/chat/hooks/useSendMessage';
import { AppHeader } from './components/AppHeader';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { CitationDrawer } from './components/CitationDrawer';
import { ConversationView } from './features/chat/components/ConversationView';
import { Composer } from './features/chat/components/Composer';
import { AuthPage } from './components/AuthPage';
import { mockStatuteNodes } from './data';
import { V2KnowledgeCard } from './types/knowledgeCard';
import { V1StatuteNode } from './types/statute';

export interface UserData {
  email: string;
  loggedInAt: string;
}

const ChatScreen: React.FC<{ user: UserData | null; onLogout: () => void }> = ({ user, onLogout }) => {
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
    <div className="min-h-screen flex flex-col bg-[#F3F5F7] text-neutral-900 selection:bg-[#EAF1F8] selection:text-[#1E3A5F]">
      <AppHeader user={user} onLogout={onLogout} />
      <DisclaimerBanner />

      <main className="flex-1 flex flex-col max-w-4xl w-full mx-auto pb-6">
        <ConversationView onCitationClick={handleCitationClick} />
      </main>

      <Composer onSend={handleSendMessage} isSending={state.isSending} />

      <CitationDrawer
        card={activeCard}
        node={activeNode}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
};

const MainAppRoutes: React.FC = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState<UserData | null>(() => {
    try {
      const saved = localStorage.getItem('legalbot_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('legalbot_authenticated') === 'true';
  });

  const handleAuthenticate = (userData: UserData) => {
    setUser(userData);
    setIsAuthenticated(true);
    try {
      localStorage.setItem('legalbot_user', JSON.stringify(userData));
      localStorage.setItem('legalbot_authenticated', 'true');
    } catch (e) {
      console.error(e);
    }
    navigate('/chat');
  };

  const handleLogout = () => {
    setUser(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('legalbot_user');
      localStorage.removeItem('legalbot_authenticated');
    } catch (e) {
      console.error(e);
    }
    navigate('/auth');
  };

  return (
    <Routes>
      <Route
        path="/auth"
        element={
          isAuthenticated ? (
            <Navigate to="/chat" replace />
          ) : (
            <AuthPage onAuthenticate={handleAuthenticate} />
          )
        }
      />
      <Route
        path="/chat"
        element={
          isAuthenticated ? (
            <ChatScreen user={user} onLogout={handleLogout} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? '/chat' : '/auth'} replace />}
      />
    </Routes>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ChatProvider>
        <BrowserRouter>
          <MainAppRoutes />
        </BrowserRouter>
      </ChatProvider>
    </QueryClientProvider>
  );
}
