import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';
import { ChatProvider } from './store/ChatContext';
import { AuthPage } from './pages/AuthPage';
import { ChatPage } from './pages/ChatPage';
import { CalculatorsPage } from './pages/CalculatorsPage';
import { UserData } from './types/user';
import { STORAGE_KEYS } from './constants/storageKeys';
import { getMe } from './api/auth';
import { ErrorBoundary } from './components/ErrorBoundary';

const clearPersistedAuth = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.user);
    localStorage.removeItem(STORAGE_KEYS.authenticated);
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.activeConversation);
  } catch {
    // Storage unavailable; nothing to clean.
  }
};

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
    return (
      localStorage.getItem(STORAGE_KEYS.authenticated) === 'true' &&
      Boolean(localStorage.getItem(STORAGE_KEYS.token))
    );
  });

  // A persisted "authenticated" flag is not proof the JWT is still valid.
  // Verify it once on mount so an expired session lands on the login page
  // cleanly instead of failing on its first request and hard-reloading.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    getMe()
      .then((me) => {
        if (cancelled || !user || user.email === me.email) return;
        const refreshed = { ...user, email: me.email };
        setUser(refreshed);
        try {
          localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(refreshed));
        } catch {
          // Non-fatal.
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearPersistedAuth();
        setUser(null);
        setIsAuthenticated(false);
        navigate('/auth', { replace: true });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    clearPersistedAuth();
    navigate('/auth');
  };

  return (
    <Routes>
      {/* The app entry point is always the landing screen with the
          login / create-account options, even when a session exists. */}
      <Route path="/" element={<Navigate to="/auth" replace />} />

      <Route
        path="/auth"
        element={<AuthPage onAuthenticate={handleAuthenticate} />}
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
        path="/calculators"
        element={
          isAuthenticated ? (
            <CalculatorsPage user={user} onLogout={handleLogout} />
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
        {/* Browser history (not in-memory) so a refresh keeps the current
            route instead of dumping the user back to the default page. */}
        <BrowserRouter>
          <ErrorBoundary>
            <MainAppRoutes />
          </ErrorBoundary>
        </BrowserRouter>
      </ChatProvider>
    </QueryClientProvider>
  );
}
