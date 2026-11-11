import React, { useState, useEffect, useCallback } from 'react';
import type { AdminAnalyticsResponse, ConversationSummary } from '../../types/chat';
import {
  fetchAdminOverviewAnalytics,
  fetchAdminConversationsApi,
  fetchAdminConversationAuditApi,
  checkAdminAuthApi,
  loginAdminApi,
  logoutAdminApi,
} from '../../services/api';
import {
  BarChart3,
  Shield,
  Star,
  Users,
  FileText,
  AlertTriangle,
  RefreshCw,
  Lock,
  Search,
} from 'lucide-react';

interface AuditTurn {
  id: number;
  role: string;
  content: string;
  created_at: string;
  parsed_metadata?: {
    intent?: string;
    confidence?: number;
    detected_language?: string;
    sentiment?: string;
    requires_human_review?: boolean;
    [key: string]: unknown;
  };
}

interface AuditData {
  conversation_id: string;
  message_count: number;
  messages: AuditTurn[];
  [key: string]: unknown;
}

interface AdminDashboardViewProps {
  isBackendOnline?: boolean | null;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Analytics data
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(30);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Conversation Audit Inspector
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [auditDetails, setAuditDetails] = useState<AuditData | null>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Check auth state on mount
  useEffect(() => {
    checkAdminAuthApi().then((auth) => {
      setIsAuthenticated(auth);
    });
  }, []);

  const loadAnalytics = useCallback(async (days: number) => {
    setIsLoadingAnalytics(true);
    setAnalyticsError(null);
    try {
      const data = await fetchAdminOverviewAnalytics(days);
      setAnalytics(data);
    } catch (err: unknown) {
      setAnalyticsError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, []);

  const loadConversations = useCallback(async (search: string = '') => {
    try {
      const data = await fetchAdminConversationsApi(search, 20, 0);
      setConversations(data.conversations);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => {
        void loadAnalytics(selectedDays);
        void loadConversations(auditSearch);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, selectedDays, loadAnalytics, loadConversations, auditSearch]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPasswordInput.trim()) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await loginAdminApi(adminPasswordInput.trim());
      setIsAuthenticated(true);
      setAdminPasswordInput('');
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Invalid administrator credentials');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutAdminApi();
    setIsAuthenticated(false);
    setAnalytics(null);
  };

  const handleInspectConversation = async (convId: string) => {
    setSelectedConvId(convId);
    setIsLoadingAudit(true);
    try {
      const data = await fetchAdminConversationAuditApi(convId);
      setAuditDetails(data as unknown as AuditData);
    } catch {
      setAuditDetails(null);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // If not authenticated, render secure login card
  if (isAuthenticated === false) {
    return (
      <div style={{ maxWidth: '480px', margin: '4rem auto', width: '100%' }}>
        <div
          className="glass-panel"
          style={{
            padding: '2.5rem',
            borderRadius: 'var(--radius-xl)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'rgba(14, 165, 233, 0.15)',
              color: 'var(--primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
            }}
          >
            <Lock size={28} />
          </div>

          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              Admin & Analytics Portal
            </h2>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Protected administrative environment. Please enter system credentials to access real CSAT metrics, Banking77 intent breakdowns, and conversation audits.
            </p>
          </div>

          {loginError && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger)',
                fontSize: '0.82rem',
              }}
            >
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            <input
              type="password"
              placeholder="Enter Admin Secret Key..."
              value={adminPasswordInput}
              onChange={(e) => setAdminPasswordInput(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-card-subtle)',
                border: '1px solid var(--surface-card-border)',
                color: 'var(--text-primary)',
                fontSize: '0.92rem',
                outline: 'none',
              }}
            />

            <button
              type="submit"
              disabled={isLoggingIn || !adminPasswordInput.trim()}
              className="btn btn-primary"
              style={{ padding: '0.75rem 1rem', width: '100%' }}
            >
              <span>{isLoggingIn ? 'Authenticating...' : 'Unlock Admin Portal'}</span>
              <Shield size={16} />
            </button>
          </form>

          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Default server secret configured in <code>.env</code> (NEXUS_ADMIN_KEY).
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
      {/* Top Header Controls */}
      <div
        className="glass-panel"
        style={{
          padding: '1.25rem 1.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)',
            }}
          >
            <BarChart3 size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              Operational Intelligence & CSAT Analytics
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Real metrics from live customer sessions, Banking77 intent distributions, and support tickets.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          {/* Date Range Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--surface-card-subtle)', padding: '0.2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-card-border)' }}>
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDays(d)}
                style={{
                  background: selectedDays === d ? 'var(--primary)' : 'transparent',
                  color: selectedDays === d ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '0.3rem 0.7rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {d} Days
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => loadAnalytics(selectedDays)}
            className="btn btn-secondary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
          >
            <RefreshCw size={13} className={isLoadingAnalytics ? 'spin-slow' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-ghost"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', color: 'var(--danger)' }}
          >
            <Lock size={13} />
            <span>Lock</span>
          </button>
        </div>
      </div>

      {analyticsError && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger)',
            fontSize: '0.86rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={16} />
          <span>{analyticsError}</span>
        </div>
      )}

      {analytics && (
        <>
          {/* ================================================================= */}
          {/* 1. KEY METRIC KPI CARDS */}
          {/* ================================================================= */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {/* Total Conversations */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>TOTAL CONVERSATIONS</span>
                <Users size={16} color="var(--primary-light)" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {analytics.overview.total_conversations}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {analytics.overview.total_messages} total messages logged
              </div>
            </div>

            {/* CSAT Average Rating */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>AVERAGE CSAT RATING</span>
                <Star size={16} color="#fbbf24" fill="#fbbf24" />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {analytics.csat.average_rating > 0 ? analytics.csat.average_rating.toFixed(1) : '5.0'}
                </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/ 5.0</span>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {analytics.csat.total_ratings} customer ratings ({analytics.csat.thumbs_up} helpful thumbs)
              </div>
            </div>

            {/* Support Tickets Queue */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>OPEN ESCALATIONS</span>
                <AlertTriangle size={16} color="var(--warning)" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {analytics.overview.open_tickets}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {analytics.overview.in_progress_tickets} in progress • {analytics.overview.resolved_tickets} resolved
              </div>
            </div>

            {/* Secure Attachments */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>CUSTOMER ATTACHMENTS</span>
                <FileText size={16} color="var(--mint-light)" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {analytics.overview.total_attachments}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {analytics.overview.total_attachment_mb} MB stored in private jails
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* 2. CHARTS: INTENTS BREAKDOWN & CSAT RATINGS */}
          {/* ================================================================= */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* Top Banking77 Intents Chart */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Top Banking77 Predicted Intents</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Frequencies across customer support turns</p>
                </div>
                <span className="badge badge-primary">SVM Calibrated</span>
              </div>

              {analytics.intents && analytics.intents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {analytics.intents.slice(0, 6).map((item) => {
                    const maxCount = Math.max(...analytics.intents.map((i) => i.count), 1);
                    const pct = Math.round((item.count / maxCount) * 100);
                    return (
                      <div key={item.intent} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {item.intent.replace(/_/g, ' ')}
                          </span>
                          <span style={{ color: 'var(--primary-light)', fontWeight: 700 }}>{item.count}</span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: 'linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)',
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', padding: '1rem 0' }}>No turns logged yet.</div>
              )}
            </div>

            {/* CSAT 1-5 Star Ratings Breakdown */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Customer Satisfaction (CSAT)</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>1 to 5 star rating distribution</p>
                </div>
                <span className="badge badge-success">Verified CSAT</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = analytics.csat.stars_distribution[stars] || 0;
                  const total = analytics.csat.total_ratings || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem' }}>
                      <div style={{ width: '60px', display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#fbbf24', fontWeight: 700 }}>
                        <span>{stars}</span>
                        <Star size={13} fill="#fbbf24" />
                      </div>
                      <div style={{ flex: 1, height: '8px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: stars >= 4 ? 'var(--mint)' : stars === 3 ? 'var(--warning)' : 'var(--danger)',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                      <div style={{ width: '45px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        {count}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sentiment Summary */}
              <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--surface-card-border)', display: 'flex', justifyContent: 'space-around', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--mint-light)' }}>Positive: {analytics.sentiment.positive}</span>
                <span style={{ color: 'var(--text-secondary)' }}>Neutral: {analytics.sentiment.neutral}</span>
                <span style={{ color: 'var(--danger)' }}>Negative: {analytics.sentiment.negative}</span>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* 3. CONVERSATION AUDIT INSPECTOR */}
          {/* ================================================================= */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Conversation Audit Inspector</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Inspect turn-by-turn internal ML confidence scores, canonical translations, and RAG sources (strictly hidden from customer viewports).
                </p>
              </div>

              <div style={{ position: 'relative', minWidth: '240px' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter by keyword..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadConversations(auditSearch);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.65rem 0.45rem 2rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-card-subtle)',
                    border: '1px solid var(--surface-card-border)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Conversation Grid & Drawer */}
            <div style={{ display: 'grid', gridTemplateColumns: selectedConvId ? '340px minmax(0, 1fr)' : '1fr', gap: '1rem' }}>
              {/* Conversation items */}
              <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {conversations.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                    No conversations matching query.
                  </div>
                ) : (
                  conversations.map((c) => {
                    const isSelected = selectedConvId === c.conversation_id;
                    return (
                      <div
                        key={c.conversation_id}
                        onClick={() => handleInspectConversation(c.conversation_id)}
                        role="button"
                        tabIndex={0}
                        style={{
                          padding: '0.75rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          background: isSelected ? 'var(--primary-soft)' : 'var(--surface-card-subtle)',
                          border: '1px solid',
                          borderColor: isSelected ? 'var(--primary)' : 'var(--surface-card-border)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                            {c.title}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.message_count} msgs</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.last_message || 'No messages'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Selected Conversation Audit Drawer */}
              {selectedConvId && (
                <div
                  style={{
                    border: '1px solid var(--surface-card-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    background: 'rgba(7, 10, 19, 0.6)',
                    maxHeight: '420px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--primary-light)' }}>
                      AUDIT: {selectedConvId}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedConvId(null)}
                      className="btn btn-ghost"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                    >
                      Close
                    </button>
                  </div>

                  {isLoadingAudit ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Loading audit metadata...</div>
                  ) : auditDetails?.messages ? (
                    auditDetails.messages.map((m: AuditTurn) => {
                      const isUser = m.role === 'user';
                      const meta = m.parsed_metadata || {};
                      return (
                        <div
                          key={m.id}
                          style={{
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            background: isUser ? 'rgba(14, 165, 233, 0.08)' : 'var(--surface-card-subtle)',
                            border: '1px solid',
                            borderColor: isUser ? 'rgba(14, 165, 233, 0.25)' : 'var(--surface-card-border)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                            <strong style={{ color: isUser ? 'var(--primary-light)' : 'var(--secondary-light)' }}>
                              {isUser ? 'CUSTOMER' : 'ASSISTANT'} (Turn #{m.id})
                            </strong>
                            <span>{m.created_at}</span>
                          </div>

                          <div style={{ fontSize: '0.86rem', color: 'var(--text-primary)', marginBottom: meta.intent ? '0.65rem' : 0 }}>
                            {m.content}
                          </div>

                          {/* Internal ML Audit Badges (Visible ONLY to Admin) */}
                          {meta.intent && (
                            <div
                              style={{
                                marginTop: '0.5rem',
                                paddingTop: '0.5rem',
                                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '0.4rem',
                                fontSize: '0.72rem',
                              }}
                            >
                              <span className="badge badge-primary">Intent: {meta.intent}</span>
                              {meta.confidence !== undefined && (
                                <span className="badge badge-cyan">Confidence: {(meta.confidence * 100).toFixed(1)}%</span>
                              )}
                              {meta.detected_language && (
                                <span className="badge badge-lavender">Lang: {meta.detected_language}</span>
                              )}
                              {meta.sentiment && (
                                <span className="badge badge-muted">Sentiment: {meta.sentiment}</span>
                              )}
                              {meta.requires_human_review && (
                                <span className="badge badge-warning">Review Flagged</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>No message details found.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
