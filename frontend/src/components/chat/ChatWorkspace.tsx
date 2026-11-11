import React, { useState, useRef, useEffect, useCallback, Suspense, lazy } from 'react';
import type { ChatTurn, MascotState, SupportedLanguage, AttachmentInfo, SupportTicket, ConversationSummary } from '../../types/chat';
import { useSpeechPlayback } from '../../hooks/useSpeechPlayback';
import {
  sendUnifiedChat,
  fetchConversationHistory,
  fetchConversationsList,
  requestHumanSupportApi,
  fetchCustomerSupportStatusApi,
  ApiError,
} from '../../services/api';
import { isWebGLAvailable } from '../../lib/webgl';
import { ChatMessageItem } from './ChatMessageItem';
import { ChatComposer } from './ChatComposer';
import { ClearConfirmModal } from './ClearConfirmModal';
import { ConversationHistorySidebar } from './ConversationHistorySidebar';
import { recordCustomerConversationId } from '../../lib/customerSession';
import { MascotFallback2D } from '../mascot/MascotFallback2D';
import {
  Sparkles,
  WifiOff,
  RefreshCw,
  CreditCard,
  AlertCircle,
  Repeat,
  ShieldCheck,
  Globe,
  Headphones,
  MessageSquare,
  Bot,
  Layers,
  CheckCircle2,
  Plus,
  Trash2,
  History,
  Download,
  ArrowRight,
  Activity,
  ChevronRight,
} from 'lucide-react';

// Lazy-load Three.js 3D canvas
const MascotCanvasLazy = lazy(() =>
  import('../mascot/MascotCanvas').then((mod) => ({ default: mod.MascotCanvas }))
);

interface ChatWorkspaceProps {
  conversationId: string;
  turns: ChatTurn[];
  onAddTurn: (turn: ChatTurn) => void;
  onClearTurns?: () => void;
  mascotState: MascotState;
  onSetMascotState: (state: MascotState) => void;
  isBackendOnline: boolean | null;
  onCheckHealth: () => void;
  onNewConversation?: () => void;
  onResumeConversation?: (conversationId: string, loadedTurns: ChatTurn[]) => void;
}

const CATEGORY_CARDS = [
  {
    id: 'card-account',
    title: 'Card & Account',
    desc: 'Block card, set limits, or account queries',
    icon: CreditCard,
    iconColor: '#38bdf8',
    iconBg: 'rgba(56, 189, 248, 0.12)',
    prompt: 'I need help with my debit card, blocking it, or checking account limits.',
  },
  {
    id: 'transactions',
    title: 'Transactions',
    desc: 'Track, dispute, or check status',
    icon: Repeat,
    iconColor: '#22d3ee',
    iconBg: 'rgba(34, 211, 238, 0.12)',
    prompt: 'How do I track or dispute an unauthorized charge on my account?',
  },
  {
    id: 'security',
    title: 'Security',
    desc: 'Login, password, OTP, or suspicious activity',
    icon: ShieldCheck,
    iconColor: '#a78bfa',
    iconBg: 'rgba(167, 139, 250, 0.12)',
    prompt: 'How can I reset my password, update OTP, or report suspicious login activity?',
  },
  {
    id: 'international',
    title: 'International',
    desc: 'Overseas transfers, exchange rates & fees',
    icon: Globe,
    iconColor: '#818cf8',
    iconBg: 'rgba(129, 140, 248, 0.12)',
    prompt: 'What are the overseas wire transfer fees, exchange rates, and settlement times?',
  },
  {
    id: 'human-support',
    title: 'Human Support',
    desc: 'Connect with a live specialist',
    icon: Headphones,
    iconColor: '#f472b6',
    iconBg: 'rgba(244, 114, 182, 0.12)',
    prompt: 'I would like to speak with a human support specialist regarding my account.',
  },
  {
    id: 'other-queries',
    title: 'Other Queries',
    desc: 'Interest rates, loans, and general FAQs',
    icon: MessageSquare,
    iconColor: '#c084fc',
    iconBg: 'rgba(192, 132, 252, 0.12)',
    prompt: 'What savings interest rates, loan options, and banking features are available?',
  },
];

const MASCOT_STATE_DESCRIPTIONS: Record<MascotState, string> = {
  idle: 'Nexus is standing by and ready to assist you.',
  listening: 'Nexus is listening to your voice input...',
  thinking: 'Nexus is thinking and preparing your response...',
  speaking: 'Delivering verified banking support information.',
  happy: 'Glad to help! Let me know if you need anything else.',
  confused: 'Could you please clarify your request?',
};

const EMOTION_PREVIEWS: Array<{ id: MascotState; label: string; desc: string }> = [
  { id: 'idle', label: 'Idle', desc: 'Natural breathing and neutral expression' },
  { id: 'listening', label: 'Listening', desc: 'Listening expression & alert posture' },
  { id: 'thinking', label: 'Thinking', desc: 'Thinking expression & analytical pulse' },
  { id: 'speaking', label: 'Speaking', desc: 'Mouth and speaking articulation' },
  { id: 'happy', label: 'Happy', desc: 'Friendly happy expression & smile' },
  { id: 'confused', label: 'Confused', desc: 'Confused facial expression & inquisitive tilt' },
];

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  conversationId,
  turns,
  onAddTurn,
  onClearTurns,
  mascotState,
  onSetMascotState,
  isBackendOnline,
  onCheckHealth,
  onNewConversation,
  onResumeConversation,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [composerLanguage, setComposerLanguage] = useState<SupportedLanguage>('auto');
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHandoffModalOpen, setIsHandoffModalOpen] = useState(false);
  const [handoffReason, setHandoffReason] = useState('');
  const [handoffCustomerName, setHandoffCustomerName] = useState('');
  const [isSubmittingHandoff, setIsSubmittingHandoff] = useState(false);
  const [supportTicket, setSupportTicket] = useState<SupportTicket | null>(null);
  const [force2D, setForce2D] = useState(false);
  const [recentConversations, setRecentConversations] = useState<ConversationSummary[]>([]);
  const [webGLSupported] = useState(() => isWebGLAvailable());

  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll strictly within messages container to prevent whole-window jumps
  useEffect(() => {
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTo({
        top: chatScrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [turns, isSubmitting]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Fetch recent conversations for left sidebar
  const loadRecentConversations = useCallback(async () => {
    try {
      const res = await fetchConversationsList({ limit: 4 });
      if (res && res.conversations) {
        setRecentConversations(res.conversations);
      }
    } catch {
      // Quiet fail if offline
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetchConversationsList({ limit: 4 });
        if (active && res && res.conversations) {
          setRecentConversations(res.conversations);
        }
      } catch {
        // Quiet fail
      }
    })();
    return () => {
      active = false;
    };
  }, [turns.length]);

  // Check support ticket status
  useEffect(() => {
    let isMounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let isForbidden = false;

    const pollTicketStatus = async () => {
      if (!conversationId || isForbidden) return;
      // Only poll when turns exist or when there is an active support ticket
      if (turns.length === 0 && !supportTicket) return;

      try {
        const res = await fetchCustomerSupportStatusApi(conversationId);
        if (isMounted && res.has_ticket && res.ticket) {
          setSupportTicket(res.ticket);
          if (res.ticket.status === 'resolved' || res.ticket.status === 'closed') {
            if (pollInterval) clearInterval(pollInterval);
          }
        }
      } catch (err: unknown) {
        if (err instanceof ApiError && (err.statusCode === 403 || err.statusCode === 401)) {
          // Stop unnecessary repeated polling when authorization fails
          isForbidden = true;
          if (pollInterval) clearInterval(pollInterval);
        }
      }
    };

    if (turns.length > 0 || supportTicket) {
      void pollTicketStatus();
      pollInterval = setInterval(pollTicketStatus, 20000);
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [conversationId, turns.length, supportTicket]);

  // Central Speech Playback Controller (Read Aloud Voice Output)
  const speech = useSpeechPlayback({
    onSpeakingChange: (isSpeaking) => {
      if (isSpeaking) {
        onSetMascotState('speaking');
      } else if (mascotState === 'speaking') {
        onSetMascotState('idle');
      }
    },
  });

  // Manual Emotion Preview State (Strictly visual preview, completely isolated from real mic/speech/TTS/API)
  const [previewMood, setPreviewMood] = useState<MascotState | null>(null);

  // Real events (AI generating/thinking, TTS speaking) strictly take priority over manual previews
  const isRealActivityActive = isSubmitting || speech.playbackState === 'playing';
  const effectiveMascotState: MascotState = isRealActivityActive
    ? mascotState
    : previewMood !== null
      ? previewMood
      : mascotState;

  // Handle Send unified inquiry
  const handleUnifiedSend = useCallback(
    async (text: string, attachments?: AttachmentInfo[], overrideLang?: SupportedLanguage) => {
      if (isSubmitting) return;

      const userText = text.trim();
      const atts = attachments || [];
      if (!userText && atts.length === 0) return;

      setErrorMessage(null);
      setIsSubmitting(true);
      onSetMascotState('thinking');

      const userTurn: ChatTurn = {
        id: `turn_u_${Date.now()}`,
        role: 'user',
        content: userText || `[Attached: ${atts.map((a) => a.filename).join(', ')}]`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        attachments: atts,
      };
      onAddTurn(userTurn);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const res = await sendUnifiedChat(
          userText,
          conversationId,
          abortController.signal,
          overrideLang || composerLanguage,
          atts?.map((a) => a.id)
        );

        if (res.conversation_id) {
          recordCustomerConversationId(res.conversation_id);
        }

        const assistantTurn: ChatTurn = {
          id: res.message_id || `turn_a_${Date.now()}`,
          role: 'assistant',
          content: res.response || "I'm sorry, I could not generate a response.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          intent: res.intent,
          sentiment: res.sentiment,
          requires_human_review: res.requires_human_review,
          retrievalSources: res.retrieval?.sources,
          generationMode: res.generation_mode,
          llmUsed: res.llm_used,
          suggestions: res.suggestions,
          category: res.category,
        };

        onAddTurn(assistantTurn);
        onSetMascotState('happy');
        setTimeout(() => {
          onSetMascotState('idle');
        }, 3500);

        void loadRecentConversations();
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const msg = err instanceof Error ? err.message : 'Failed to send message';
        setErrorMessage(msg);
        onSetMascotState('confused');
      } finally {
        setIsSubmitting(false);
        abortControllerRef.current = null;
      }
    },
    [isSubmitting, composerLanguage, conversationId, onAddTurn, onSetMascotState, loadRecentConversations]
  );

  // Handle Handoff Request Submission
  const handleRequestHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handoffReason.trim()) return;
    setIsSubmittingHandoff(true);
    try {
      const res = await requestHumanSupportApi({
        conversation_id: conversationId,
        reason: handoffReason.trim(),
        customer_name: handoffCustomerName.trim() || 'Customer',
        priority: 'high',
      });
      setSupportTicket(res.ticket);
      setIsHandoffModalOpen(false);
      setHandoffReason('');
      onSetMascotState('happy');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to request human support');
    } finally {
      setIsSubmittingHandoff(false);
    }
  };

  const handleExportChat = useCallback(() => {
    if (turns.length === 0) return;
    let transcript = `Nexus AI Support - Conversation Transcript\nConversation ID: ${conversationId}\nExported: ${new Date().toISOString()}\n\n`;
    for (const t of turns) {
      const sender = t.role === 'user' ? 'Customer' : 'Nexus AI Support';
      transcript += `[${t.timestamp || 'Unknown'}] ${sender}:\n${t.content}\n\n`;
      if (t.attachments && t.attachments.length > 0) {
        transcript += `Attachments: ${t.attachments.map((a) => a.filename).join(', ')}\n\n`;
      }
    }
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus_chat_${conversationId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [conversationId, turns]);

  // Handle Resuming an Existing Conversation from History Sidebar
  const handleResumeConversation = useCallback(
    async (resumedId: string) => {
      try {
        const hist = await fetchConversationHistory(resumedId);
        if (hist && hist.messages) {
          const loadedTurns: ChatTurn[] = hist.messages.map((m, idx) => ({
            id: String(m.id || `hist_${idx}`),
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.created_at
              ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            attachments: m.attachments,
            human_agent: m.human_agent,
            agent_name: m.agent_name,
            suggestions: m.suggestions,
            category: m.category,
          }));

          if (onResumeConversation) {
            onResumeConversation(resumedId, loadedTurns);
          }
          setIsSidebarOpen(false);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to resume conversation';
        setErrorMessage(msg);
      }
    },
    [onResumeConversation]
  );

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '0.4rem 0.75rem',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* Backend Offline Warning Banner */}
      {isBackendOnline === false && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.14)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '10px',
            padding: '0.45rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#f87171',
            fontSize: '0.78rem',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <WifiOff size={14} />
            <span>Backend service is offline. AI responses will operate in fallback mode.</span>
          </div>
          <button
            type="button"
            onClick={onCheckHealth}
            style={{
              background: 'none',
              border: 'none',
              color: '#38bdf8',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.76rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.14)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '10px',
            padding: '0.45rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#fbbf24',
            fontSize: '0.78rem',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={14} />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            style={{ background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', fontWeight: 600, fontSize: '0.74rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3-COLUMN COMPACT MASTER WORKSPACE (Zyricon Purple Glassmorphism)       */}
      {/* ===================================================================== */}
      <div
        className="nexus-ai-workspace-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '200px minmax(0, 1fr) 260px',
          gap: '0.85rem',
          alignItems: 'stretch',
          height: '100%',
          minHeight: 0,
          flex: 1,
        }}
      >
        {/* =================================================================== */}
        {/* PANEL 1: LEFT SIDEBAR (Compact: New Chat, Conversations, Recent)    */}
        {/* =================================================================== */}
        <div
          className="nexus-workspace-sidebar"
          style={{
            background: 'linear-gradient(180deg, #070c1e 0%, #050917 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '0.85rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* + New Chat CTA Button */}
            <button
              type="button"
              onClick={() => {
                if (onNewConversation) onNewConversation();
              }}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                boxShadow: '0 3px 14px rgba(124, 58, 237, 0.4)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 18px rgba(124, 58, 237, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 3px 14px rgba(124, 58, 237, 0.4)';
              }}
            >
              <Plus size={15} />
              <span>New Chat</span>
            </button>

            {/* Navigation Category Items (Simplified to functional items only) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  padding: '0.5rem 0.65rem',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#cbd5e1',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <MessageSquare size={14} color="#818cf8" />
                <span>Conversations</span>
              </button>

              <button
                type="button"
                onClick={() => setIsHandoffModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  padding: '0.5rem 0.65rem',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Headphones size={14} color="#ec4899" />
                <span>Support Tickets</span>
                {supportTicket && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#10b981',
                    }}
                  />
                )}
              </button>
            </div>

            {/* RECENT CONVERSATIONS SECTION */}
            <div style={{ marginTop: '0.35rem' }}>
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#64748b',
                  marginBottom: '0.45rem',
                  paddingLeft: '0.4rem',
                }}
              >
                Recent
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {recentConversations.length > 0 ? (
                  recentConversations.slice(0, 4).map((c) => (
                    <button
                      key={c.conversation_id}
                      type="button"
                      onClick={() => handleResumeConversation(c.conversation_id)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        padding: '0.45rem 0.55rem',
                        borderRadius: '8px',
                        background: c.conversation_id === conversationId ? 'rgba(124, 58, 237, 0.18)' : 'transparent',
                        border: c.conversation_id === conversationId ? '1px solid rgba(124, 58, 237, 0.35)' : 'none',
                        color: c.conversation_id === conversationId ? '#ffffff' : '#94a3b8',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          c.conversation_id === conversationId ? 'rgba(124, 58, 237, 0.18)' : 'transparent')
                      }
                    >
                      <MessageSquare size={13} style={{ marginTop: '2px', flexShrink: 0, color: '#818cf8' }} />
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.78rem' }}>{c.title || 'Banking Inquiry'}</div>
                        <div style={{ fontSize: '0.66rem', color: '#64748b' }}>
                          {c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Active'}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        padding: '0.4rem 0.5rem',
                        borderRadius: '8px',
                        color: '#94a3b8',
                        fontSize: '0.78rem',
                      }}
                    >
                      <MessageSquare size={13} style={{ marginTop: '2px', flexShrink: 0, color: '#818cf8' }} />
                      <div>
                        <div style={{ fontWeight: 600, color: '#cbd5e1' }}>Lost my debit card</div>
                        <div style={{ fontSize: '0.66rem', color: '#64748b' }}>2 hours ago</div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        padding: '0.4rem 0.5rem',
                        borderRadius: '8px',
                        color: '#94a3b8',
                        fontSize: '0.78rem',
                      }}
                    >
                      <MessageSquare size={13} style={{ marginTop: '2px', flexShrink: 0, color: '#818cf8' }} />
                      <div>
                        <div style={{ fontWeight: 600, color: '#cbd5e1' }}>Transaction inquiry</div>
                        <div style={{ fontSize: '0.66rem', color: '#64748b' }}>Yesterday</div>
                      </div>
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#818cf8',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: '0.3rem 0.5rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    marginTop: '0.2rem',
                  }}
                >
                  <span>View All</span>
                  <ChevronRight size={11} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* PANEL 2: CENTER CHAT WORKSPACE (Welcome State & Message Stream)     */}
        {/* =================================================================== */}
        <div
          className="nexus-workspace-chat"
          style={{
            background: 'linear-gradient(180deg, #090e22 0%, #070a19 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
            height: '100%',
            minHeight: 0,
          }}
        >
          {/* Workspace Top Header Bar - Compact */}
          <div
            style={{
              padding: '0.65rem 1rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
              background: 'rgba(10, 16, 36, 0.65)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <button
                type="button"
                className="nexus-mobile-sidebar-toggle"
                onClick={() => setIsSidebarOpen(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '0.4rem',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  display: 'none',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Open Conversation History"
                aria-label="Open History"
              >
                <History size={14} />
              </button>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'rgba(124, 58, 237, 0.2)',
                  border: '1px solid rgba(124, 58, 237, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a78bfa',
                }}
              >
                <Activity size={15} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#ffffff', letterSpacing: '-0.01em' }}>
                  AI Assistant
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  Banking support intelligence
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Verified Banking Intelligence Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '9999px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={12} />
                <span>Verified</span>
              </div>

              {turns.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleExportChat}
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#cbd5e1',
                      borderRadius: '6px',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                    title="Export transcript as text"
                  >
                    <Download size={11} />
                    <span>Export</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsClearModalOpen(true)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                      borderRadius: '6px',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                    title="Clear current turns"
                  >
                    <Trash2 size={11} />
                    <span>Clear</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Messages & Welcome State Scroll Area */}
          <div
            ref={chatScrollContainerRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              minHeight: 0,
            }}
            role="log"
            aria-live="polite"
          >
            {/* WELCOME HERO & 2x3 COMPACT CATEGORY CARDS (Zyricon Purple Glass) */}
            {turns.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  margin: 'auto 0',
                  padding: '0.4rem 0.5rem',
                }}
              >
                {/* Glowing Radiant Star in Center - Compact */}
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(139, 92, 246, 0.45) 0%, rgba(99, 102, 241, 0.15) 70%, transparent 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    marginBottom: '0.5rem',
                    boxShadow: '0 0 20px rgba(139, 92, 246, 0.55)',
                  }}
                >
                  <Sparkles size={20} color="#ffffff" />
                </div>

                {/* Welcome Heading - Compact */}
                <h2
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                    margin: '0 0 0.2rem 0',
                  }}
                >
                  Welcome to Nexus AI
                </h2>

                <p
                  style={{
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    maxWidth: '480px',
                    lineHeight: 1.4,
                    margin: '0 0 1rem 0',
                  }}
                >
                  Your intelligent assistant for banking queries, cards, payments, and account security.
                </p>

                {/* 2x3 COMPACT CATEGORY CARDS GRID */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.65rem',
                    width: '100%',
                    maxWidth: '740px',
                  }}
                >
                  {CATEGORY_CARDS.map((card) => {
                    const IconComp = card.icon;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => {
                          if (card.id === 'human-support') {
                            setIsHandoffModalOpen(true);
                          } else {
                            handleUnifiedSend(card.prompt);
                          }
                        }}
                        style={{
                          background: 'rgba(15, 23, 42, 0.65)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          padding: '0.75rem 0.85rem',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.35rem',
                          position: 'relative',
                          transition: 'all 0.15s ease',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.45)';
                          e.currentTarget.style.background = 'rgba(20, 29, 56, 0.85)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(124, 58, 237, 0.25)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                          e.currentTarget.style.background = 'rgba(15, 23, 42, 0.65)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.25)';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: card.iconBg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: card.iconColor,
                            }}
                          >
                            <IconComp size={15} />
                          </div>
                          <ArrowRight size={13} color="#64748b" />
                        </div>

                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#ffffff', marginBottom: '0.15rem' }}>
                            {card.title}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.3 }}>
                            {card.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* CONVERSATION TURNS STREAM */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {turns.map((turn, idx) => (
                  <ChatMessageItem
                    key={turn.id}
                    turn={turn}
                    conversationId={conversationId}
                    isLatestAssistant={idx === turns.length - 1 && turn.role === 'assistant'}
                    onSelectSuggestion={(sug) => void handleUnifiedSend(sug)}
                    onRegenerate={
                      idx === turns.length - 1 && turn.role === 'assistant'
                        ? () => {
                            const lastUserTurn = [...turns].reverse().find((t) => t.role === 'user');
                            if (lastUserTurn) {
                              handleUnifiedSend(lastUserTurn.content);
                            }
                          }
                        : undefined
                    }
                    activeSpeechMessageId={speech.activeMessageId}
                    speechPlaybackState={speech.playbackState}
                    speechSpeed={speech.playbackSpeed}
                    isSpeechSupported={speech.isSupported}
                    onPlaySpeech={speech.play}
                    onPauseSpeech={speech.pause}
                    onResumeSpeech={speech.resume}
                    onStopSpeech={speech.stop}
                    onSetSpeechSpeed={speech.setSpeed}
                  />
                ))}

                {/* Live Thinking Status Indicator */}
                {isSubmitting && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.75rem 1rem',
                      background: 'rgba(124, 58, 237, 0.12)',
                      border: '1px solid rgba(124, 58, 237, 0.3)',
                      borderRadius: '14px',
                      color: '#a78bfa',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      width: 'fit-content',
                    }}
                  >
                    <span className="spin" style={{ display: 'inline-block' }}>⏳</span>
                    <span>Nexus is thinking and preparing your response...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* DOCKED CHAT COMPOSER AT BOTTOM (Pinned - Always Visible) */}
          <div
            style={{
              padding: '0.5rem 0.85rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(7, 10, 24, 0.95)',
              backdropFilter: 'blur(16px)',
              flexShrink: 0,
            }}
          >
            <ChatComposer
              conversationId={conversationId}
              onSendMessage={async (msg, atts) => {
                await handleUnifiedSend(msg, atts);
              }}
              isSubmitting={isSubmitting}
              onStopRequest={() => abortControllerRef.current?.abort()}
              language={composerLanguage}
              onLanguageChange={setComposerLanguage}
              onVoiceStateChange={(status) => {
                if (status === 'listening') onSetMascotState('listening');
                else if (mascotState === 'listening') onSetMascotState('idle');
              }}
            />
          </div>
        </div>

        {/* =================================================================== */}
        {/* PANEL 3: RIGHT COMPANION PANEL (3D Nexus Robot Mascot)              */}
        {/* =================================================================== */}
        <div
          className="nexus-workspace-companion"
          style={{
            background: 'linear-gradient(180deg, #080d20 0%, #060918 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '0.85rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
          }}
        >
          {/* Header Row: Nexus Companion + 2D/3D Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #38bdf8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
              >
                <Bot size={14} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#ffffff' }}>Nexus AI</div>
                <div style={{ fontSize: '0.68rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }} />
                  <span>Online</span>
                </div>
              </div>
            </div>

            {webGLSupported && (
              <button
                type="button"
                onClick={() => setForce2D((p) => !p)}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '9999px',
                  padding: '0.2rem 0.45rem',
                  color: '#94a3b8',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <Layers size={10} />
                <span>{force2D ? '3D' : '2D'}</span>
              </button>
            )}
          </div>

          {/* 3D Robot Mascot Stage with Concentric Futuristic Pedestal Disc - Compact */}
          <div
            style={{
              width: '100%',
              flex: 1,
              minHeight: '170px',
              maxHeight: '220px',
              position: 'relative',
              borderRadius: '12px',
              background: 'radial-gradient(circle at center 60%, rgba(30, 41, 79, 0.45) 0%, rgba(8, 13, 32, 0.8) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Glowing Concentric Futuristic Pedestal Disc */}
            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '140px',
                height: '30px',
                borderRadius: '50%',
                background: 'radial-gradient(ellipse at center, rgba(56, 189, 248, 0.35) 0%, rgba(124, 58, 237, 0.2) 50%, transparent 80%)',
                border: '1.5px solid rgba(56, 189, 248, 0.55)',
                boxShadow: '0 0 16px rgba(56, 189, 248, 0.45)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '95px',
                height: '18px',
                borderRadius: '50%',
                background: 'radial-gradient(ellipse at center, rgba(14, 165, 233, 0.65) 0%, rgba(99, 102, 241, 0.3) 60%, transparent 85%)',
                border: '1px solid rgba(125, 211, 252, 0.7)',
                boxShadow: '0 0 12px rgba(56, 189, 248, 0.7)',
                pointerEvents: 'none',
              }}
            />

            {!force2D && webGLSupported ? (
              <Suspense fallback={<MascotFallback2D state={effectiveMascotState} size={160} />}>
                <MascotCanvasLazy state={effectiveMascotState} fullBody={true} minHeight="100%" />
              </Suspense>
            ) : (
              <MascotFallback2D state={effectiveMascotState} size={160} />
            )}
          </div>

          {/* Simple Dynamic Speech Status Bubble */}
          <div
            style={{
              padding: '0.45rem 0.65rem',
              borderRadius: '10px',
              background: 'rgba(12, 18, 38, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#e2e8f0',
              fontSize: '0.75rem',
              fontWeight: 500,
              textAlign: 'center',
              lineHeight: 1.35,
            }}
          >
            {previewMood !== null && !isRealActivityActive
              ? `Preview: ${EMOTION_PREVIEWS.find((e) => e.id === previewMood)?.desc || previewMood}`
              : turns.length === 0
                ? '"How can I help you today?"'
                : MASCOT_STATE_DESCRIPTIONS[effectiveMascotState]}
          </div>

          {/* Six Emotion Preview Buttons Directly Below Robot */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 0.15rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.64rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#64748b',
                  fontWeight: 700,
                }}
              >
                Emotion Controls
              </span>
              {previewMood !== null && (
                <button
                  type="button"
                  onClick={() => setPreviewMood(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                  }}
                  title="Return to automatic mode"
                >
                  <span>↺ Auto Mode</span>
                </button>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.35rem',
              }}
            >
              {EMOTION_PREVIEWS.map((emotion) => {
                const isSelected =
                  previewMood === emotion.id ||
                  (previewMood === null && effectiveMascotState === emotion.id);

                return (
                  <button
                    key={emotion.id}
                    type="button"
                    onClick={() => {
                      if (previewMood === emotion.id) {
                        setPreviewMood(null); // Return to auto mode on toggle
                      } else {
                        setPreviewMood(emotion.id);
                      }
                    }}
                    style={{
                      padding: '0.32rem 0.45rem',
                      borderRadius: '8px',
                      fontSize: '0.70rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      border: isSelected
                        ? '1px solid #a855f7'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      background: isSelected
                        ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.4) 0%, rgba(56, 189, 248, 0.25) 100%)'
                        : 'rgba(255, 255, 255, 0.035)',
                      color: isSelected ? '#ffffff' : '#94a3b8',
                      boxShadow: isSelected ? '0 0 10px rgba(168, 85, 247, 0.35)' : 'none',
                      textAlign: 'center',
                    }}
                    title={`${emotion.label}: ${emotion.desc}`}
                    aria-label={`Preview ${emotion.label} emotion`}
                  >
                    {emotion.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compact Trust Guarantee */}
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              paddingTop: '0.45rem',
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              color: '#94a3b8',
              fontSize: '0.70rem',
            }}
          >
            <CheckCircle2 size={12} color="#34d399" />
            <span>24/7 Verified Banking Intelligence</span>
          </div>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      {isClearModalOpen && (
        <ClearConfirmModal
          isOpen={isClearModalOpen}
          onConfirm={() => {
            if (onClearTurns) onClearTurns();
            setIsClearModalOpen(false);
          }}
          onClose={() => setIsClearModalOpen(false)}
          messageCount={turns.length}
        />
      )}

      {/* Full Conversation History Drawer / Modal */}
      <ConversationHistorySidebar
        activeConversationId={conversationId}
        onSelectConversation={handleResumeConversation}
        onNewConversation={() => {
          if (onNewConversation) onNewConversation();
          setIsSidebarOpen(false);
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isMobile={true}
      />

      {/* Human Support Escalation Request Modal */}
      {isHandoffModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1.5rem',
          }}
          onClick={() => setIsHandoffModalOpen(false)}
        >
          <div
            style={{
              background: '#0d1527',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              padding: '2rem',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: 'rgba(236, 72, 153, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ec4899',
                }}
              >
                <Headphones size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
                  Request Human Specialist Support
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Escalate this inquiry to a senior banking support representative
                </div>
              </div>
            </div>

            <form onSubmit={handleRequestHandoff} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Your Name (Optional)
                </label>
                <input
                  type="text"
                  value={handoffCustomerName}
                  onChange={(e) => setHandoffCustomerName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Reason for Support Escalation *
                </label>
                <textarea
                  required
                  rows={3}
                  value={handoffReason}
                  onChange={(e) => setHandoffReason(e.target.value)}
                  placeholder="Describe your issue or what assistance you need from our staff..."
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsHandoffModalOpen(false)}
                  style={{
                    padding: '0.7rem 1.25rem',
                    borderRadius: '10px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingHandoff}
                  style={{
                    padding: '0.7rem 1.5rem',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                    border: 'none',
                    color: '#ffffff',
                    cursor: isSubmittingHandoff ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                  }}
                >
                  {isSubmittingHandoff ? 'Submitting...' : 'Submit Support Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWorkspace;
