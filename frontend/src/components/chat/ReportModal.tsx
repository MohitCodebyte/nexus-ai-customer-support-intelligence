import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, CheckCircle2, Flag, Loader2 } from 'lucide-react';
import { submitReportResponse } from '../../services/api';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  messageId?: string;
  messageSnippet?: string;
}

const REPORT_REASONS = [
  { id: 'factual_error', label: 'Inaccurate or factually incorrect banking information' },
  { id: 'outdated_policy', label: 'Outdated fee schedule or account policy' },
  { id: 'unanswered', label: 'Did not answer my question or misunderstood inquiry' },
  { id: 'formatting_issue', label: 'Broken formatting, garbled text, or bad link' },
  { id: 'other', label: 'Other issue' },
];

const ReportModalContent: React.FC<{
  onClose: () => void;
  conversationId: string;
  messageId?: string;
  messageSnippet?: string;
}> = ({ onClose, conversationId, messageId, messageSnippet }) => {
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0].id);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await submitReportResponse({
        conversation_id: conversationId,
        message_id: messageId,
        reason: selectedReason,
        details: details.trim(),
      });

      setSuccessMessage(res.message || 'Report submitted successfully. Thank you for notifying us!');
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to submit report. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '520px',
          background: '#ffffff',
          borderRadius: 'var(--radius-xl)',
          padding: '1.75rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          border: '1px solid var(--surface-card-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Flag size={18} />
            </div>
            <div>
              <h3
                id="report-modal-title"
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-display)',
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Report Inaccurate Response
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                Help us maintain zero-hallucination support accuracy
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
            style={{ padding: '0.35rem', borderRadius: 'var(--radius-full)' }}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Message preview snippet */}
        {messageSnippet && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--surface-card-border)',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              maxHeight: '70px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            &quot;{messageSnippet.slice(0, 160)}...&quot;
          </div>
        )}

        {/* Success or Error Alert */}
        {successMessage ? (
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--success-bg)',
              border: '1px solid var(--success-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              color: 'var(--success)',
              fontSize: '0.86rem',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {errorMessage && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-border)',
                  color: 'var(--danger)',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={15} />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: '0.5rem',
                }}
              >
                What went wrong?
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {REPORT_REASONS.map((reason) => (
                  <label
                    key={reason.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      background: selectedReason === reason.id ? 'var(--primary-soft)' : '#ffffff',
                      border: `1px solid ${
                        selectedReason === reason.id ? 'var(--primary)' : 'var(--surface-card-border)'
                      }`,
                      cursor: 'pointer',
                      fontSize: '0.84rem',
                      color: selectedReason === reason.id ? 'var(--primary)' : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={reason.id}
                      checked={selectedReason === reason.id}
                      onChange={() => setSelectedReason(reason.id)}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span>{reason.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="report-details"
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: '0.35rem',
                }}
              >
                Additional Details (Optional)
              </label>
              <textarea
                id="report-details"
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Describe what was incorrect or how this response could be improved..."
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--surface-card-border)',
                  background: 'var(--bg-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.86rem',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  resize: 'none',
                }}
                maxLength={1000}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                disabled={isSubmitting}
                style={{ padding: '0.45rem 1rem', fontSize: '0.84rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{
                  padding: '0.45rem 1.15rem',
                  fontSize: '0.84rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Flag size={14} />
                    <span>Submit Report</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  messageId,
  messageSnippet,
}) => {
  if (!isOpen) return null;
  return (
    <ReportModalContent
      onClose={onClose}
      conversationId={conversationId}
      messageId={messageId}
      messageSnippet={messageSnippet}
    />
  );
};
