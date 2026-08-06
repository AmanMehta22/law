import axios from 'axios';
import { getSessionId } from '../utils/sessionId';

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

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  config.headers['X-Session-Id'] = getSessionId();
  const token = localStorage.getItem('legalbot_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('legalbot_token');
      localStorage.removeItem('legalbot_authenticated');
      localStorage.removeItem('legalbot_user');
      localStorage.removeItem('legalbot_active_conversation');
      if (window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(error);
  },
);
