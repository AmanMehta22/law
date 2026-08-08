import axios from 'axios';
import { getSessionId } from '../utils/sessionId';
import { STORAGE_KEYS } from '../constants/storageKeys';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export class LegalBotApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, data: any) {
    super(data.message || 'API Request Failed');
    this.status = status;
    this.data = data;
    this.name = 'LegalBotApiError';
  }
}

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Cannot reach the server. Check your internet connection and try again.';
    }
    const status = error.response.status;
    if (status === 401) {
      return 'Your session has expired. Please log in again.';
    }
    if (status === 429) {
      return 'Daily AI quota reached. Please try again later.';
    }
    if (status >= 500) {
      return 'The server ran into an error. Please try again in a moment.';
    }
    const backendError = (error.response.data as { error?: string } | null)
      ?.error;
    if (backendError) {
      return backendError;
    }
    return `Request failed (${status}). Please try again.`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  config.headers['X-Session-Id'] = getSessionId();
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STORAGE_KEYS.token);
      localStorage.removeItem(STORAGE_KEYS.authenticated);
      localStorage.removeItem(STORAGE_KEYS.user);
      localStorage.removeItem(STORAGE_KEYS.activeConversation);
      if (window.location.pathname !== '/auth') {
        window.location.reload();
      }
    }
    return Promise.reject(error);
  },
);
