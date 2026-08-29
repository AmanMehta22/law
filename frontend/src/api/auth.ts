import { apiClient, ApiEnvelope } from './client';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterResult {
  id: string;
  email: string;
  createdAt: string;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResult> {
  const response = await apiClient.post<ApiEnvelope<AuthResult>>(
    '/auth/login',
    { email, password },
  );
  return response.data.data;
}

export async function register(
  email: string,
  password: string,
): Promise<RegisterResult> {
  const response = await apiClient.post<ApiEnvelope<RegisterResult>>(
    '/auth/register',
    { email, password },
  );
  return response.data.data;
}

/**
 * Verifies the persisted access token is still valid. Throws on an
 * expired/invalid token so the app can drop stale credentials instead of
 * rendering a session that will fail on its first request.
 */
export async function getMe(): Promise<AuthUser> {
  const response = await apiClient.get<ApiEnvelope<AuthUser>>('/auth/me');
  return response.data.data;
}