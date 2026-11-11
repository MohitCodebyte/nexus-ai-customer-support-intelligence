import type {
  HealthResponse,
  HistoryResponse,
  IntentOnlyResponse,
  UnifiedChatResponse,
  CustomerFeedbackPayload,
  ReportResponsePayload,
  FeedbackAnalyticsResponse,
  SupportedLanguage,
  ConversationsListResponse,
  AttachmentInfo,
  SupportTicket,
  TicketMessage,
  AdminAnalyticsResponse,
  KnowledgeFaq,
} from '../types/chat';
import { getCustomerSessionToken, setCustomerSessionToken } from '../lib/customerSession';

/**
 * Centralized API client for AI Customer Support Intelligence backend.
 * Reads base URL from import.meta.env.VITE_API_BASE_URL or defaults to relative/proxy.
 */
const getBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.replace(/\/+$/, '');
  }
  // If no env is set, use empty string in browser (Vite proxy forwards /api and /health)
  return '';
};

/**
 * Returns common headers for customer requests, automatically binding the verified customer session token.
 */
const getCustomerHeaders = (extraHeaders?: Record<string, string>): Record<string, string> => {
  const sessionToken = getCustomerSessionToken();
  return {
    Accept: 'application/json',
    'X-Customer-Session-Token': sessionToken,
    ...(extraHeaders || {}),
  };
};

/**
 * Synchronizes session token from response headers or JSON payload.
 */
const syncSessionToken = (res: Response, data?: unknown): void => {
  try {
    const headerToken = res.headers.get('x-customer-session-token');
    if (headerToken && headerToken.trim()) {
      setCustomerSessionToken(headerToken.trim());
    } else if (
      data &&
      typeof data === 'object' &&
      'session_token' in data &&
      typeof (data as { session_token?: unknown }).session_token === 'string'
    ) {
      setCustomerSessionToken((data as { session_token: string }).session_token);
    }
  } catch {
    // safe no-op
  }
};

export class ApiError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Check backend health status
 */
export async function checkBackendHealth(): Promise<{
  online: boolean;
  service?: string;
  latencyMs?: number;
  error?: string;
}> {
  const startTime = performance.now();
  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/health`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Math.round(performance.now() - startTime);

    if (!res.ok) {
      return {
        online: false,
        latencyMs,
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data: HealthResponse = await res.json();
    return {
      online: data.status === 'ok',
      service: data.service,
      latencyMs,
    };
  } catch (err: unknown) {
    const message =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Connection timed out'
        : err instanceof Error
          ? err.message
          : 'Unable to reach backend';
    return {
      online: false,
      error: message,
    };
  }
}

/**
 * Send customer message through unified chat endpoint (/api/chat)
 * Supports cancellation via AbortSignal, attached documents, and binds verified customer session token.
 */
export async function sendUnifiedChat(
  message: string,
  conversationId?: string,
  signal?: AbortSignal,
  language?: SupportedLanguage,
  attachmentIds?: string[]
): Promise<UnifiedChatResponse> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new ApiError('Message cannot be empty', 400);
  }

  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/chat`;

  const payload: {
    message: string;
    conversation_id?: string;
    language?: string;
    attachment_ids?: string[];
  } = {
    message: trimmed,
  };
  if (conversationId && conversationId.trim()) {
    payload.conversation_id = conversationId.trim();
  }
  if (language && language !== 'auto') {
    payload.language = language;
  }
  if (attachmentIds && attachmentIds.length > 0) {
    payload.attachment_ids = attachmentIds;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: getCustomerHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
      signal,
    });

    const data = await res.json().catch(() => null);
    syncSessionToken(res, data);

    if (!res.ok) {
      const errMsg =
        data && typeof data.error === 'string'
          ? data.error
          : `Chat request failed with status ${res.status}`;
      throw new ApiError(errMsg, res.status, data);
    }

    return data as UnifiedChatResponse;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request was canceled by user', 499);
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network failure while sending message',
      0
    );
  }
}

/**
 * Upload a secure file attachment (PDF, TXT, CSV, JPG, PNG) bound to the conversation
 */
export async function uploadAttachment(
  file: File,
  conversationId?: string,
  onProgress?: (percent: number) => void
): Promise<AttachmentInfo> {
  // Enforce Vercel serverless request body boundary (4.5 MB limit)
  if (file.size > 4.5 * 1024 * 1024) {
    throw new ApiError(
      'File size exceeds the 4.5 MB cloud limit for attachments. Please select a file under 4.5 MB.',
      413
    );
  }

  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/chat/upload`;

  const formData = new FormData();
  formData.append('file', file);
  if (conversationId && conversationId.trim()) {
    formData.append('conversation_id', conversationId.trim());
  }

  const token = getCustomerSessionToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Customer-Session-Token', token);
    xhr.setRequestHeader('Accept', 'application/json');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      const headerToken = xhr.getResponseHeader('X-Customer-Session-Token');
      if (headerToken) setCustomerSessionToken(headerToken);

      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.status === 'success') {
          resolve(data.attachment as AttachmentInfo);
        } else {
          const errMsg =
            data && typeof data.error === 'string'
              ? data.error
              : `Upload failed with status ${xhr.status}`;
          reject(new ApiError(errMsg, xhr.status, data));
        }
      } catch {
        reject(new ApiError(`Upload failed with status ${xhr.status}`, xhr.status));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError('Network error while uploading attachment', 0));
    };

    xhr.send(formData);
  });
}

/**
 * Record customer feedback on assistant response (/api/chat/feedback)
 */
export async function sendCustomerFeedback(
  feedback: CustomerFeedbackPayload
): Promise<{ status: string; message: string }> {
  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/chat/feedback`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: getCustomerHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(feedback),
    });

    const data = await res.json().catch(() => null);
    syncSessionToken(res, data);

    if (!res.ok) {
      const errMsg =
        data && typeof data.error === 'string'
          ? data.error
          : `Feedback submission failed with status ${res.status}`;
      throw new ApiError(errMsg, res.status, data);
    }

    return data;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network failure while submitting feedback',
      0
    );
  }
}

/**
 * Fetch admin feedback analytics summary (/api/admin/feedback/analytics)
 */
export async function fetchFeedbackAnalytics(): Promise<FeedbackAnalyticsResponse> {
  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/admin/feedback/analytics`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Client-Role': 'admin',
        'X-Admin-Key': 'nexus-admin-secret-2026',
      },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errMsg =
        data && typeof data.error === 'string'
          ? data.error
          : `Failed to load feedback analytics (status ${res.status})`;
      throw new ApiError(errMsg, res.status, data);
    }

    return data as FeedbackAnalyticsResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network failure while loading feedback analytics',
      0
    );
  }
}

/**
 * Submit user report for inaccurate or inappropriate response (/api/chat/report)
 */
export async function submitReportResponse(
  report: ReportResponsePayload
): Promise<{ status: string; message: string }> {
  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/chat/report`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: getCustomerHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(report),
    });

    const data = await res.json().catch(() => null);
    syncSessionToken(res, data);

    if (!res.ok) {
      const errMsg =
        data && typeof data.error === 'string'
          ? data.error
          : `Report submission failed with status ${res.status}`;
      throw new ApiError(errMsg, res.status, data);
    }

    return data;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network failure while submitting report',
      0
    );
  }
}

/**
 * Classify customer intent only (/api/chat/intent)
 */
export async function classifyIntentOnly(
  message: string,
  reviewThreshold = 0.55
): Promise<IntentOnlyResponse> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new ApiError('Message cannot be empty', 400);
  }

  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/chat/intent`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        message: trimmed,
        review_threshold: reviewThreshold,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errMsg =
        data && typeof data.error === 'string'
          ? data.error
          : `Intent classification failed with status ${res.status}`;
      throw new ApiError(errMsg, res.status, data);
    }

    return data as IntentOnlyResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network failure during intent classification',
      0
    );
  }
}

/**
 * Fetch conversation history for a given conversation_id (/api/chat/<id>/history)
 * Uses verified customer session token to enforce ownership authorization server-side.
 */
export async function fetchConversationHistory(
  conversationId: string,
  adminKey?: string
): Promise<HistoryResponse> {
  const id = conversationId.trim();
  if (!id) {
    throw new ApiError('Conversation ID is required', 400);
  }

  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/chat/${encodeURIComponent(id)}/history`;

  try {
    const extraHeaders: Record<string, string> = {};
    if (adminKey) {
      extraHeaders['X-Admin-Key'] = adminKey;
      extraHeaders['X-Client-Role'] = 'admin';
    }

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: getCustomerHeaders(extraHeaders),
    });

    const data = await res.json().catch(() => null);
    syncSessionToken(res, data);

    if (!res.ok) {
      const errMsg =
        data && typeof data.error === 'string'
          ? data.error
          : `Failed to load conversation history (status ${res.status})`;
      throw new ApiError(errMsg, res.status, data);
    }

    return data as HistoryResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network failure while loading history',
      0
    );
  }
}

/**
 * Fetch paginated conversations list with search (/api/chat/conversations)
 * Security: Server strictly scopes results to the customer's verified session token.
 * Client-supplied IDs are never trusted as proof of ownership.
 */
export async function fetchConversationsList(params?: {
  search?: string;
  limit?: number;
  offset?: number;
  adminKey?: string;
}): Promise<ConversationsListResponse> {
  const baseUrl = getBaseUrl();
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));

  const url = `${baseUrl}/api/chat/conversations${query.toString() ? '?' + query.toString() : ''}`;

  try {
    const extraHeaders: Record<string, string> = {};
    if (params?.adminKey) {
      extraHeaders['X-Admin-Key'] = params.adminKey;
      extraHeaders['X-Client-Role'] = 'admin';
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: getCustomerHeaders(extraHeaders),
    });

    const data = await res.json().catch(() => null);
    syncSessionToken(res, data);

    if (!res.ok) {
      const errMsg =
        data && typeof data.error === 'string'
          ? data.error
          : `Failed to load conversations (status ${res.status})`;
      throw new ApiError(errMsg, res.status, data);
    }

    return data as ConversationsListResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network failure while loading conversations',
      0
    );
  }
}

/**
 * Delete a single conversation from SQLite history with server ownership enforcement
 */
export async function deleteConversationApi(
  conversationId: string,
  adminKey?: string
): Promise<void> {
  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/chat/${encodeURIComponent(conversationId)}`;

  try {
    const extraHeaders: Record<string, string> = {};
    if (adminKey) {
      extraHeaders['X-Admin-Key'] = adminKey;
      extraHeaders['X-Client-Role'] = 'admin';
    }

    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: getCustomerHeaders(extraHeaders),
    });

    syncSessionToken(res);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const errMsg =
        data && typeof data.error === 'string'
          ? data.error
          : `Failed to delete conversation (status ${res.status})`;
      throw new ApiError(errMsg, res.status, data);
    }
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network failure while deleting conversation',
      0
    );
  }
}

/**
 * Rename a conversation title
 */
export async function renameConversationApi(
  conversationId: string,
  title: string
): Promise<{ conversation_id: string; title: string }> {
  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/chat/${encodeURIComponent(conversationId)}/rename`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: getCustomerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title }),
    });

    const data = await res.json().catch(() => null);
    syncSessionToken(res, data);

    if (!res.ok) {
      const errMsg = data?.error || `Failed to rename conversation (status ${res.status})`;
      throw new ApiError(errMsg, res.status, data);
    }

    return data as { conversation_id: string; title: string };
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network failure while renaming conversation',
      0
    );
  }
}

// =============================================================================
// ADMIN AUTHENTICATION & ANALYTICS CLIENT
// =============================================================================

export async function loginAdminApi(password: string): Promise<{ admin_token: string }> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Invalid credentials', res.status, data);
  }

  // Persist admin session in sessionStorage
  if (data?.admin_token) {
    sessionStorage.setItem('nexus_admin_session_token', data.admin_token);
  }
  return data;
}

export async function logoutAdminApi(): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  await fetch(`${baseUrl}/api/admin/logout`, {
    method: 'POST',
    headers: {
      'X-Admin-Session': token,
    },
  }).catch(() => null);
  sessionStorage.removeItem('nexus_admin_session_token');
}

export async function checkAdminAuthApi(): Promise<boolean> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  try {
    const res = await fetch(`${baseUrl}/api/admin/me`, {
      headers: {
        'X-Admin-Session': token,
      },
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Boolean(data?.authenticated);
  } catch {
    return false;
  }
}

export async function fetchAdminOverviewAnalytics(days: number = 30): Promise<AdminAnalyticsResponse> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const res = await fetch(`${baseUrl}/api/admin/analytics?days=${days}`, {
    headers: {
      'X-Admin-Session': token,
      Accept: 'application/json',
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to fetch admin analytics', res.status, data);
  }
  return data as AdminAnalyticsResponse;
}

export async function fetchAdminConversationsApi(
  search: string = '',
  limit: number = 25,
  offset: number = 0
): Promise<ConversationsListResponse> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const q = new URLSearchParams({ search, limit: String(limit), offset: String(offset) });
  const res = await fetch(`${baseUrl}/api/admin/conversations?${q.toString()}`, {
    headers: {
      'X-Admin-Session': token,
      Accept: 'application/json',
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to list conversations', res.status, data);
  }
  return data as ConversationsListResponse;
}

export async function fetchAdminConversationAuditApi(conversationId: string): Promise<Record<string, unknown>> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const res = await fetch(`${baseUrl}/api/admin/conversations/${encodeURIComponent(conversationId)}`, {
    headers: {
      'X-Admin-Session': token,
      Accept: 'application/json',
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to load conversation audit', res.status, data);
  }
  return data;
}

// =============================================================================
// HUMAN SUPPORT HANDOFF CLIENT
// =============================================================================

export async function requestHumanSupportApi(payload: {
  conversation_id: string;
  reason: string;
  customer_name?: string;
  priority?: string;
}): Promise<{ status: string; ticket: SupportTicket }> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/support/request`, {
    method: 'POST',
    headers: getCustomerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  syncSessionToken(res, data);

  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to request human support', res.status, data);
  }
  return data;
}

export async function fetchCustomerSupportStatusApi(conversationId: string): Promise<{
  has_ticket: boolean;
  ticket?: SupportTicket;
  public_messages?: TicketMessage[];
}> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/support/status/${encodeURIComponent(conversationId)}`, {
    headers: getCustomerHeaders(),
    credentials: 'include',
  });

  const data = await res.json().catch(() => null);
  syncSessionToken(res, data);

  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to fetch support status', res.status, data);
  }
  return data;
}

export async function fetchAdminTicketsApi(
  status: string = 'all',
  search: string = '',
  limit: number = 50,
  offset: number = 0
): Promise<{ tickets: SupportTicket[]; total: number; has_more: boolean }> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const q = new URLSearchParams({ status, search, limit: String(limit), offset: String(offset) });
  const res = await fetch(`${baseUrl}/api/admin/tickets?${q.toString()}`, {
    headers: {
      'X-Admin-Session': token,
      Accept: 'application/json',
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to fetch tickets queue', res.status, data);
  }
  return data;
}

export async function fetchAdminTicketDetailsApi(ticketId: string): Promise<SupportTicket> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const res = await fetch(`${baseUrl}/api/admin/tickets/${encodeURIComponent(ticketId)}`, {
    headers: {
      'X-Admin-Session': token,
      Accept: 'application/json',
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to fetch ticket details', res.status, data);
  }
  return data as SupportTicket;
}

export async function updateAdminTicketApi(
  ticketId: string,
  updates: { status?: string; assigned_agent?: string; priority?: string }
): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const res = await fetch(`${baseUrl}/api/admin/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'PATCH',
    headers: {
      'X-Admin-Session': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to update ticket', res.status, data);
  }
}

export async function replyAdminTicketApi(
  ticketId: string,
  payload: { message: string; sender_name?: string; is_internal_note?: boolean }
): Promise<{ record: TicketMessage }> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const res = await fetch(`${baseUrl}/api/admin/tickets/${encodeURIComponent(ticketId)}/reply`, {
    method: 'POST',
    headers: {
      'X-Admin-Session': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to send reply', res.status, data);
  }
  return data;
}

// =============================================================================
// KNOWLEDGE BASE FAQ CLIENT
// =============================================================================

export async function fetchKnowledgeFaqsApi(
  search: string = '',
  limit: number = 50,
  offset: number = 0
): Promise<{
  faqs: KnowledgeFaq[];
  total: number;
  system_faqs_sample?: KnowledgeFaq[];
  total_system_documents?: number;
}> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const q = new URLSearchParams({ search, limit: String(limit), offset: String(offset) });
  const res = await fetch(`${baseUrl}/api/admin/knowledge/faqs?${q.toString()}`, {
    headers: {
      'X-Admin-Session': token,
      Accept: 'application/json',
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to load knowledge FAQs', res.status, data);
  }
  return data;
}

export async function saveKnowledgeFaqApi(faq: Partial<KnowledgeFaq>): Promise<KnowledgeFaq> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const res = await fetch(`${baseUrl}/api/admin/knowledge/faqs`, {
    method: 'POST',
    headers: {
      'X-Admin-Session': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(faq),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to save knowledge FAQ', res.status, data);
  }
  return data.faq;
}

export async function deleteKnowledgeFaqApi(faqId: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const res = await fetch(`${baseUrl}/api/admin/knowledge/faqs/${encodeURIComponent(faqId)}`, {
    method: 'DELETE',
    headers: {
      'X-Admin-Session': token,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error || 'Failed to delete knowledge FAQ', res.status, data);
  }
}

export async function testKnowledgeRetrievalApi(query: string, top_k: number = 3): Promise<Record<string, unknown>> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const res = await fetch(`${baseUrl}/api/admin/knowledge/test`, {
    method: 'POST',
    headers: {
      'X-Admin-Session': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, top_k }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Retrieval test failed', res.status, data);
  }
  return data;
}

export async function rebuildKnowledgeIndexApi(): Promise<{ message: string; documents_count?: number }> {
  const baseUrl = getBaseUrl();
  const token = sessionStorage.getItem('nexus_admin_session_token') || '';
  const res = await fetch(`${baseUrl}/api/admin/knowledge/rebuild`, {
    method: 'POST',
    headers: {
      'X-Admin-Session': token,
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Failed to refresh index', res.status, data);
  }
  return data;
}

/**
 * Server-side speech audio transcription fallback when browser speech recognition fails.
 */
export async function transcribeSpeechAudio(
  audioBlob: Blob,
  language: SupportedLanguage = 'en'
): Promise<{ transcript: string; status: string; provider?: string }> {
  let ext = 'webm';
  const type = (audioBlob.type || '').toLowerCase();
  if (type.includes('wav')) ext = 'wav';
  else if (type.includes('ogg')) ext = 'ogg';
  else if (type.includes('mp4') || type.includes('m4a')) ext = 'mp4';
  else if (type.includes('mp3') || type.includes('mpeg')) ext = 'mp3';

  const formData = new FormData();
  formData.append('audio', audioBlob, `voice.${ext}`);
  formData.append('language', language);

  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/speech/transcribe`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Customer-Session-Token': getCustomerSessionToken(),
    },
    credentials: 'include',
    body: formData,
  });

  const data = await res.json().catch(() => null);
  syncSessionToken(res, data);
  if (!res.ok) {
    throw new ApiError(data?.message || data?.error || 'Transcription failed', res.status, data);
  }
  return data;
}


