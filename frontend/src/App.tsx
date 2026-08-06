import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';
import { ChatProvider } from './store/ChatContext';
import { AuthPage } from './pages/AuthPage';
import { ChatPage } from './pages/ChatPage';
import { UserData } from './types/user';

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
      localStorage.removeItem('legalbot_token');
      localStorage.removeItem('legalbot_active_conversation');
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
            <ChatPage user={user} onLogout={handleLogout} />
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
