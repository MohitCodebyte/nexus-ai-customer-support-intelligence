import React from 'react';
import type { RetrievalSource } from '../../types/chat';
import { BookOpen, ExternalLink, X, FileText } from 'lucide-react';

interface RetrievalSourceDrawerProps {
  sources: RetrievalSource[];
  isOpen: boolean;
  onClose: () => void;
  topIntent?: string;
  intentMargin?: number | null;
}

export const RetrievalSourceDrawer: React.FC<RetrievalSourceDrawerProps> = ({
  sources,
  isOpen,
  onClose,
  topIntent,
  intentMargin,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        width: '100%',
        marginTop: '0.85rem',
        padding: '1.15rem',
        borderRadius: 'var(--radius-md)',
        background: '#f8faff',
        border: '1px solid #dbeafe',
        boxShadow: 'var(--shadow-sm)',
        position: 'relative',
      }}
      role="region"
      aria-label="Retrieved Knowledge Sources"
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.85rem',
          paddingBottom: '0.65rem',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              padding: '0.35rem',
              borderRadius: '8px',
              background: 'var(--primary-soft)',
              color: 'var(--primary)',
            }}
          >
            <BookOpen size={15} />
          </div>
          <div>
            <h4
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.92rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              Verified Knowledge Sources ({sources.length} Documents)
            </h4>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Semantic vector match from indexed banking FAQ database
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost"
          style={{ padding: '0.25rem', borderRadius: '50%' }}
          aria-label="Close sources panel"
        >
          <X size={15} color="var(--text-secondary)" />
        </button>
      </div>

      {/* RAG Telemetry chips */}
      {(topIntent || typeof intentMargin === 'number') && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.45rem',
            marginBottom: '0.85rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            fontSize: '0.76rem',
          }}
        >
          {topIntent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Top Intent:</span>
              <span className="badge badge-indigo">{topIntent}</span>
            </div>
          )}
          {typeof intentMargin === 'number' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Intent Margin:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)', fontWeight: 600 }}>
                {intentMargin.toFixed(4)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Sources List */}
      {sources.length === 0 ? (
        <div
          style={{
            padding: '1.5rem',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '0.82rem',
          }}
        >
          No explicit source documents were returned for this inquiry.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            maxHeight: '300px',
            overflowY: 'auto',
            paddingRight: '0.35rem',
          }}
        >
          {sources.map((src, index) => {
            const rawScore =
              typeof src.similarity_score === 'number'
                ? src.similarity_score
                : null;

            return (
              <div
                key={`${src.doc_id ?? index}-${index}`}
                style={{
                  padding: '0.75rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                {/* Meta Badges */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span className="badge badge-cyan">
                      <FileText size={10} />
                      {src.doc_id ? `Doc #${src.doc_id}` : `Source ${index + 1}`}
                    </span>
                    {src.intent && (
                      <span className="badge badge-indigo">
                        {src.intent}
                      </span>
                    )}
                  </div>

                  {rawScore !== null && (
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-secondary)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        border: '1px solid #e2e8f0',
                      }}
                      title="Raw Cosine Similarity Metric (not a probability)"
                    >
                      Cosine Score:{' '}
                      <strong style={{ color: 'var(--primary)' }}>
                        {rawScore.toFixed(4)}
                      </strong>
                    </div>
                  )}
                </div>

                {/* Question */}
                {src.question && (
                  <div
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginTop: '0.15rem',
                    }}
                  >
                    Q: {src.question}
                  </div>
                )}

                {/* Answer */}
                {src.answer && (
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      background: 'var(--surface-card-subtle)',
                      padding: '0.5rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      borderLeft: '3px solid var(--primary)',
                    }}
                  >
                    {src.answer}
                  </div>
                )}

                {/* Origin */}
                {src.source && (
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      marginTop: '0.1rem',
                    }}
                  >
                    <ExternalLink size={10} />
                    <span>Origin: {src.source}</span>
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
