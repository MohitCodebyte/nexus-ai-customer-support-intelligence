const CUSTOMER_SESSION_TOKEN_KEY = 'nexus_customer_session_token';
const CUSTOMER_CONVERSATIONS_KEY = 'nexus_customer_conversation_ids';

/**
 * Retrieves or generates a cryptographically random session token for the customer.
 * This token is sent to the backend to securely bind and verify conversation ownership server-side.
 */
export function getCustomerSessionToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    let token = localStorage.getItem(CUSTOMER_SESSION_TOKEN_KEY);
    if (!token || typeof token !== 'string' || token.trim().length < 8) {
      if (typeof window.crypto !== 'undefined' && typeof window.crypto.getRandomValues === 'function') {
        const randomBytes = new Uint8Array(24);
        window.crypto.getRandomValues(randomBytes);
        const hex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
        token = `cust_sess_${hex}`;
      } else {
        token = `cust_sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      }
      localStorage.setItem(CUSTOMER_SESSION_TOKEN_KEY, token);
    }
    return token.trim();
  } catch {
    return 'cust_sess_ephemeral_token';
  }
}

/**
 * Updates or stores the server-confirmed customer session token.
 */
export function setCustomerSessionToken(token: string): void {
  if (typeof window === 'undefined' || !token) return;
  try {
    const trimmed = token.trim();
    if (trimmed.length >= 8) {
      localStorage.setItem(CUSTOMER_SESSION_TOKEN_KEY, trimmed);
    }
  } catch {
    // safe no-op
  }
}

/**
 * Local UI cache of conversation IDs (for quick client-side reference).
 * Note: Never used as proof of authorization or ownership on the server.
 */
export function getCustomerOwnedConversationIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOMER_CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves a new conversation ID to the local UI cache.
 */
export function recordCustomerConversationId(conversationId: string): void {
  if (typeof window === 'undefined' || !conversationId) return;
  try {
    const existing = getCustomerOwnedConversationIds();
    if (!existing.includes(conversationId)) {
      const updated = [conversationId, ...existing].slice(0, 100);
      localStorage.setItem(CUSTOMER_CONVERSATIONS_KEY, JSON.stringify(updated));
    }
  } catch {
    // safe no-op
  }
}
