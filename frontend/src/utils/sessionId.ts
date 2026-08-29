/**
 * Generates and persists an anonymous session ID in sessionStorage.
 * Survives tab reloads within the same session, resets when tab closes.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server-session';

  const KEY = 'legalbot_cpa_session_id';
  let sessionId = sessionStorage.getItem(KEY);

  if (!sessionId) {
    // crypto.randomUUID() is available in all secure contexts and modern
    // browsers; the Math.random() fallback only covers exotic insecure setups.
    sessionId =
      'sess_' +
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 11) + Date.now().toString(36));
    sessionStorage.setItem(KEY, sessionId);
  }

  return sessionId;
}
