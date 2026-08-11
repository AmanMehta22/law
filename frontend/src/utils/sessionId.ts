/**
 * Generates and persists an anonymous session ID in sessionStorage.
 * Survives tab reloads within the same session, resets when tab closes.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server-session';

  const KEY = 'legalbot_cpa_session_id';
  let sessionId = sessionStorage.getItem(KEY);

  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    sessionStorage.setItem(KEY, sessionId);
  }

  return sessionId;
}
