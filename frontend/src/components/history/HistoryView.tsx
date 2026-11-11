import React, { useState, useEffect, useCallback } from 'react';
import type { HistoryMessage, ParsedMetadata, ChatTurn } from '../../types/chat';
import { fetchConversationHistory, ApiError } from '../../services/api';
import {
  History,
  RefreshCw,
  Search,
  User,
  Bot,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Database,
  ArrowRight,
} from 'lucide-react';

interface HistoryViewProps {
  currentConversationId: string;
  onOpenChat: () => void;
  onResumeConversation?: (conversationId: string, loadedTurns: ChatTurn[]) => void;
  isBackendOnline: boolean | null;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  currentConversationId,
  onOpenChat,
  onResumeConversation,
  isBackendOnline,
}) => {
  const [searchId, setSearchId] = useState(currentConversationId);
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState(false);

  const handleResumeInChat = () => {
    const loadedTurns: ChatTurn[] = messages.map((m) => {
      let timeStr = '';
      if (m.created_at) {
        try {
          timeStr = new Date(m.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
        } catch {
          timeStr = '';
        }
      }
      return {
        id: String(m.id || Date.now()),
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: timeStr,
        attachments: m.attachments,
      };
    });

    if (onResumeConversation) {
      onResumeConversation(searchId, loadedTurns);
    } else {
      onOpenChat();
    }
  };

  const loadHistory = useCallback(async (idToFetch: string) => {
    const trimmed = idToFetch.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setHasQueried(true);

    try {
      const response = await fetchConversationHistory(trimmed);
      setMessages(response.messages || []);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Failed to retrieve conversation history';
      setError(msg);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load for current session if backend is online
  useEffect(() => {
    let isMounted = true;
    if (isBackendOnline && currentConversationId) {
      fetchConversationHistory(currentConversationId.trim())
        .then((response) => {
          if (isMounted) {
            setMessages(response.messages || []);
            setHasQueried(true);
          }
        })
        .catch((err: unknown) => {
          if (isMounted) {
            const msg =
              err instanceof ApiError
                ? err.message
                : err instanceof Error
                ? err.message
                : 'Failed to retrieve conversation history';
            setError(msg);
            setMessages([]);
            setHasQueried(true);
          }
        });
    }
    return () => {
      isMounted = false;
    };
  }, [currentConversationId, isBackendOnline]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadHistory(searchId);
  };

  const parseMetadata = (jsonString?: string): ParsedMetadata | null => {
    if (!jsonString) return null;
    try {
      return JSON.parse(jsonString) as ParsedMetadata;
    } catch {
      return null;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        width: '100%',
        maxWidth: '1000px',
        margin: '0 auto',
      }}
    >
      {/* Search Header */}
      <div
        className="glass-panel"
        style={{
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          background: '#ffffff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'var(--primary-soft)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Database size={18} />
            </div>
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                }}
              >
                Conversation History Explorer
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Directly queries SQLite via <code>GET /api/chat/&lt;conversation_id&gt;/history</code>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearchId(currentConversationId);
              void loadHistory(currentConversationId);
            }}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
          >
            <span>Current Active Session</span>
          </button>
        </div>

        {/* Search Query Form */}
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: '100%',
          }}
        >
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search
              size={16}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
            />
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Enter conversation_id UUID to query history database..."
              style={{
                width: '100%',
                background: 'var(--surface-card-subtle)',
                border: '1px solid var(--surface-card-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                padding: '0.65rem 1rem 0.65rem 2.4rem',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !searchId.trim()}
            className="btn btn-primary"
            style={{ padding: '0.65rem 1.25rem', fontSize: '0.85rem' }}
          >
            <RefreshCw
              size={14}
              className={isLoading ? 'spin' : ''}
            />
            <span>{isLoading ? 'Querying...' : 'Fetch History'}</span>
          </button>
        </form>
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: 'var(--danger)',
            fontSize: '0.85rem',
          }}
        >
          <AlertTriangle size={18} color="var(--danger)" />
          <div>{error}</div>
        </div>
      )}

      {/* History Timeline */}
      {isLoading ? (
        <div
          className="glass-panel"
          style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            background: '#ffffff',
          }}
        >
          <RefreshCw
            size={28}
            className="spin"
            style={{ margin: '0 auto 1rem auto', color: 'var(--primary)' }}
          />
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            Retrieving messages from chat_history.sqlite3...
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            background: '#ffffff',
          }}
        >
          <History size={42} color="var(--text-muted)" style={{ opacity: 0.6 }} />
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.2rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                marginBottom: '0.35rem',
              }}
            >
              No Stored History Found
            </h3>
            <p
              style={{
                fontSize: '0.86rem',
                color: 'var(--text-secondary)',
                maxWidth: '480px',
                lineHeight: 1.5,
              }}
            >
              {hasQueried
                ? `No conversation turns were found for conversation_id "${searchId}". Turns are automatically committed when customers send inquiries.`
                : 'Enter a valid conversation UUID above or click "Current Active Session" to view past records.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenChat}
            className="btn btn-primary"
            style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}
          >
            <span>Start a Conversation in Chat</span>
            <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <span>
              Showing {messages.length} recorded turns for{' '}
              <code style={{ color: 'var(--primary)' }}>{searchId}</code>
            </span>

            <button
              type="button"
              onClick={handleResumeInChat}
              className="btn btn-primary"
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.76rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
              title="Continue this conversation in the AI Chat workspace"
            >
              <span>Resume in AI Chat</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const meta = parseMetadata(msg.metadata_json);

            return (
              <div
                key={msg.id}
                className="glass-panel"
                style={{
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                  borderLeft: isUser
                    ? '4px solid var(--primary)'
                    : '4px solid var(--mint)',
                  background: isUser ? '#ffffff' : 'var(--surface-card-subtle)',
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        background: isUser
                          ? 'var(--primary-soft)'
                          : 'var(--mint-soft)',
                        color: isUser ? 'var(--primary)' : 'var(--mint)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isUser ? <User size={13} /> : <Bot size={13} />}
                    </div>

                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '0.86rem',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {isUser ? 'Customer' : 'Nexus AI Assistant'}
                    </span>

                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Turn #{msg.id}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Clock size={11} />
                    <span>{msg.created_at}</span>
                  </div>
                </div>

                {/* Content */}
                <div
                  style={{
                    fontSize: '0.92rem',
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                </div>

                {/* Metadata badges if assistant */}
                {meta && (
                  <div
                    style={{
                      marginTop: '0.35rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid var(--surface-card-border)',
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.4rem',
                    }}
                  >
                    {meta.intent && (
                      <span className="badge badge-indigo">
                        Intent: {meta.intent}
                      </span>
                    )}
                    {meta.sentiment && (
                      <span className="badge badge-muted">
                        Sentiment: {meta.sentiment}
                      </span>
                    )}
                    {meta.requires_human_review && (
                      <span className="badge badge-warning">
                        <ShieldAlert size={10} /> Review Flagged
                      </span>
                    )}
                    {meta.sources && meta.sources.length > 0 && (
                      <span className="badge badge-cyan">
                        {meta.sources.length} RAG Sources
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
