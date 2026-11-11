import React, { useState, useEffect, useCallback } from 'react';
import type { SupportTicket, TicketStatus, TicketPriority } from '../../types/chat';
import {
  fetchAdminTicketsApi,
  fetchAdminTicketDetailsApi,
  updateAdminTicketApi,
  replyAdminTicketApi,
} from '../../services/api';
import {
  Headphones,
  Search,
  CheckCircle2,
  User,
  Send,
  Lock,
  RefreshCw,
} from 'lucide-react';

interface AgentWorkspaceViewProps {
  onOpenConversationInChat?: (conversationId: string) => void;
  isBackendOnline?: boolean | null;
}

export const AgentWorkspaceView: React.FC<AgentWorkspaceViewProps> = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [selectedTicketLoading, setSelectedTicketLoading] = useState(false);

  // Filter & Search states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agent Reply Composer
  const [replyMessage, setReplyMessage] = useState('');
  const [agentName, setAgentName] = useState('Agent Sarah (Support Tier 2)');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [ticketActionStatus, setTicketActionStatus] = useState<string | null>(null);

  // Load ticket details
  const loadTicketDetails = useCallback(async (ticketId: string) => {
    setSelectedTicketLoading(true);
    try {
      const details = await fetchAdminTicketDetailsApi(ticketId);
      setSelectedTicket(details);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket details');
    } finally {
      setSelectedTicketLoading(false);
    }
  }, []);

  // Load ticket queue
  const loadTickets = useCallback(async () => {
    setIsLoadingTickets(true);
    setError(null);
    try {
      const data = await fetchAdminTicketsApi(statusFilter, searchQuery);
      setTickets(data.tickets);
      setTotalTickets(data.total);

      // Auto-select first ticket if none selected
      if (!selectedTicket && data.tickets.length > 0) {
        await loadTicketDetails(data.tickets[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tickets');
    } finally {
      setIsLoadingTickets(false);
    }
  }, [statusFilter, searchQuery, selectedTicket, loadTicketDetails]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTickets();
    }, 0);
    return () => clearTimeout(timer);
  }, [statusFilter, loadTickets]);

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!selectedTicket) return;
    try {
      await updateAdminTicketApi(selectedTicket.id, { status: newStatus });
      setTicketActionStatus(`Status updated to ${newStatus.toUpperCase()}`);
      setTimeout(() => setTicketActionStatus(null), 3000);
      loadTicketDetails(selectedTicket.id);
      loadTickets();
    } catch {
      setError('Failed to update status');
    }
  };

  const handleClaimTicket = async () => {
    if (!selectedTicket) return;
    try {
      await updateAdminTicketApi(selectedTicket.id, {
        status: 'in_progress',
        assigned_agent: agentName,
      });
      setTicketActionStatus(`Claimed ticket as ${agentName}`);
      setTimeout(() => setTicketActionStatus(null), 3000);
      loadTicketDetails(selectedTicket.id);
      loadTickets();
    } catch {
      setError('Failed to claim ticket');
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    setIsSubmittingReply(true);
    try {
      await replyAdminTicketApi(selectedTicket.id, {
        message: replyMessage.trim(),
        sender_name: agentName,
        is_internal_note: isInternalNote,
      });
      setReplyMessage('');
      setTicketActionStatus(isInternalNote ? 'Internal note added' : 'Reply delivered to customer chat!');
      setTimeout(() => setTicketActionStatus(null), 3000);
      // Reload ticket details to see message in timeline
      loadTicketDetails(selectedTicket.id);
      loadTickets();
    } catch {
      setError('Failed to send reply');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const getPriorityBadgeClass = (p: TicketPriority) => {
    switch (p) {
      case 'urgent':
        return 'badge-danger';
      case 'high':
        return 'badge-warning';
      case 'normal':
        return 'badge-primary';
      default:
        return 'badge-muted';
    }
  };

  const getStatusBadgeClass = (s: TicketStatus) => {
    switch (s) {
      case 'open':
        return 'badge-warning';
      case 'in_progress':
        return 'badge-cyan';
      case 'waiting':
        return 'badge-lavender';
      case 'resolved':
        return 'badge-success';
      default:
        return 'badge-muted';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Top Header Banner */}
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
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(14, 165, 233, 0.3)',
            }}
          >
            <Headphones size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              Human Support Agent Desk
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Real-time customer escalation queue, conversation takeover, and ticket resolution.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <button
            type="button"
            onClick={loadTickets}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 0.9rem', fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} className={isLoadingTickets ? 'spin-slow' : ''} />
            <span>Refresh Queue</span>
          </button>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.8rem',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(14, 165, 233, 0.1)',
              border: '1px solid rgba(14, 165, 233, 0.25)',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--primary-light)',
            }}
          >
            <span>{totalTickets} Tickets in Queue</span>
          </div>
        </div>
      </div>

      {ticketActionStatus && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            color: 'var(--success)',
            fontSize: '0.86rem',
            fontWeight: 600,
          }}
        >
          {ticketActionStatus}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger)',
            fontSize: '0.86rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Main Multi-Column Split: Ticket List (Left) & Ticket Context Workspace (Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)',
          gap: '1.25rem',
          alignItems: 'start',
        }}
        className="agent-workspace-grid"
      >
        {/* ================================================================= */}
        {/* LEFT: TICKET QUEUE LIST */}
        {/* ================================================================= */}
        <div
          className="glass-panel"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'clamp(550px, calc(100vh - 220px), 820px)',
            overflow: 'hidden',
          }}
        >
          {/* Filter Bar */}
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--surface-card-border)' }}>
            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
              <Search
                size={15}
                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                placeholder="Search ticket, customer, reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadTickets();
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-card-subtle)',
                  border: '1px solid var(--surface-card-border)',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  outline: 'none',
                }}
              />
            </div>

            {/* Status Tabs */}
            <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
              {(['all', 'open', 'in_progress', 'waiting', 'resolved'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  style={{
                    background: statusFilter === s ? 'var(--primary)' : 'transparent',
                    color: statusFilter === s ? '#ffffff' : 'var(--text-secondary)',
                    border: '1px solid',
                    borderColor: statusFilter === s ? 'var(--primary)' : 'var(--surface-card-border)',
                    padding: '0.25rem 0.6rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket Scroll List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {tickets.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                <CheckCircle2 size={32} style={{ margin: '0 auto 0.75rem auto', color: 'var(--mint-light)', opacity: 0.8 }} />
                <div>No tickets matching filter.</div>
                <div style={{ fontSize: '0.76rem', marginTop: '0.25rem' }}>All customer inquiries are running smoothly.</div>
              </div>
            ) : (
              tickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => loadTicketDetails(t.id)}
                    role="button"
                    tabIndex={0}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      background: isSelected ? 'var(--primary-soft)' : 'var(--surface-card-subtle)',
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--primary-light)' : 'var(--surface-card-border)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.78rem', color: 'var(--primary-light)' }}>
                        {t.id}
                      </span>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <span className={`badge ${getPriorityBadgeClass(t.priority)}`} style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem' }}>
                          {t.priority}
                        </span>
                        <span className={`badge ${getStatusBadgeClass(t.status)}`} style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem' }}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                      {t.customer_name}
                    </div>

                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: '0.45rem',
                      }}
                    >
                      {t.reason}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span>Session: {t.conversation_id.slice(0, 8)}...</span>
                      <span>{t.created_at.slice(0, 16)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* RIGHT: TICKET DETAIL & CUSTOMER CHAT TAKEOVER */}
        {/* ================================================================= */}
        <div
          className="glass-panel"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'clamp(550px, calc(100vh - 220px), 820px)',
            overflow: 'hidden',
          }}
        >
          {selectedTicketLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              Loading ticket details...
            </div>
          ) : selectedTicket ? (
            <>
              {/* Ticket Top Action Bar */}
              <div
                style={{
                  padding: '1rem 1.5rem',
                  borderBottom: '1px solid var(--surface-card-border)',
                  background: 'var(--surface-card-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--primary-light)' }}>
                      {selectedTicket.id}
                    </span>
                    <span className={`badge ${getStatusBadgeClass(selectedTicket.status)}`}>
                      {selectedTicket.status.toUpperCase().replace('_', ' ')}
                    </span>
                    <span className={`badge ${getPriorityBadgeClass(selectedTicket.priority)}`}>
                      {selectedTicket.priority.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Customer: <strong style={{ color: 'var(--text-primary)' }}>{selectedTicket.customer_name}</strong> • Reason:{' '}
                    <em>{selectedTicket.reason}</em>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {selectedTicket.status !== 'in_progress' && (
                    <button
                      type="button"
                      onClick={handleClaimTicket}
                      className="btn btn-primary"
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                    >
                      <User size={14} />
                      <span>Claim Ticket</span>
                    </button>
                  )}

                  <select
                    value={selectedTicket.status}
                    onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                    style={{
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--surface-card-border)',
                      padding: '0.45rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting">Waiting for Customer</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>

              {/* Middle: Transcript & Internal Timeline */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  background: 'rgba(7, 10, 19, 0.4)',
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Conversation Transcript & Support Events
                </div>

                {/* Conversation History Messages */}
                {selectedTicket.conversation_transcript && selectedTicket.conversation_transcript.length > 0 ? (
                  selectedTicket.conversation_transcript.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isUser ? 'flex-end' : 'flex-start',
                          gap: '0.25rem',
                        }}
                      >
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {isUser ? selectedTicket.customer_name : 'Nexus AI / Support'} • {msg.created_at}
                        </span>
                        <div
                          style={{
                            maxWidth: '82%',
                            padding: '0.75rem 1.1rem',
                            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            background: isUser ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'var(--surface-card-subtle)',
                            color: isUser ? '#ffffff' : 'var(--text-primary)',
                            border: isUser ? 'none' : '1px solid var(--surface-card-border)',
                            fontSize: '0.88rem',
                            lineHeight: 1.5,
                            wordBreak: 'break-word',
                          }}
                        >
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No previous chat messages recorded.</div>
                )}

                {/* Internal Ticket Timeline Notes */}
                {selectedTicket.messages && selectedTicket.messages.length > 0 && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--surface-card-border)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--secondary-light)', marginBottom: '0.65rem' }}>
                      Support Event Timeline & Agent Notes:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedTicket.messages.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            padding: '0.6rem 0.85rem',
                            borderRadius: 'var(--radius-md)',
                            background: m.is_internal_note ? 'rgba(139, 92, 246, 0.1)' : 'rgba(14, 165, 233, 0.08)',
                            border: '1px solid',
                            borderColor: m.is_internal_note ? 'rgba(139, 92, 246, 0.25)' : 'rgba(14, 165, 233, 0.2)',
                            fontSize: '0.82rem',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                            <span style={{ fontWeight: 700, color: m.is_internal_note ? 'var(--secondary-light)' : 'var(--primary-light)' }}>
                              {m.sender_name} {m.is_internal_note ? '(Internal Staff Note)' : '(Public Reply)'}
                            </span>
                            <span>{m.created_at}</span>
                          </div>
                          <div style={{ color: 'var(--text-primary)' }}>{m.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom: Agent Reply Composer */}
              <form
                onSubmit={handleSubmitReply}
                style={{
                  padding: '1rem 1.5rem',
                  borderTop: '1px solid var(--surface-card-border)',
                  background: 'var(--surface-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Agent Identity:</span>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      style={{
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.78rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-card-subtle)',
                        border: '1px solid var(--surface-card-border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                    />
                    <Lock size={12} />
                    <span>Internal Staff Note (Customer won&apos;t see)</span>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <textarea
                    rows={2}
                    placeholder={
                      isInternalNote
                        ? 'Write private internal staff note regarding this customer issue...'
                        : 'Reply to customer... (Your message will be sent directly to their live chat session)'
                    }
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-card-subtle)',
                      border: '1px solid var(--surface-card-border)',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                      outline: 'none',
                      resize: 'none',
                    }}
                  />

                  <button
                    type="submit"
                    disabled={isSubmittingReply || !replyMessage.trim()}
                    className={isInternalNote ? 'btn btn-secondary' : 'btn btn-primary'}
                    style={{ padding: '0.65rem 1.25rem', height: '44px' }}
                  >
                    <span>{isInternalNote ? 'Save Note' : 'Send Reply'}</span>
                    <Send size={14} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <Headphones size={48} style={{ opacity: 0.4, marginBottom: '1rem' }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-secondary)' }}>No Ticket Selected</div>
              <div style={{ fontSize: '0.84rem' }}>Select a ticket from the left queue to review context and assist.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
