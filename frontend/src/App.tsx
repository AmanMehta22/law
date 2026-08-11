import React, { useState } from 'react';
import { MemoryRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';
import { ChatProvider } from './store/ChatContext';
import { AuthPage } from './pages/AuthPage';
import { ChatPage } from './pages/ChatPage';
import { UserData } from './types/user';
import { STORAGE_KEYS } from './constants/storageKeys';
import { ErrorBoundary } from './components/ErrorBoundary';

const MainAppRoutes: React.FC = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState<UserData | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.user);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.authenticated) === 'true';
  });

  const handleAuthenticate = (userData: UserData) => {
    setUser(userData);
    setIsAuthenticated(true);
    try {
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(userData));
      localStorage.setItem(STORAGE_KEYS.authenticated, 'true');
    } catch (e) {
      console.error(e);
    }
    navigate('/chat');
  };

  const handleLogout = () => {
    setUser(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem(STORAGE_KEYS.user);
      localStorage.removeItem(STORAGE_KEYS.authenticated);
      localStorage.removeItem(STORAGE_KEYS.token);
      localStorage.removeItem(STORAGE_KEYS.activeConversation);
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
        <MemoryRouter>
          <ErrorBoundary>
            <MainAppRoutes />
          </ErrorBoundary>
        </MemoryRouter>
      </ChatProvider>
    </QueryClientProvider>
  );
}
