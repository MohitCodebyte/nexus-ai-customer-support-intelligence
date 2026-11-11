import React, { useState } from 'react';
import type { SpeechPlaybackState, SpeechSpeed } from '../../hooks/useSpeechPlayback';
import { Volume2, VolumeX, Pause, Play, Square, Gauge } from 'lucide-react';

interface SpeechAudioControlsProps {
  messageId: string;
  content: string;
  isActive: boolean;
  playbackState: SpeechPlaybackState;
  playbackSpeed: SpeechSpeed;
  isSupported: boolean;
  onPlay: (messageId: string, text: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSetSpeed: (speed: SpeechSpeed) => void;
}

const SPEED_OPTIONS: SpeechSpeed[] = [0.75, 1, 1.25, 1.5];

export const SpeechAudioControls: React.FC<SpeechAudioControlsProps> = ({
  messageId,
  content,
  isActive,
  playbackState,
  playbackSpeed,
  isSupported,
  onPlay,
  onPause,
  onResume,
  onStop,
  onSetSpeed,
}) => {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // If SpeechSynthesis is not supported in browser
  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        className="btn btn-ghost"
        style={{
          padding: '0.25rem 0.55rem',
          fontSize: '0.74rem',
          borderRadius: 'var(--radius-full)',
          height: '28px',
          opacity: 0.5,
          cursor: 'not-allowed',
        }}
        title="Speech synthesis is not supported in this browser."
        aria-label="Text-to-speech not supported"
      >
        <VolumeX size={13} />
        <span style={{ fontSize: '0.72rem' }}>Listen</span>
      </button>
    );
  }

  // State 1: Idle (Not currently playing this message)
  if (!isActive || playbackState === 'idle') {
    return (
      <button
        type="button"
        onClick={() => onPlay(messageId, content)}
        className="btn btn-ghost"
        style={{
          padding: '0.25rem 0.55rem',
          fontSize: '0.74rem',
          borderRadius: 'var(--radius-full)',
          height: '28px',
          color: 'var(--text-secondary)',
          transition: 'all 0.2s ease',
        }}
        title="Listen to this response read aloud"
        aria-label="Read response aloud"
      >
        <Volume2 size={13} color="var(--primary)" />
        <span style={{ fontSize: '0.72rem' }}>Listen</span>
      </button>
    );
  }

  const isPlaying = playbackState === 'playing';

  // State 2: Active (Playing or Paused for this message)
  return (
    <div
      role="region"
      aria-label="Audio playback controls"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.15rem 0.45rem',
        borderRadius: 'var(--radius-full)',
        background: isPlaying ? 'var(--primary-soft)' : 'var(--bg-secondary)',
        border: isPlaying ? '1px solid rgba(79, 125, 243, 0.35)' : '1px solid var(--surface-card-border)',
        boxShadow: 'var(--shadow-xs)',
        position: 'relative',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      {/* Animated Soundwave Indicator */}
      {isPlaying && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            paddingRight: '0.2rem',
          }}
          aria-hidden="true"
        >
          <span
            style={{
              width: '3px',
              height: '10px',
              background: 'var(--primary)',
              borderRadius: '2px',
              animation: 'pulse 0.8s ease-in-out infinite',
            }}
          />
          <span
            style={{
              width: '3px',
              height: '14px',
              background: 'var(--primary)',
              borderRadius: '2px',
              animation: 'pulse 1.1s ease-in-out infinite 0.2s',
            }}
          />
          <span
            style={{
              width: '3px',
              height: '8px',
              background: 'var(--primary)',
              borderRadius: '2px',
              animation: 'pulse 0.9s ease-in-out infinite 0.4s',
            }}
          />
        </span>
      )}

      {/* Pause / Resume Button */}
      <button
        type="button"
        onClick={isPlaying ? onPause : onResume}
        className="btn btn-ghost"
        style={{
          padding: '0.2rem 0.45rem',
          fontSize: '0.72rem',
          borderRadius: 'var(--radius-full)',
          height: '24px',
          color: 'var(--primary)',
          fontWeight: 600,
        }}
        title={isPlaying ? 'Pause speech playback' : 'Resume speech playback'}
        aria-label={isPlaying ? 'Pause playback' : 'Resume playback'}
      >
        {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        <span style={{ fontSize: '0.7rem', marginLeft: '0.15rem' }}>{isPlaying ? 'Pause' : 'Resume'}</span>
      </button>

      {/* Stop Button */}
      <button
        type="button"
        onClick={onStop}
        className="btn btn-ghost"
        style={{
          padding: '0.2rem 0.4rem',
          fontSize: '0.72rem',
          borderRadius: 'var(--radius-full)',
          height: '24px',
          color: 'var(--danger)',
        }}
        title="Stop speech playback"
        aria-label="Stop playback"
      >
        <Square size={11} fill="currentColor" />
        <span style={{ fontSize: '0.7rem', marginLeft: '0.15rem' }}>Stop</span>
      </button>

      {/* Playback Speed Selector (0.75x, 1x, 1.25x, 1.5x) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setShowSpeedMenu(!showSpeedMenu)}
          className="btn btn-ghost"
          style={{
            padding: '0.15rem 0.4rem',
            fontSize: '0.68rem',
            borderRadius: 'var(--radius-full)',
            height: '24px',
            color: 'var(--text-secondary)',
            fontWeight: 700,
            background: 'rgba(255, 255, 255, 0.7)',
            border: '1px solid var(--surface-card-border)',
          }}
          title="Change playback speed"
          aria-label={`Playback speed ${playbackSpeed}x`}
          aria-expanded={showSpeedMenu}
        >
          <Gauge size={10} style={{ marginRight: '0.2rem' }} />
          <span>{playbackSpeed}x</span>
        </button>

        {showSpeedMenu && (
          <div
            style={{
              position: 'absolute',
              bottom: '120%',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#ffffff',
              border: '1px solid var(--surface-card-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: '0.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
              zIndex: 30,
              minWidth: '68px',
            }}
          >
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => {
                  onSetSpeed(speed);
                  setShowSpeedMenu(false);
                }}
                style={{
                  border: 'none',
                  background: speed === playbackSpeed ? 'var(--primary-soft)' : 'transparent',
                  color: speed === playbackSpeed ? 'var(--primary)' : 'var(--text-primary)',
                  fontWeight: speed === playbackSpeed ? 700 : 500,
                  fontSize: '0.72rem',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {speed}x
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

