import React from 'react';
import type { SupportedLanguage, VoiceInputStatus } from '../../types/chat';
import {
  Mic,
  RotateCcw,
  X,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface VoiceInputControlProps {
  status: VoiceInputStatus;
  isSupported: boolean;
  language: SupportedLanguage;
  interimTranscript: string;
  errorMessage: string | null;
  onStop: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onClearError: () => void;
}

const LANGUAGE_VOICE_LABELS: Record<SupportedLanguage, string> = {
  auto: 'English (India) / Auto',
  en: 'English (India)',
  hi: 'हिंदी (India)',
  hinglish: 'Hinglish (Hindi / Indian English)',
};

export const VoiceInputControl: React.FC<VoiceInputControlProps> = ({
  status,
  isSupported,
  language,
  interimTranscript,
  errorMessage,
  onStop,
  onCancel,
  onRetry,
  onClearError,
}) => {
  const isListening = status === 'listening';
  const isProcessing = status === 'processing';
  const isRequesting = status === 'requesting_permission';
  const isError = status === 'error';
  const isActive = isListening || isProcessing || isRequesting;

  if (!isActive && !isError) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
      {/* Active Voice Session Strip */}
      {isActive && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.45rem 0.75rem',
            borderRadius: '10px',
            background: isListening
              ? 'rgba(239, 68, 68, 0.12)'
              : 'rgba(99, 102, 241, 0.12)',
            border: isListening
              ? '1px solid rgba(239, 68, 68, 0.35)'
              : '1px solid rgba(99, 102, 241, 0.35)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flex: 1, minWidth: 0 }}>
            {isListening ? (
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 0 10px rgba(239, 68, 68, 0.6)',
                  flexShrink: 0,
                }}
              >
                <Mic size={12} />
              </div>
            ) : (
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: '#6366f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  flexShrink: 0,
                }}
              >
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: isListening ? '#fca5a5' : '#a5b4fc',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span>
                  {isRequesting
                    ? 'Requesting Microphone Access...'
                    : isListening
                    ? `Listening in ${LANGUAGE_VOICE_LABELS[language]}...`
                    : 'Transcribing speech...'}
                </span>
                {isListening && (
                  <span
                    style={{
                      fontSize: '0.62rem',
                      padding: '0.05rem 0.35rem',
                      borderRadius: '9999px',
                      background: 'rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                      fontWeight: 800,
                    }}
                  >
                    REC
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: '0.72rem',
                  color: '#cbd5e1',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontStyle: interimTranscript ? 'normal' : 'italic',
                }}
              >
                {interimTranscript ? `"${interimTranscript}"` : 'Speak into your microphone...'}
              </div>
            </div>
          </div>

          {/* Controls: Done & Cancel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
            <button
              type="button"
              onClick={onStop}
              style={{
                padding: '0.25rem 0.55rem',
                fontSize: '0.72rem',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title="Stop and insert transcript"
            >
              <Check size={11} />
              <span>Done</span>
            </button>

            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.72rem',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Cancel recording"
            >
              <X size={11} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Voice Error State — Compact Inline Notification */}
      {isError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.35rem 0.65rem',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.14)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            fontSize: '0.73rem',
            gap: '0.4rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: '180px' }}>
            <AlertCircle size={13} style={{ flexShrink: 0 }} />
            <span style={{ wordBreak: 'break-word', lineHeight: 1.3 }}>
              {errorMessage || 'Voice recognition error. Please check mic permissions.'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
            {isSupported && (
              <button
                type="button"
                onClick={onRetry}
                style={{
                  padding: '0.2rem 0.45rem',
                  fontSize: '0.7rem',
                  borderRadius: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  color: '#ffffff',
                  background: 'rgba(239, 68, 68, 0.3)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  cursor: 'pointer',
                }}
                title="Retry microphone input"
              >
                <RotateCcw size={10} />
                <span>Retry</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClearError}
              style={{
                background: 'none',
                border: 'none',
                padding: '0.15rem',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Dismiss error"
              aria-label="Dismiss error"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
