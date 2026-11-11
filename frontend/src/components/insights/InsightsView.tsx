import React, { useState, useEffect, useCallback } from 'react';
import type { ActiveSessionStats, FeedbackAnalyticsResponse } from '../../types/chat';
import { fetchFeedbackAnalytics } from '../../services/api';
import {
  BarChart3,
  ShieldAlert,
  Smile,
  Activity,
  Server,
  Star,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface InsightsViewProps {
  sessionStats: ActiveSessionStats;
  isBackendOnline: boolean | null;
}

export const InsightsView: React.FC<InsightsViewProps> = ({
  sessionStats,
  isBackendOnline,
}) => {
  const intentEntries = Object.entries(sessionStats.intentsDetected);
  const totalTurns = sessionStats.totalTurns;
  const humanReviewRate =
    totalTurns > 0
      ? Math.round((sessionStats.humanReviewCount / totalTurns) * 100)
      : 0;

  // Feedback Analytics State
  const [feedbackData, setFeedbackData] = useState<FeedbackAnalyticsResponse | null>(null);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const refreshFeedbackAnalytics = useCallback(() => {
    setIsLoadingFeedback(true);
    setFeedbackError(null);
    fetchFeedbackAnalytics()
      .then((data) => setFeedbackData(data))
      .catch((err: unknown) => {
        setFeedbackError(
          err instanceof Error ? err.message : 'Unable to load feedback analytics'
        );
      })
      .finally(() => setIsLoadingFeedback(false));
  }, []);

  useEffect(() => {
    let ignore = false;
    if (isBackendOnline !== false) {
      fetchFeedbackAnalytics()
        .then((data) => {
          if (!ignore) setFeedbackData(data);
        })
        .catch((err: unknown) => {
          if (!ignore) {
            setFeedbackError(
              err instanceof Error ? err.message : 'Unable to load feedback analytics'
            );
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [isBackendOnline]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.75rem',
        width: '100%',
        maxWidth: '1100px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div
        className="glass-panel"
        style={{
          padding: '1.75rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          background: '#ffffff',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.25rem 0.65rem',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary-soft)',
              color: 'var(--primary)',
              fontSize: '0.74rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '0.5rem',
            }}
          >
            <BarChart3 size={12} />
            Support Intelligence & Routing Telemetry
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.65rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '0.35rem',
            }}
          >
            Admin Support Analytics & CSAT
          </h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', maxWidth: '600px' }}>
            Live customer ratings, 1–5 star distribution, intent classification, and sentiment polarity aggregated across verified SQLite support history.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            onClick={refreshFeedbackAnalytics}
            disabled={isLoadingFeedback}
            className="btn btn-secondary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}
            title="Refresh live feedback analytics"
          >
            <RefreshCw size={13} className={isLoadingFeedback ? 'spin' : ''} />
            <span>Refresh Analytics</span>
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-card-subtle)',
              border: '1px solid var(--surface-card-border)',
              fontSize: '0.82rem',
            }}
          >
            <Server size={15} color="var(--primary)" />
            <span style={{ fontWeight: 600 }}>Backend:</span>
            <span
              style={{
                color: isBackendOnline ? 'var(--success)' : 'var(--danger)',
                fontWeight: 700,
              }}
            >
              {isBackendOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SECTION 1: CUSTOMER SATISFACTION (CSAT) & 1–5 STAR RATINGS          */}
      {/* =================================================================== */}
      <div
        className="glass-panel"
        style={{
          padding: '1.75rem 2rem',
          background: '#ffffff',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--surface-card-border)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 3px 10px rgba(245, 158, 11, 0.28)',
              }}
            >
              <Star size={20} fill="#ffffff" />
            </div>
            <div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Customer Satisfaction & 5-Star Ratings
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0' }}>
                Admin-exclusive feedback metrics captured per response turn
              </p>
            </div>
          </div>

          {feedbackData && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.25rem 0.65rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--primary-soft)',
                color: 'var(--primary)',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              <Sparkles size={11} />
              {feedbackData.total_feedback} Total Feedback Submissions
            </div>
          )}
        </div>

        {feedbackError ? (
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--warning-bg)',
              color: '#92400e',
              fontSize: '0.84rem',
            }}
          >
            {feedbackError}
          </div>
        ) : feedbackData ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Left: Overall CSAT Score */}
            <div
              style={{
                padding: '1.5rem',
                borderRadius: 'var(--radius-lg)',
                background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                border: '1px solid #fde68a',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                gap: '0.65rem',
              }}
            >
              <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#b45309' }}>
                Average Star Rating
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '3.2rem',
                  fontWeight: 900,
                  color: '#b45309',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span>{feedbackData.average_rating > 0 ? feedbackData.average_rating.toFixed(1) : '—'}</span>
                <span style={{ fontSize: '1.8rem', color: '#d97706' }}>★</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                {feedbackData.total_star_ratings} verified ratings
              </div>

              {/* Thumbs count pill */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  marginTop: '0.5rem',
                  padding: '0.4rem 0.85rem',
                  background: '#ffffff',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid #fde68a',
                  fontSize: '0.78rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--success)' }}>
                  <ThumbsUp size={13} />
                  <strong>{feedbackData.thumbs.helpful}</strong> Helpful
                </div>
                <div style={{ width: '1px', height: '12px', background: '#e2e8f0' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--danger)' }}>
                  <ThumbsDown size={13} />
                  <strong>{feedbackData.thumbs.unhelpful}</strong> Unhelpful
                </div>
              </div>
            </div>

            {/* Right: 1–5 Star Rating Distribution */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '0.65rem',
              }}
            >
              <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Rating Distribution (1 to 5 Stars)
              </div>

              {[5, 4, 3, 2, 1].map((stars) => {
                const count = feedbackData.star_distribution[stars] || 0;
                const percentage =
                  feedbackData.total_star_ratings > 0
                    ? Math.round((count / feedbackData.total_star_ratings) * 100)
                    : 0;

                return (
                  <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.82rem' }}>
                    <div style={{ width: '55px', display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 700, color: '#b45309' }}>
                      <span>{stars}</span>
                      <Star size={12} fill="#f59e0b" color="#f59e0b" />
                    </div>

                    <div style={{ flex: 1, height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${percentage}%`,
                          background: stars >= 4 ? 'linear-gradient(90deg, #f59e0b, #10b981)' : stars === 3 ? '#f59e0b' : '#ef4444',
                          borderRadius: '4px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>

                    <div style={{ width: '65px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <strong>{count}</strong> ({percentage}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
            Loading feedback metrics from database...
          </div>
        )}

        {/* Recent Customer Feedback Comments Table */}
        {feedbackData && feedbackData.recent_comments.length > 0 && (
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <MessageSquare size={13} color="var(--primary)" />
              <span>Recent Customer Feedback Notes</span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem',
                maxHeight: '260px',
                overflowY: 'auto',
                paddingRight: '0.35rem',
              }}
            >
              {feedbackData.recent_comments.map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--surface-card-border)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    fontSize: '0.82rem',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      {comment.stars ? (
                        <span style={{ color: '#d97706', fontWeight: 800 }}>
                          {comment.stars} ★
                        </span>
                      ) : (
                        <span className="badge badge-indigo" style={{ fontSize: '0.68rem' }}>
                          {comment.rating}
                        </span>
                      )}
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Session: {comment.conversation_id.slice(0, 8)}...
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-primary)', lineHeight: 1.45 }}>
                      &quot;{comment.comment}&quot;
                    </div>
                  </div>

                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {comment.created_at ? new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* SECTION 2: LIVE SESSION TELEMETRY & INTENTS                          */}
      {/* =================================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {/* Intent Distribution Card */}
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
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              Session Detected Intents
            </h3>
            <Activity size={16} color="var(--primary)" />
          </div>

          {intentEntries.length === 0 ? (
            <div
              style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.86rem',
              }}
            >
              No intents classified in this session yet. Start chatting in the AI Chat tab to see routing telemetry.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {intentEntries.map(([intent, count]) => (
                <div key={intent}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.82rem',
                      marginBottom: '0.25rem',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {intent}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{count}</span>
                  </div>
                  <div
                    style={{
                      height: '6px',
                      borderRadius: '3px',
                      background: 'var(--bg-secondary)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, (count / totalTurns) * 100)}%`,
                        background: 'linear-gradient(90deg, #4f7df3 0%, #41cdb5 100%)',
                        borderRadius: '3px',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sentiment Breakdown */}
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
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              Sentiment Polarity
            </h3>
            <Smile size={16} color="var(--mint)" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Positive */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.82rem',
                  marginBottom: '0.25rem',
                }}
              >
                <span style={{ color: '#059669', fontWeight: 600 }}>Positive Sentiment</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {sessionStats.sentimentCounts.positive}
                </span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${
                      totalTurns > 0
                        ? (sessionStats.sentimentCounts.positive / totalTurns) * 100
                        : 0
                    }%`,
                    background: 'var(--success)',
                    borderRadius: '3px',
                  }}
                />
              </div>
            </div>

            {/* Neutral */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.82rem',
                  marginBottom: '0.25rem',
                }}
              >
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Neutral Sentiment</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {sessionStats.sentimentCounts.neutral}
                </span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${
                      totalTurns > 0
                        ? (sessionStats.sentimentCounts.neutral / totalTurns) * 100
                        : 0
                    }%`,
                    background: 'var(--text-muted)',
                    borderRadius: '3px',
                  }}
                />
              </div>
            </div>

            {/* Negative */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.82rem',
                  marginBottom: '0.25rem',
                }}
              >
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Negative Sentiment</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {sessionStats.sentimentCounts.negative}
                </span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${
                      totalTurns > 0
                        ? (sessionStats.sentimentCounts.negative / totalTurns) * 100
                        : 0
                    }%`,
                    background: 'var(--danger)',
                    borderRadius: '3px',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Human Review Rate */}
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
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              Gating & Review Flags
            </h3>
            <ShieldAlert size={16} color="var(--warning)" />
          </div>

          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.4rem',
              fontWeight: 800,
              color: sessionStats.humanReviewCount > 0 ? 'var(--warning)' : 'var(--success)',
            }}
          >
            {humanReviewRate}%
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {sessionStats.humanReviewCount} out of {totalTurns} turns flagged for human specialist review based on similarity thresholds or ambiguous margins.
          </p>
        </div>
      </div>
    </div>
  );
};
