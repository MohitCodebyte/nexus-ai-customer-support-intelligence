import React, { useState, useEffect, useCallback } from 'react';
import type { ConversationSummary } from '../../types/chat';
import { fetchConversationsList, renameConversationApi, deleteConversationApi } from '../../services/api';
import { recordCustomerConversationId } from '../../lib/customerSession';
import {
  MessageSquare,
  Search,
  Plus,
  Clock,
  RefreshCw,
  X,
  PanelLeftClose,
  ChevronDown,
  Layers,
  Pencil,
  Trash2,
} from 'lucide-react';

interface ConversationHistorySidebarProps {
  activeConversationId: string;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  isOpen: boolean;
  onClose: () => void;
  isMobile?: boolean;
}

export const ConversationHistorySidebar: React.FC<ConversationHistorySidebarProps> = ({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  isOpen,
  onClose,
  isMobile = false,
}) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const PAGE_SIZE = 12;

  // Make sure current active conversation is registered to customer
  useEffect(() => {
    if (activeConversationId) {
      recordCustomerConversationId(activeConversationId);
    }
  }, [activeConversationId]);

  // Load conversations scoped strictly to customer's server-verified session
  const loadConversations = useCallback(
    async (reset = false, search = searchQuery) => {
      if (reset) {
        setIsLoading(true);
        setOffset(0);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const nextOffset = reset ? 0 : offset;
        const resp = await fetchConversationsList({
          search: search.trim() || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });

        if (reset) {
          setConversations(resp.conversations);
        } else {
          setConversations((prev) => [...prev, ...resp.conversations]);
        }
        setTotalCount(resp.total);
        setHasMore(resp.has_more);
        setOffset(nextOffset + resp.conversations.length);
      } catch (err) {
        console.warn('Failed to load customer conversations:', err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [offset, searchQuery]
  );

  // Initial load when opened
  useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      Promise.resolve().then(() => {
        if (isMounted) setIsLoading(true);
      });
      fetchConversationsList({
        limit: PAGE_SIZE,
        offset: 0,
      })
        .then((resp) => {
          if (isMounted) {
            setConversations(resp.conversations);
            setTotalCount(resp.total);
            setHasMore(resp.has_more);
            setOffset(resp.conversations.length);
          }
        })
        .catch((err) => {
          console.warn('Initial conversations fetch error:', err);
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Handle Search Input Change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    void loadConversations(true, query);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    void loadConversations(true, '');
  };

  // Load More / Pagination
  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      void loadConversations(false);
    }
  };

  // Format timestamp nicely
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const handlePromptRename = async (convId: string, currentTitle: string) => {
    const newTitle = window.prompt('Enter new conversation title:', currentTitle);
    if (!newTitle || !newTitle.trim() || newTitle.trim() === currentTitle) return;
    try {
      await renameConversationApi(convId, newTitle.trim());
      setConversations((prev) =>
        prev.map((c) => (c.conversation_id === convId ? { ...c, title: newTitle.trim() } : c))
      );
    } catch {
      // silent
    }
  };

  const handlePromptDelete = async (convId: string) => {
    if (!window.confirm('Are you sure you want to delete this conversation? This will permanently remove its message transcript and attachments.')) return;
    try {
      await deleteConversationApi(convId);
      setConversations((prev) => prev.filter((c) => c.conversation_id !== convId));
      setTotalCount((prev) => Math.max(0, prev - 1));
      if (convId === activeConversationId) {
        onNewConversation();
      }
    } catch {
      // silent
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobile && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 90,
          }}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className="glass-panel"
        style={{
          width: isMobile ? '85vw' : '285px',
          maxWidth: '340px',
          height: isMobile ? '100%' : 'auto',
          position: isMobile ? 'fixed' : 'relative',
          top: isMobile ? 0 : 'auto',
          left: isMobile ? 0 : 'auto',
          zIndex: isMobile ? 100 : 1,
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: isMobile ? '0 var(--radius-xl) var(--radius-xl) 0' : 'var(--radius-xl)',
          border: '1px solid var(--surface-card-border)',
          boxShadow: isMobile ? 'var(--shadow-xl)' : 'var(--shadow-sm)',
          overflow: 'hidden',
          transition: 'all 0.25s ease',
        }}
        aria-label="Conversation History Sidebar"
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.15rem',
            borderBottom: '1px solid var(--surface-card-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #ffffff 0%, var(--bg-secondary) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--primary-soft)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MessageSquare size={15} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                Conversations
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {totalCount} {totalCount === 1 ? 'saved chat' : 'saved chats'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              type="button"
              onClick={onNewConversation}
              className="btn btn-secondary"
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.74rem',
                borderRadius: 'var(--radius-md)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                color: 'var(--primary)',
                background: '#ffffff',
              }}
              title="Start a new chat conversation"
              aria-label="New chat"
            >
              <Plus size={13} />
              <span>New</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost"
              style={{
                padding: '0.3rem',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)',
              }}
              title="Close history sidebar"
              aria-label="Close history sidebar"
            >
              {isMobile ? <X size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '0.75rem 0.9rem', borderBottom: '1px solid var(--surface-card-border)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.65rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--surface-card-border)',
            }}
          >
            <Search size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search conversations..."
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '0.8rem',
                color: 'var(--text-primary)',
                width: '100%',
              }}
              aria-label="Search previous conversations"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                }}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Conversations Scroll List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.65rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
            maxHeight: isMobile ? 'calc(100vh - 170px)' : '580px',
          }}
          role="list"
          aria-label="Previous chat conversations"
        >
          {isLoading && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <RefreshCw size={16} className="spin-animation" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem auto' }} />
              Loading history...
            </div>
          )}

          {!isLoading && conversations.length === 0 && (
            <div
              style={{
                padding: '2.5rem 1rem',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Clock size={24} color="var(--text-muted)" />
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {searchQuery ? 'No matching chats found' : 'No previous conversations'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {searchQuery ? 'Try a different search term.' : 'Your active and previous chat history will appear here.'}
              </div>
            </div>
          )}

          {!isLoading &&
            conversations.map((item) => {
              const isActive = item.conversation_id === activeConversationId;
              return (
                <button
                  key={item.conversation_id}
                  type="button"
                  onClick={() => {
                    onSelectConversation(item.conversation_id);
                    if (isMobile) onClose();
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: isActive ? '1px solid var(--primary)' : '1px solid transparent',
                    background: isActive ? 'var(--primary-soft)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--bg-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                  role="listitem"
                  aria-current={isActive ? 'true' : undefined}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div
                      style={{
                        fontWeight: isActive ? 700 : 600,
                        fontSize: '0.82rem',
                        color: isActive ? 'var(--primary)' : 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {item.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {isActive && (
                        <span
                          style={{
                            fontSize: '0.64rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.35rem',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--primary)',
                            color: '#ffffff',
                            flexShrink: 0,
                          }}
                        >
                          Active
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePromptRename(item.conversation_id, item.title);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '0.15rem',
                          borderRadius: 'var(--radius-sm)',
                        }}
                        title="Rename conversation"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePromptDelete(item.conversation_id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '0.15rem',
                          borderRadius: 'var(--radius-sm)',
                        }}
                        title="Delete conversation"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.35,
                    }}
                  >
                    {item.last_message || 'Empty conversation'}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.66rem',
                      color: 'var(--text-muted)',
                      marginTop: '0.15rem',
                    }}
                  >
                    <span>{formatTime(item.last_updated || item.created_at)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                      <Layers size={10} />
                      {item.message_count} msgs
                    </span>
                  </div>
                </button>
              );
            })}

          {/* Pagination / Lazy Load More */}
          {hasMore && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="btn btn-secondary"
              style={{
                width: '100%',
                padding: '0.45rem',
                fontSize: '0.74rem',
                borderRadius: 'var(--radius-md)',
                marginTop: '0.4rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
              }}
            >
              {isLoadingMore ? (
                <>
                  <RefreshCw size={12} className="spin-animation" style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Loading more...</span>
                </>
              ) : (
                <>
                  <ChevronDown size={13} />
                  <span>Load earlier chats ({conversations.length} of {totalCount})</span>
                </>
              )}
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
