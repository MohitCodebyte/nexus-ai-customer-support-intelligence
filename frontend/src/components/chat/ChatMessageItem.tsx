import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import type { ChatTurn, FeedbackRating } from '../../types/chat';
import type { SpeechPlaybackState, SpeechSpeed } from '../../hooks/useSpeechPlayback';
import { MarkdownContent } from './MarkdownContent';
import { ReportModal } from './ReportModal';
import { SpeechAudioControls } from './SpeechAudioControls';
import { sendCustomerFeedback } from '../../services/api';
import {
  User,
  Bot,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Flag,
  RotateCcw,
  Sparkles,
  Star,
  CheckCircle2,
  MessageSquare,
  Send,
  Loader2,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Headphones,
} from 'lucide-react';

interface ChatMessageItemProps {
  turn: ChatTurn;
  conversationId: string;
  isLatestAssistant?: boolean;
  onRegenerate?: () => void;
  onSelectSuggestion?: (suggestion: string) => void;
  activeSpeechMessageId?: string | null;
  speechPlaybackState?: SpeechPlaybackState;
  speechSpeed?: SpeechSpeed;
  isSpeechSupported?: boolean;
  onPlaySpeech?: (messageId: string, text: string) => void;
  onPauseSpeech?: () => void;
  onResumeSpeech?: () => void;
  onStopSpeech?: () => void;
  onSetSpeechSpeed?: (speed: SpeechSpeed) => void;
}

const STAR_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({
  turn,
  conversationId,
  isLatestAssistant = false,
  onRegenerate,
  onSelectSuggestion,
  activeSpeechMessageId,
  speechPlaybackState = 'idle',
  speechSpeed = 1,
  isSpeechSupported = true,
  onPlaySpeech,
  onPauseSpeech,
  onResumeSpeech,
  onStopSpeech,
  onSetSpeechSpeed,
}) => {
  const isUser = turn.role === 'user';

  // Local interaction states
  const [copied, setCopied] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating | null>(null);
  const [selectedStars, setSelectedStars] = useState<number | null>(null);
  const [hoveredStars, setHoveredStars] = useState<number | null>(null);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitted, setCommentSubmitted] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const [reportModalOpen, setReportModalOpen] = useState(false);

  // 1. Copy Response
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(turn.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = turn.content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  }, [turn.content]);

  // 2. Clickable 1–5 Star Rating (Click to rate, click again to update rating)
  const handleStarClick = useCallback(
    async (starValue: number) => {
      setSelectedStars(starValue);
      setFeedbackMessage('Thank you for your feedback!');

      try {
        await sendCustomerFeedback({
          conversation_id: conversationId,
          message_id: turn.id,
          stars: starValue,
          rating: `${starValue}_star`,
          comment: commentText.trim() ? commentText.trim() : undefined,
        });
      } catch {
        // Keep optimistic state visible
      }
    },
    [commentText, conversationId, turn.id]
  );

  // 3. Submit Optional Comment
  const handleCommentSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = commentText.trim();
      if (!trimmed) return;

      setIsSubmittingComment(true);
      try {
        await sendCustomerFeedback({
          conversation_id: conversationId,
          message_id: turn.id,
          stars: selectedStars || undefined,
          rating: selectedStars ? `${selectedStars}_star` : 'feedback_comment',
          comment: trimmed,
        });
        setCommentSubmitted(true);
        setFeedbackMessage('Thank you for your feedback!');
        setTimeout(() => setShowCommentBox(false), 1800);
      } catch {
        // Silent recovery
      } finally {
        setIsSubmittingComment(false);
      }
    },
    [commentText, conversationId, selectedStars, turn.id]
  );

  // 4. Thumbs Up / Down
  const handleFeedback = useCallback(
    async (rating: FeedbackRating) => {
      const nextRating = feedbackRating === rating ? null : rating;
      setFeedbackRating(nextRating);

      if (nextRating) {
        setFeedbackMessage('Thank you for your feedback!');
        try {
          await sendCustomerFeedback({
            conversation_id: conversationId,
            message_id: turn.id,
            rating: nextRating,
            stars: selectedStars || undefined,
          });
        } catch {
          // Silent recovery
        }
      }
    },
    [conversationId, feedbackRating, selectedStars, turn.id]
  );



  // =========================================================================
  // USER MESSAGE CARD
  // =========================================================================
  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          margin: '0.85rem 0',
          width: '100%',
        }}
      >
        <div
          style={{
            maxWidth: 'min(78%, 680px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
          }}
        >
          {/* User Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              marginBottom: '0.25rem',
            }}
          >
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              You • {turn.timestamp}
            </span>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'var(--primary-soft)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden="true"
            >
              <User size={13} />
            </div>
          </div>

          {/* User Bubble */}
          <div
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 55%, #1e40af 100%)',
              color: '#ffffff',
              padding: '0.85rem 1.25rem',
              borderRadius: '20px 20px 4px 20px',
              fontSize: '0.94rem',
              lineHeight: 1.55,
              boxShadow: '0 4px 18px rgba(14, 165, 233, 0.28)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              wordBreak: 'break-word',
            }}
          >
            {turn.attachments && turn.attachments.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  marginBottom: turn.content ? '0.65rem' : 0,
                }}
              >
                {turn.attachments.map((att) => {
                  const isImg = att.mime_type.startsWith('image/');
                  const sizeKb = Math.round(att.size / 1024);
                  const formattedSize = sizeKb > 1000 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

                  return (
                    <a
                      key={att.id}
                      href={att.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                        padding: '0.45rem 0.75rem',
                        background: 'rgba(255, 255, 255, 0.18)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: '10px',
                        color: '#ffffff',
                        textDecoration: 'none',
                        border: '1px solid rgba(255, 255, 255, 0.28)',
                        fontSize: '0.82rem',
                        transition: 'background 0.2s ease',
                      }}
                      title="Click to view attached document"
                    >
                      {isImg ? <ImageIcon size={14} /> : <FileText size={14} />}
                      <span
                        style={{
                          fontWeight: 600,
                          maxWidth: '180px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {att.filename}
                      </span>
                      <span style={{ opacity: 0.8, fontSize: '0.72rem' }}>• {formattedSize}</span>
                      <ExternalLink size={12} style={{ opacity: 0.8, marginLeft: 'auto' }} />
                    </a>
                  );
                })}
              </div>
            )}
            {turn.content}
          </div>
        </div>
      </motion.div>
    );
  }

  // =========================================================================
  // ASSISTANT MESSAGE CARD (Customer-Safe + 1-5 Star Ratings & Feedback)
  // =========================================================================
  const activeRatingDisplay = hoveredStars ?? selectedStars;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{
        display: 'flex',
        justifyContent: 'flex-start',
        margin: '1.15rem 0',
        width: '100%',
      }}
    >
      <div
        style={{
          maxWidth: 'min(86%, 760px)',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        {/* Assistant Header Identity */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            marginBottom: '0.4rem',
            flexWrap: 'wrap',
          }}
        >
          {turn.human_agent ? (
            <>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '9px',
                  background: 'linear-gradient(135deg, var(--mint) 0%, var(--primary) 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.28)',
                }}
                aria-hidden="true"
              >
                <Headphones size={16} />
              </div>

              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-display)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                {turn.agent_name || 'Support Specialist'}
              </span>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--success-bg)',
                  border: '1px solid var(--success-border)',
                  color: 'var(--success)',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                }}
              >
                Live Human Agent
              </span>
            </>
          ) : (
            <>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '9px',
                  background: 'linear-gradient(135deg, #4f7df3 0%, #9277ec 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(79, 125, 243, 0.28)',
                }}
                aria-hidden="true"
              >
                <Bot size={16} />
              </div>

              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-display)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                Nexus AI Support
              </span>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--primary-soft)',
                  color: 'var(--primary)',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                }}
              >
                <Sparkles size={10} />
                Verified
              </span>
            </>
          )}

          <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            {turn.timestamp}
          </span>
        </div>

        {/* Message Bubble Card */}
        <div
          className="glass-panel"
          style={{
            padding: '1.15rem 1.4rem',
            borderRadius: '4px 22px 22px 22px',
            background: 'var(--surface-card)',
            border: '1px solid var(--surface-card-border)',
            boxShadow: '0 3px 12px -2px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)',
            width: '100%',
            position: 'relative',
          }}
        >
          {/* Formatted Message Content (Safe Markdown) */}
          <MarkdownContent content={turn.content} />

          {/* ================================================================= */}
          {/* 1–5 STAR RATING BAR & OPTIONAL COMMENT DRAWER                     */}
          {/* ================================================================= */}
          <div
            style={{
              marginTop: '0.85rem',
              paddingTop: '0.65rem',
              borderTop: '1px solid var(--surface-card-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              {/* Clickable 1–5 Stars */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.73rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Rate this response:
                </span>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                  }}
                  role="radiogroup"
                  aria-label="Rate response from 1 to 5 stars"
                >
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isFilled =
                      hoveredStars !== null
                        ? star <= hoveredStars
                        : selectedStars !== null && star <= selectedStars;

                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleStarClick(star)}
                        onMouseEnter={() => setHoveredStars(star)}
                        onMouseLeave={() => setHoveredStars(null)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '2px',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          color: isFilled ? '#f59e0b' : '#cbd5e1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'transform 0.1s ease, color 0.15s ease',
                          transform: hoveredStars === star ? 'scale(1.15)' : 'scale(1)',
                        }}
                        title={`${star} star${star > 1 ? 's' : ''} (${STAR_LABELS[star]})`}
                        aria-label={`Rate ${star} star${star > 1 ? 's' : ''} - ${STAR_LABELS[star]}`}
                      >
                        <Star
                          size={16}
                          fill={isFilled ? '#f59e0b' : 'none'}
                          strokeWidth={isFilled ? 1.5 : 1.75}
                        />
                      </button>
                    );
                  })}
                </div>

                {activeRatingDisplay !== null && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#d97706',
                      marginLeft: '0.15rem',
                    }}
                  >
                    {STAR_LABELS[activeRatingDisplay]}
                  </span>
                )}

                {/* Friendly Confirmation */}
                {feedbackMessage && (
                  <span
                    style={{
                      fontSize: '0.73rem',
                      color: 'var(--success)',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      marginLeft: '0.35rem',
                    }}
                  >
                    <CheckCircle2 size={12} />
                    {feedbackMessage}
                  </span>
                )}
              </div>

              {/* Optional Comment Toggle */}
              {!showCommentBox && (
                <button
                  type="button"
                  onClick={() => setShowCommentBox(true)}
                  className="btn btn-ghost"
                  style={{
                    padding: '0.15rem 0.45rem',
                    fontSize: '0.72rem',
                    color: 'var(--primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                  title="Add an optional comment to your rating"
                >
                  <MessageSquare size={11} />
                  <span>{commentSubmitted ? 'Edit comment' : 'Add comment'}</span>
                </button>
              )}
            </div>

            {/* Optional Comment Box */}
            {showCommentBox && (
              <form
                onSubmit={handleCommentSubmit}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--surface-card-border)',
                  marginTop: '0.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label
                    htmlFor={`comment-${turn.id}`}
                    style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}
                  >
                    Optional: What could we do better or what did you like?
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCommentBox(false)}
                    className="btn btn-ghost"
                    style={{ padding: '0.1rem 0.3rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}
                  >
                    Close
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  <input
                    id={`comment-${turn.id}`}
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write your feedback..."
                    maxLength={300}
                    disabled={isSubmittingComment}
                    style={{
                      flex: 1,
                      padding: '0.35rem 0.55rem',
                      fontSize: '0.78rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--surface-card-border)',
                      background: 'var(--surface-card-subtle)',
                      outline: 'none',
                      color: 'var(--text-primary)',
                    }}
                  />

                  <button
                    type="submit"
                    disabled={!commentText.trim() || isSubmittingComment}
                    className="btn btn-primary"
                    style={{
                      padding: '0.35rem 0.65rem',
                      fontSize: '0.74rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    {isSubmittingComment ? (
                      <Loader2 size={11} className="spin" />
                    ) : (
                      <>
                        <Send size={11} />
                        <span>Save</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* ================================================================= */}
          {/* ACTION TOOLBAR: Thumbs, Copy, Listen, Regenerate, Report           */}
          {/* ================================================================= */}
          <div
            style={{
              marginTop: '0.65rem',
              paddingTop: '0.55rem',
              borderTop: '1px solid var(--surface-card-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            {/* Left: Helpful Thumbs Up / Down */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                onClick={() => handleFeedback('helpful')}
                className={`btn ${feedbackRating === 'helpful' ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  padding: '0.25rem 0.55rem',
                  fontSize: '0.74rem',
                  borderRadius: 'var(--radius-full)',
                  height: '28px',
                }}
                title="Mark as helpful"
                aria-label="Mark response as helpful"
              >
                <ThumbsUp size={12} />
                <span style={{ fontSize: '0.72rem' }}>Helpful</span>
              </button>

              <button
                type="button"
                onClick={() => handleFeedback('unhelpful')}
                className={`btn ${feedbackRating === 'unhelpful' ? 'btn-secondary' : 'btn-ghost'}`}
                style={{
                  padding: '0.25rem 0.55rem',
                  fontSize: '0.74rem',
                  borderRadius: 'var(--radius-full)',
                  height: '28px',
                  color: feedbackRating === 'unhelpful' ? 'var(--danger)' : undefined,
                }}
                title="Mark as unhelpful"
                aria-label="Mark response as unhelpful"
              >
                <ThumbsDown size={12} />
              </button>
            </div>

            {/* Right: Copy, Read Aloud, Regenerate, Report */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {/* Copy Button */}
              <button
                type="button"
                onClick={handleCopy}
                className="btn btn-ghost"
                style={{
                  padding: '0.25rem 0.55rem',
                  fontSize: '0.74rem',
                  borderRadius: 'var(--radius-full)',
                  height: '28px',
                  color: copied ? 'var(--success)' : 'var(--text-secondary)',
                }}
                title={copied ? 'Copied to clipboard!' : 'Copy response text'}
                aria-label={copied ? 'Copied to clipboard' : 'Copy message text'}
              >
                {copied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                <span style={{ fontSize: '0.72rem' }}>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              {/* Interactive Read Aloud & Playback Controls */}
              <SpeechAudioControls
                messageId={turn.id}
                content={turn.content}
                isActive={activeSpeechMessageId === turn.id}
                playbackState={speechPlaybackState}
                playbackSpeed={speechSpeed}
                isSupported={isSpeechSupported}
                onPlay={(id, text) => onPlaySpeech?.(id, text)}
                onPause={() => onPauseSpeech?.()}
                onResume={() => onResumeSpeech?.()}
                onStop={() => onStopSpeech?.()}
                onSetSpeed={(speed) => onSetSpeechSpeed?.(speed)}
              />

              {/* Regenerate Response */}
              {isLatestAssistant && onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="btn btn-ghost"
                  style={{
                    padding: '0.25rem 0.55rem',
                    fontSize: '0.74rem',
                    borderRadius: 'var(--radius-full)',
                    height: '28px',
                  }}
                  title="Regenerate this response"
                  aria-label="Regenerate assistant response"
                >
                  <RotateCcw size={13} />
                  <span style={{ fontSize: '0.72rem' }}>Retry</span>
                </button>
              )}

              {/* Report Issue Button */}
              <button
                type="button"
                onClick={() => setReportModalOpen(true)}
                className="btn btn-ghost"
                style={{
                  padding: '0.25rem 0.45rem',
                  fontSize: '0.74rem',
                  borderRadius: 'var(--radius-full)',
                  height: '28px',
                  color: 'var(--text-muted)',
                }}
                title="Report inaccurate or problematic response"
                aria-label="Report incorrect response"
              >
                <Flag size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Contextual Follow-Up Suggestions (Category-Aware) */}
        {isLatestAssistant && turn.suggestions && turn.suggestions.length > 0 && onSelectSuggestion && (
          <div
            style={{
              marginTop: '0.65rem',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: '#94a3b8',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              <Sparkles size={11} color="#a78bfa" />
              <span>Suggested Follow-Ups</span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.45rem',
                overflowX: 'auto',
                paddingBottom: '2px',
              }}
            >
              {turn.suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectSuggestion(sug)}
                  className="nexus-suggestion-chip"
                  style={{
                    background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.16) 0%, rgba(56, 189, 248, 0.1) 100%)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    backdropFilter: 'blur(8px)',
                    color: '#e2e8f0',
                    borderRadius: '20px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.76rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'all 0.18s ease',
                    textAlign: 'left',
                    lineHeight: 1.3,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(56, 189, 248, 0.22) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(192, 132, 252, 0.6)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(168, 85, 247, 0.35)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124, 58, 237, 0.16) 0%, rgba(56, 189, 248, 0.1) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                    e.currentTarget.style.color = '#e2e8f0';
                  }}
                >
                  <Sparkles size={11} color="#38bdf8" style={{ flexShrink: 0 }} />
                  <span>{sug}</span>
                  <span style={{ opacity: 0.6, fontSize: '0.85em', marginLeft: '0.15rem' }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Report Modal */}
        <ReportModal
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          conversationId={conversationId}
          messageId={turn.id}
          messageSnippet={turn.content}
        />
      </div>
    </motion.div>
  );
});
