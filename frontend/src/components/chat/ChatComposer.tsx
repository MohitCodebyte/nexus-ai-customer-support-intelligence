import React, { useState, useRef, useEffect } from 'react';
import type { SupportedLanguage, VoiceInputStatus, AttachmentInfo } from '../../types/chat';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { VoiceInputControl } from './VoiceInputControl';
import { uploadAttachment, ApiError } from '../../services/api';
import {
  Square,
  Globe,
  Mic,
  Paperclip,
  X,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  Send,
  ChevronDown,
} from 'lucide-react';

interface ChatComposerProps {
  conversationId: string;
  onSendMessage: (message: string, attachments?: AttachmentInfo[]) => Promise<void>;
  isSubmitting: boolean;
  onStopRequest?: () => void;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  onVoiceStateChange?: (status: VoiceInputStatus) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  auto: 'Auto Detect',
  en: 'English',
  hi: 'हिंदी',
  hinglish: 'Hinglish',
};

const PLACEHOLDERS: Record<SupportedLanguage, string> = {
  auto: 'Ask anything in English, हिंदी, or Hinglish... (Enter to send)',
  en: 'Ask anything about cards, payments, or banking... (Enter to send)',
  hi: 'कार्ड, खाते, या बैंकिंग संबंधित प्रश्न पूछें... (Enter दबाएं)',
  hinglish: 'Banking sawaal yahan poochein... (Enter dabayein)',
};

export const ChatComposer: React.FC<ChatComposerProps> = React.memo(({
  conversationId,
  onSendMessage,
  isSubmitting,
  onStopRequest,
  language,
  onLanguageChange,
  onVoiceStateChange,
  onFocus,
  onBlur,
}) => {
  const [text, setText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFilename, setUploadingFilename] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousTextRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Integrated Voice Input (Web Speech API + BCP 47 Language Mapping + Fallback)
  const voice = useVoiceInput({
    onTranscriptUpdate: (newText) => {
      setText(() => {
        const base = previousTextRef.current ? previousTextRef.current.trim() + ' ' : '';
        return base + newText;
      });
      if (validationError) setValidationError(null);
    },
    onFinalTranscript: (finalText) => {
      setText(() => {
        const base = previousTextRef.current ? previousTextRef.current.trim() + ' ' : '';
        return base + finalText;
      });
      if (validationError) setValidationError(null);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 120);
    },
    onStatusChange: (status) => {
      onVoiceStateChange?.(status);
    },
  });

  const handleStartVoice = () => {
    previousTextRef.current = text;
    void voice.startListening(language);
  };

  const handleStopVoice = () => {
    voice.stopListening();
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 120);
  };

  const handleCancelVoice = () => {
    setText(previousTextRef.current);
    voice.cancelListening();
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 140)}px`;
    }
  }, [text]);

  // File Upload Processing
  const handleUploadFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowed = ['pdf', 'txt', 'csv', 'jpg', 'jpeg', 'png'];
    if (!ext || !allowed.includes(ext)) {
      setValidationError('Unsupported format. Please upload PDF, TXT, CSV, JPG, or PNG files.');
      return;
    }

    if (file.size > 4.5 * 1024 * 1024) {
      setValidationError('File exceeds the 4.5 MB limit for attachments. Please choose a file under 4.5 MB.');
      return;
    }

    setValidationError(null);
    setIsUploading(true);
    setUploadingFilename(file.name);
    setUploadProgress(0);

    try {
      const att = await uploadAttachment(file, conversationId, (pct) => {
        setUploadProgress(pct);
      });
      setAttachments((prev) => [...prev, att]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to upload document. Please try again.';
      setValidationError(msg);
    } finally {
      setIsUploading(false);
      setUploadingFilename('');
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      void handleUploadFile(files[0]);
    }
  };

  const handleRemoveAttachment = (idToRemove: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== idToRemove));
  };

  // Submit Handler
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isSubmitting || isUploading) return;

    if (trimmed.length > 5000) {
      setValidationError('Inquiry exceeds 5,000 characters. Please shorten your message.');
      return;
    }

    setValidationError(null);
    const messageToSend = trimmed || (attachments.length > 0 ? `Please analyze the attached ${attachments.map(a => a.filename).join(', ')}` : '');
    const currentAttachments = [...attachments];

    setText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await onSendMessage(messageToSend, currentAttachments);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const renderAttachmentIcon = (mime: string) => {
    if (mime === 'application/pdf') return <FileText size={16} color="#ef4444" />;
    if (mime === 'text/csv') return <FileSpreadsheet size={16} color="#10b981" />;
    if (mime.startsWith('image/')) return <ImageIcon size={16} color="#8b5cf6" />;
    return <FileText size={16} color="#0ea5e9" />;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        width: '100%',
      }}
    >
      {/* Hidden native file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.csv,.jpg,.jpeg,.png"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {/* Validation alert */}
      {validationError && (
        <div
          style={{
            fontSize: '0.74rem',
            color: '#f87171',
            background: 'rgba(239, 68, 68, 0.12)',
            padding: '0.35rem 0.65rem',
            borderRadius: '8px',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
          role="alert"
        >
          <span>{validationError}</span>
          <button
            type="button"
            onClick={() => setValidationError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}
            aria-label="Dismiss error"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Active Voice Input Controls */}
      <VoiceInputControl
        status={voice.status}
        isSupported={voice.isSupported}
        language={language}
        interimTranscript={voice.interimTranscript}
        errorMessage={voice.errorMessage}
        onStop={handleStopVoice}
        onCancel={handleCancelVoice}
        onRetry={voice.retry}
        onClearError={voice.clearError}
      />

      {/* Composer Input Box with Drag-and-Drop */}
      <form
        onSubmit={handleSubmit}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          const droppedFile = e.dataTransfer.files?.[0];
          if (droppedFile) void handleUploadFile(droppedFile);
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          padding: '0.45rem 0.65rem',
          borderRadius: '14px',
          background: isDraggingOver ? 'rgba(124, 58, 237, 0.12)' : 'rgba(12, 17, 34, 0.95)',
          border: isDraggingOver ? '1.5px dashed #a855f7' : '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
          transition: 'border 0.2s ease, background 0.2s ease',
        }}
      >
        {/* Attachment Previews Bar (Upload Progress + Attached Chips) */}
        {(isUploading || attachments.length > 0) && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              alignItems: 'center',
              paddingBottom: '0.4rem',
              borderBottom: '1px solid rgba(226, 232, 240, 0.65)',
            }}
          >
            {/* Uploading progress card */}
            {isUploading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.35rem 0.7rem',
                  background: 'rgba(79, 125, 243, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.78rem',
                  color: 'var(--primary)',
                  fontWeight: 600,
                  minWidth: '180px',
                }}
              >
                <Loader2 size={13} className="spin-slow" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {uploadingFilename || 'Uploading file...'}
                  </div>
                  <div
                    style={{
                      height: '3px',
                      background: 'rgba(79, 125, 243, 0.2)',
                      borderRadius: '2px',
                      marginTop: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        background: 'var(--primary)',
                        width: `${uploadProgress}%`,
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                </div>
                <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>{uploadProgress}%</span>
              </div>
            )}

            {/* Attached file chips */}
            {attachments.map((att) => {
              const sizeKb = Math.round(att.size / 1024);
              const formattedSize = sizeKb > 1000 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

              return (
                <div
                  key={att.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.3rem 0.65rem',
                    background: 'var(--surface-sunken)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--surface-card-border)',
                    fontSize: '0.78rem',
                    color: 'var(--text-primary)',
                  }}
                  title={att.preview_snippet || att.filename}
                >
                  {renderAttachmentIcon(att.mime_type)}
                  <span
                    style={{
                      fontWeight: 600,
                      maxWidth: '140px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {att.filename}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>• {formattedSize}</span>
                  {att.has_extracted_text && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.15rem',
                        fontSize: '0.65rem',
                        color: 'var(--success)',
                        fontWeight: 700,
                      }}
                      title="Document content extracted and ready for AI analysis"
                    >
                      <CheckCircle2 size={11} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      marginLeft: '0.2rem',
                    }}
                    title="Remove attachment"
                    aria-label={`Remove attachment ${att.filename}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Integrated Language Selector Dropdown (Exact Compact Design) */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.35rem 0.55rem',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
              title="Change conversation language"
            >
              <Globe size={12} color="#818cf8" />
              <span>
                {typeof window !== 'undefined' && window.innerWidth < 500
                  ? language === 'auto'
                    ? 'Auto'
                    : language.toUpperCase()
                  : LANGUAGE_LABELS[language]}
              </span>
              <ChevronDown size={11} color="#94a3b8" />
            </button>
            {langMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: '6px',
                  background: '#0a1024',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '0.25rem',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.8)',
                  zIndex: 50,
                  minWidth: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {(['auto', 'en', 'hi', 'hinglish'] as SupportedLanguage[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      onLanguageChange(l);
                      setLangMenuOpen(false);
                    }}
                    style={{
                      background: language === l ? 'rgba(124, 58, 237, 0.3)' : 'transparent',
                      color: language === l ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      textAlign: 'left',
                      padding: '0.35rem 0.55rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: language === l ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {LANGUAGE_LABELS[l]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (validationError) setValidationError(null);
            }}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            disabled={isSubmitting}
            rows={1}
            placeholder={
              attachments.length > 0
                ? 'Ask about attachment...'
                : typeof window !== 'undefined' && window.innerWidth < 640
                  ? 'Ask Nexus...'
                  : PLACEHOLDERS[language] || PLACEHOLDERS.auto
            }
            maxLength={5000}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#f8fafc',
              fontFamily: 'inherit',
              fontSize: '0.88rem',
              resize: 'none',
              outline: 'none',
              padding: '0.25rem 0.2rem',
              minHeight: '22px',
              maxHeight: '120px',
              lineHeight: 1.4,
            }}
            aria-label="Customer inquiry message input"
          />

          {/* Action Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {text.length > 300 && (
              <span
                style={{
                  fontSize: '0.65rem',
                  color: text.length > 4500 ? '#f59e0b' : '#64748b',
                }}
              >
                {text.length}/5000
              </span>
            )}

            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting || isUploading}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: attachments.length > 0 ? 'rgba(124, 58, 237, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: attachments.length > 0 ? '#a855f7' : '#94a3b8',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isSubmitting || isUploading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Attach document or image (PDF, TXT, CSV, JPG, PNG up to 10MB)"
              aria-label="Attach file"
            >
              <Paperclip size={14} />
            </button>

            {/* Voice Input Microphone Button */}
            <button
              type="button"
              onClick={voice.status === 'listening' ? handleStopVoice : handleStartVoice}
              disabled={isSubmitting}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: voice.status === 'listening' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                color: voice.status === 'listening' ? '#ef4444' : '#94a3b8',
                border: voice.status === 'listening' ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: voice.status === 'listening' ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={
                voice.status === 'listening'
                  ? 'Finish voice recording & review editable text'
                  : `Voice input in ${LANGUAGE_LABELS[language]} (convert speech to editable text)`
              }
              aria-label={voice.status === 'listening' ? 'Stop recording voice input' : 'Start voice input'}
            >
              <Mic size={14} />
            </button>

            {/* Stop Response Button (visible during submission) */}
            {isSubmitting && onStopRequest ? (
              <button
                type="button"
                onClick={onStopRequest}
                style={{
                  padding: '0.4rem 0.7rem',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#ef4444',
                  background: 'rgba(239, 68, 68, 0.12)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  cursor: 'pointer',
                }}
                title="Cancel active response generation"
                aria-label="Stop generating response"
              >
                <Square size={11} fill="currentColor" />
                <span>Stop</span>
              </button>
            ) : (
              /* Circular Gradient Send Button (Matching Compact Screenshot) */
              <button
                type="submit"
                disabled={(!text.trim() && attachments.length === 0) || isSubmitting || isUploading}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background:
                    (!text.trim() && attachments.length === 0) || isSubmitting || isUploading
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                  color:
                    (!text.trim() && attachments.length === 0) || isSubmitting || isUploading
                      ? 'rgba(255, 255, 255, 0.3)'
                      : '#ffffff',
                  border: 'none',
                  cursor:
                    (!text.trim() && attachments.length === 0) || isSubmitting || isUploading
                      ? 'not-allowed'
                      : 'pointer',
                  boxShadow:
                    (!text.trim() && attachments.length === 0) || isSubmitting || isUploading
                      ? 'none'
                      : '0 3px 12px rgba(124, 58, 237, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                title="Send inquiry"
                aria-label="Send message"
              >
                <Send size={14} style={{ transform: 'translateX(1px)' }} />
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
});
