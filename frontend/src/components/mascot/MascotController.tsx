import React, { useState, Suspense, lazy } from 'react';
import type { MascotState } from '../../types/chat';
import { isWebGLAvailable } from '../../lib/webgl';
import { MascotFallback2D } from './MascotFallback2D';
import { Sparkles, Eye, Brain, Volume2, Smile, AlertCircle, Box, Layers } from 'lucide-react';

const MascotCanvasLazy = lazy(() =>
  import('./MascotCanvas').then((mod) => ({ default: mod.MascotCanvas }))
);

interface MascotControllerProps {
  currentState: MascotState;
  onStateChange?: (state: MascotState) => void;
  showControls?: boolean;
  className?: string;
  size?: 'normal' | 'compact' | 'hero';
}

export const MascotController: React.FC<MascotControllerProps> = ({
  currentState,
  onStateChange,
  showControls = true,
  className = '',
  size = 'normal',
}) => {
  const [prefer2D, setPrefer2D] = useState(() => !isWebGLAvailable());

  const stateDetails: Record<
    MascotState,
    { label: string; description: string; badgeClass: string; icon: React.ReactNode }
  > = {
    idle: {
      label: 'IDLE',
      description: 'Nexus is happy and standing by to assist customers',
      badgeClass: 'badge-indigo',
      icon: <Sparkles size={12} />,
    },
    listening: {
      label: 'LISTENING',
      description: 'Listening attentively to your message...',
      badgeClass: 'badge-cyan',
      icon: <Eye size={12} />,
    },
    thinking: {
      label: 'THINKING',
      description: 'Searching FAQ knowledge base & evaluating intent...',
      badgeClass: 'badge-lavender',
      icon: <Brain size={12} />,
    },
    speaking: {
      label: 'SPEAKING',
      description: 'Presenting verified resolution details to customer',
      badgeClass: 'badge-indigo',
      icon: <Volume2 size={12} />,
    },
    happy: {
      label: 'HAPPY',
      description: 'Success! Resolved accurately with high confidence',
      badgeClass: 'badge-success',
      icon: <Smile size={12} />,
    },
    confused: {
      label: 'REVIEW REQUIRED',
      description: 'Safety check: routing to a human support specialist',
      badgeClass: 'badge-warning',
      icon: <AlertCircle size={12} />,
    },
  };

  const details = stateDetails[currentState] || stateDetails.idle;
  const stageHeight = size === 'hero' ? '240px' : size === 'compact' ? '180px' : '220px';

  return (
    <div
      className={`glass-panel mascot-controller-card ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1.25rem',
        position: 'relative',
        background: '#ffffff',
        border: '1px solid var(--surface-card-border)',
        boxShadow: 'var(--shadow-md)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: '0.82rem',
              letterSpacing: '0.04em',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
            }}
          >
            NEXUS COMPANION
          </span>
          <span className={`badge ${details.badgeClass}`} style={{ gap: '0.3rem' }}>
            {details.icon}
            {details.label}
          </span>
        </div>

        {/* 3D / 2D toggle */}
        <button
          type="button"
          onClick={() => setPrefer2D((prev) => !prev)}
          className="btn btn-ghost"
          style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem', height: '26px' }}
          title={prefer2D ? 'Switch to interactive 3D view' : 'Switch to lightweight 2D view'}
          aria-label={prefer2D ? 'Switch to interactive 3D view' : 'Switch to lightweight 2D view'}
        >
          {prefer2D ? (
            <>
              <Box size={13} color="var(--primary)" />
              <span style={{ color: 'var(--primary)', fontWeight: 600 }}>3D View</span>
            </>
          ) : (
            <>
              <Layers size={13} color="var(--text-secondary)" />
              <span>2D View</span>
            </>
          )}
        </button>
      </div>

      {/* Main Mascot Stage */}
      <div
        style={{
          width: '100%',
          height: stageHeight,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {prefer2D ? (
          <MascotFallback2D state={currentState} size={size === 'hero' ? 240 : 200} />
        ) : (
          <Suspense fallback={<MascotFallback2D state={currentState} size={size === 'hero' ? 240 : 200} />}>
            <MascotCanvasLazy state={currentState} />
          </Suspense>
        )}
      </div>

      {/* Friendly Speech Bubble / Status Caption */}
      <div
        style={{
          marginTop: '0.35rem',
          textAlign: 'center',
          minHeight: '2.2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.35rem 0.85rem',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-card-subtle)',
          border: '1px solid var(--surface-card-border)',
          width: '100%',
        }}
      >
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {details.description}
        </p>
      </div>

      {/* Interactive State Override Pills for Review / Testing */}
      {showControls && (
        <div
          style={{
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--surface-card-border)',
            width: '100%',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              marginBottom: '0.4rem',
              textAlign: 'center',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Interactive Animation States
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.3rem',
              justifyContent: 'center',
            }}
          >
            {(
              [
                'idle',
                'listening',
                'thinking',
                'speaking',
                'happy',
                'confused',
              ] as MascotState[]
            ).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => onStateChange?.(st)}
                className={`btn ${
                  currentState === st ? 'btn-primary' : 'btn-secondary'
                }`}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.72rem',
                  borderRadius: 'var(--radius-full)',
                  height: '24px',
                  fontWeight: currentState === st ? 700 : 500,
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
