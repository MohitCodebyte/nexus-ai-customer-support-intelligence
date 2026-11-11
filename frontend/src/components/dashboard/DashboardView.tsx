import React from 'react';
import type { ChatTurn, MascotState, ActiveSessionStats } from '../../types/chat';
import { MascotController } from '../mascot/MascotController';
import {
  MessageSquare,
  Sparkles,
  Server,
  Activity,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle,
  BarChart3,
  History,
} from 'lucide-react';

interface DashboardViewProps {
  onOpenChat: () => void;
  onOpenHistory?: () => void;
  onOpenInsights?: () => void;
  onNewSession?: () => void;
  isBackendOnline: boolean | null;
  backendLatency?: number;
  conversationId: string;
  turns: ChatTurn[];
  sessionStats: ActiveSessionStats;
  mascotState: MascotState;
  onSetMascotState: (state: MascotState) => void;
}

const BANKING_DOMAINS = [
  { name: 'Card Services', count: 18, desc: 'Lost/stolen cards, PIN changes, activations', color: 'var(--primary)' },
  { name: 'Transfers & Payments', count: 15, desc: 'International wire, direct debit, fee structures', color: 'var(--secondary)' },
  { name: 'Account & Security', count: 24, desc: 'Password reset, MFA tokens, address updates', color: 'var(--mint)' },
  { name: 'Disputes & Refunds', count: 20, desc: 'Zero-liability claims, unrecognized charges', color: '#f59e0b' },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenChat,
  onOpenHistory,
  onOpenInsights,
  onNewSession,
  isBackendOnline,
  backendLatency,
  conversationId,
  turns,
  sessionStats,
  mascotState,
  onSetMascotState,
}) => {
  const recentTurns = turns.slice(-4);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        width: '100%',
        maxWidth: '1360px',
        margin: '0 auto',
      }}
    >
      {/* ================================================================= */}
      {/* 1. HERO SHOWCASE BANNER (Balanced proportions, matching Image 3)   */}
      {/* ================================================================= */}
      <div
        className="glass-panel"
        style={{
          padding: '1.4rem 1.85rem',
          borderRadius: 'var(--radius-xl)',
          background: 'linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%)',
          border: '1px solid #dbeafe',
          boxShadow: 'var(--shadow-md)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 1fr)',
          gap: '2rem',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary-soft)',
              border: '1px solid rgba(79, 125, 243, 0.25)',
              color: 'var(--primary)',
              fontSize: '0.78rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '0.85rem',
            }}
          >
            <Sparkles size={13} />
            Next-Gen Customer Support AI
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.25rem',
              fontWeight: 800,
              lineHeight: 1.18,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: '0.85rem',
            }}
          >
            Delight Customers with{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Intelligent 3D AI
            </span>
          </h1>

          <p
            style={{
              fontSize: '0.94rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              maxWidth: '560px',
              marginBottom: '1.35rem',
            }}
          >
            Nexus pairs real-time Banking77 intent classification with semantic vector FAQ retrieval (RAG)
            and calibrated safety gating to deliver instant, verifiable, zero-hallucination customer support.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onOpenChat}
              className="btn btn-primary"
              style={{
                padding: '0.75rem 1.45rem',
                fontSize: '0.92rem',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <MessageSquare size={17} />
              <span>Launch AI Chat Workspace</span>
              <ArrowRight size={15} />
            </button>

            {onNewSession && (
              <button
                type="button"
                onClick={onNewSession}
                className="btn btn-secondary"
                style={{
                  padding: '0.75rem 1.15rem',
                  fontSize: '0.9rem',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <Zap size={15} color="var(--primary)" />
                <span>New Session</span>
              </button>
            )}

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                fontWeight: 500,
                marginLeft: '0.25rem',
              }}
            >
              <CheckCircle size={15} color="var(--success)" />
              <span>Calibrated Cosine Similarity Gating</span>
            </div>
          </div>
        </div>

        {/* Mascot Showcase Stage (matching Image 3) */}
        <div style={{ width: '100%' }}>
          <MascotController
            currentState={mascotState}
            onStateChange={onSetMascotState}
            showControls={true}
            size="hero"
          />
        </div>
      </div>

      {/* ================================================================= */}
      {/* 2. LIVE TELEMETRY STRIP (4 Key Metrics Cards)                     */}
      {/* ================================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.15rem',
        }}
      >
        {/* Metric 1: Backend Engine Status */}
        <div
          className="glass-panel"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              BACKEND ENGINE
            </span>
            <div style={{ padding: '0.35rem', borderRadius: '8px', background: 'var(--primary-soft)' }}>
              <Server size={15} color="var(--primary)" />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              className={`status-dot ${
                isBackendOnline
                  ? 'online'
                  : isBackendOnline === false
                  ? 'offline'
                  : 'checking'
              }`}
            />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                fontWeight: 800,
                color: isBackendOnline
                  ? 'var(--success)'
                  : isBackendOnline === false
                  ? 'var(--danger)'
                  : 'var(--warning)',
              }}
            >
              {isBackendOnline
                ? 'Flask API Live'
                : isBackendOnline === false
                ? 'Offline (Port 5000)'
                : 'Probing Engine...'}
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {isBackendOnline
              ? `Unified chat & intent routes online (${backendLatency ?? 0}ms latency).`
              : 'Flask is currently not running. Start via "python -m app.app".'}
          </p>
        </div>

        {/* Metric 2: Active Session Turns */}
        <div
          className="glass-panel"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              SESSION TURNS
            </span>
            <div style={{ padding: '0.35rem', borderRadius: '8px', background: 'var(--mint-soft)' }}>
              <Activity size={15} color="var(--mint)" />
            </div>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.65rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
            }}
          >
            {sessionStats.totalTurns}
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '0.5rem' }}>
              ({sessionStats.userMessages} user / {sessionStats.aiResponses} AI)
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Session ID: <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{conversationId.slice(0, 8)}...</code>
          </p>
        </div>

        {/* Metric 3: Safety Gating Flags */}
        <div
          className="glass-panel"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              SAFETY GATING
            </span>
            <div style={{ padding: '0.35rem', borderRadius: '8px', background: 'var(--warning-bg)' }}>
              <ShieldCheck size={15} color="var(--warning)" />
            </div>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.65rem',
              fontWeight: 800,
              color: sessionStats.humanReviewCount > 0 ? 'var(--warning)' : 'var(--success)',
            }}
          >
            {sessionStats.humanReviewCount}{' '}
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              escalated reviews
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Cosine similarity thresholding prevents AI hallucinations automatically.
          </p>
        </div>

        {/* Metric 4: Banking77 Coverage */}
        <div
          className="glass-panel"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              CLASSIFIER SCOPE
            </span>
            <div style={{ padding: '0.35rem', borderRadius: '8px', background: 'var(--secondary-soft)' }}>
              <Zap size={15} color="var(--secondary)" />
            </div>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.65rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
            }}
          >
            77 Intents
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '0.5rem' }}>
              in 4 domains
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Fine-tuned semantic encoder mapped to verified bank documentation.
          </p>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 3. CAPABILITIES & QUICK LAUNCHPAD GRID (Fills Unused Space)       */}
      {/* ================================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
          gap: '1.5rem',
        }}
        className="dashboard-columns-grid"
      >
        {/* Left Column: Intent Coverage & Recent Turns */}
        <div
          className="glass-panel"
          style={{
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            background: '#ffffff',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Banking77 Intent Domain Coverage
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>77 Classes Active</span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              The intent engine classifies incoming customer utterances into fine-grained financial domains:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {BANKING_DOMAINS.map((domain) => (
                <div
                  key={domain.name}
                  style={{
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--surface-card-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.86rem', color: domain.color }}>
                      {domain.name}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#ffffff' }}>
                      {domain.count} intents
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                    {domain.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Session Activity Feed */}
          <div style={{ borderTop: '1px solid var(--surface-card-border)', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Recent Session Turns
              </h4>
              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenChat}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.74rem', padding: '0.2rem 0.55rem' }}
                >
                  <span>View All in Chat</span>
                  <ArrowRight size={11} />
                </button>
              )}
            </div>

            {recentTurns.length === 0 ? (
              <div
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  background: 'var(--bg-primary)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-secondary)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.86rem', marginBottom: '0.25rem' }}>
                  No messages in active session yet
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Open the AI Chat Workspace to submit customer queries and view real-time intent classifications.
                </div>
                <button
                  type="button"
                  onClick={onOpenChat}
                  className="btn btn-primary"
                  style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem' }}
                >
                  <MessageSquare size={13} />
                  <span>Start First Conversation</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {recentTurns.map((turn) => (
                  <div
                    key={turn.id}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      background: turn.role === 'user' ? 'var(--primary-soft)' : '#ffffff',
                      border: '1px solid var(--surface-card-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: turn.role === 'user' ? 'var(--primary)' : 'var(--text-muted)',
                        }}
                      >
                        {turn.role}:
                      </span>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {turn.content}
                      </span>
                    </div>

                    {turn.intent && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--bg-secondary)',
                          color: 'var(--primary)',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {turn.intent.intent}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Quick Action Launchpad */}
        <div
          className="glass-panel"
          style={{
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            background: '#ffffff',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Quick Launchpad
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Navigate to core intelligent support modules:
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Action 1: Open Chat */}
            <button
              type="button"
              onClick={onOpenChat}
              style={{
                padding: '0.95rem 1.15rem',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%)',
                border: '1px solid #dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                  <MessageSquare size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    AI Chat Workspace
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    Interactive conversation with live 3D Nexus
                  </div>
                </div>
              </div>
              <ArrowRight size={16} color="var(--primary)" />
            </button>

            {/* Action 2: Inspect History */}
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                style={{
                  padding: '0.95rem 1.15rem',
                  borderRadius: 'var(--radius-md)',
                  background: '#ffffff',
                  border: '1px solid var(--surface-card-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    <History size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      Conversation History
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Query SQLite chat store by session UUID
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} color="var(--text-muted)" />
              </button>
            )}

            {/* Action 3: View Telemetry Insights */}
            {onOpenInsights && (
              <button
                type="button"
                onClick={onOpenInsights}
                style={{
                  padding: '0.95rem 1.15rem',
                  borderRadius: 'var(--radius-md)',
                  background: '#ffffff',
                  border: '1px solid var(--surface-card-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'var(--secondary-soft)', color: 'var(--secondary)' }}>
                    <BarChart3 size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      Session Insights & Telemetry
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Distribution charts & escalation rates
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} color="var(--text-muted)" />
              </button>
            )}
          </div>

          {/* Calibrated Safety Architecture Box */}
          <div
            style={{
              marginTop: 'auto',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--surface-card-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <ShieldCheck size={16} color="var(--success)" />
              <span>Gating Assurance Guarantee</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Responses require both high-confidence intent classification and cosine similarity match against verified bank documents. Ambiguous queries trigger human review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
