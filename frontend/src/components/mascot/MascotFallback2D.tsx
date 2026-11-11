import React from 'react';
import type { MascotState } from '../../types/chat';

interface MascotFallback2DProps {
  state: MascotState;
  className?: string;
  size?: number;
}

export const MascotFallback2D: React.FC<MascotFallback2DProps> = ({
  state,
  className = '',
  size = 220,
}) => {
  // Luminous state colors
  const stateThemes: Record<
    MascotState,
    { eye: string; aura: string; ring: string }
  > = {
    idle: {
      eye: '#00f0ff',
      aura: 'rgba(0, 240, 255, 0.16)',
      ring: '#06b6d4',
    },
    listening: {
      eye: '#38bdf8',
      aura: 'rgba(56, 189, 248, 0.18)',
      ring: '#0284c7',
    },
    thinking: {
      eye: '#a855f7',
      aura: 'rgba(168, 85, 247, 0.2)',
      ring: '#9333ea',
    },
    speaking: {
      eye: '#06b6d4',
      aura: 'rgba(6, 182, 212, 0.18)',
      ring: '#0891b2',
    },
    happy: {
      eye: '#10b981',
      aura: 'rgba(16, 185, 129, 0.22)',
      ring: '#059669',
    },
    confused: {
      eye: '#f59e0b',
      aura: 'rgba(245, 158, 11, 0.2)',
      ring: '#d97706',
    },
  };

  const current = stateThemes[state] || stateThemes.idle;
  const tiltDeg = state === 'confused' ? -10 : state === 'listening' ? 4 : state === 'thinking' ? 6 : 0;

  return (
    <div
      className={`mascot-2d-container ${className}`}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: `drop-shadow(0 10px 24px ${current.aura})`,
          transition: 'all 0.35s ease',
        }}
      >
        <defs>
          <radialGradient id={`aura-${state}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={current.aura} stopOpacity="1" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="pearlWhite" x1="50" y1="20" x2="150" y2="180">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f8faff" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>

          <linearGradient id="darkVisor" x1="100" y1="55" x2="100" y2="120">
            <stop offset="0%" stopColor="#0b233a" />
            <stop offset="40%" stopColor="#071828" />
            <stop offset="100%" stopColor="#030d17" />
          </linearGradient>

          <filter id="visorGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={current.eye} floodOpacity="0.6" />
          </filter>
        </defs>

        {/* Ambient glow */}
        <circle cx="100" cy="100" r="92" fill={`url(#aura-${state})`} />

        {/* Soft ground contact shadow */}
        <ellipse cx="100" cy="178" rx="44" ry="7" fill="#cbd5e1" opacity="0.4" />

        {/* Floating Robot Body with Tilts */}
        <g
          transform={`rotate(${tiltDeg} 100 100)`}
          style={{
            transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Porcelain White Torso */}
          <ellipse cx="100" cy="136" rx="36" ry="28" fill="url(#pearlWhite)" stroke="#e2e8f0" strokeWidth="1.5" />

          {/* Cyan Collar Accent */}
          <ellipse cx="100" cy="116" rx="20" ry="5" fill="#06b6d4" />

          {/* Glowing Mint/Cyan Chest Reactor Core (Centered) */}
          <circle cx="100" cy="136" r="9" fill={current.eye} filter="url(#visorGlow)" />
          <circle cx="100" cy="136" r="11" stroke="#06b6d4" strokeWidth="2" fill="none" opacity="0.8" />

          {/* Left Resting Arm */}
          <circle cx="60" cy="138" r="9" fill="url(#pearlWhite)" stroke="#cbd5e1" strokeWidth="1.2" />

          {/* Right Waving Arm (Greeting gesture matching Image 3) */}
          <g transform={state === 'happy' ? 'translate(0, -6)' : 'none'}>
            <circle cx="140" cy="122" r="9" fill="url(#pearlWhite)" stroke="#cbd5e1" strokeWidth="1.2" />
            {/* Waving Hand with fingers */}
            <circle cx="146" cy="112" r="7" fill="url(#pearlWhite)" stroke="#cbd5e1" strokeWidth="1" />
            <circle cx="146" cy="112" r="3" fill="#06b6d4" />
            {/* Extended Fingers */}
            <line x1="148" y1="108" x2="152" y2="103" stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="145" y1="106" x2="147" y2="100" stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="142" y1="106" x2="142" y2="101" stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
          </g>

          {/* ============================================================= */}
          {/* WHITE HELMET HEAD WITH TOP CREST & CYAN EAR PUFFS             */}
          {/* ============================================================= */}

          {/* Top Mint / Turquoise Crest Fin */}
          <path d="M92 48 Q100 40 108 48 L106 54 Q100 50 94 54 Z" fill="#06b6d4" />
          <circle cx="100" cy="44" r="4" fill="#38bfa7" />

          {/* Cyan Ear Pucks (Left and Right) */}
          {/* Left Ear Puck */}
          <rect x="44" y="68" width="10" height="28" rx="5" fill="#0891b2" />
          <circle cx="49" cy="82" r="4" stroke="#ffffff" strokeWidth="1.5" fill="#06b6d4" />

          {/* Right Ear Puck */}
          <rect x="146" y="68" width="10" height="28" rx="5" fill="#0891b2" />
          <circle cx="151" cy="82" r="4" stroke="#ffffff" strokeWidth="1.5" fill="#06b6d4" />

          {/* White Outer Helmet Shell */}
          <rect
            x="52"
            y="50"
            width="96"
            height="76"
            rx="34"
            fill="url(#pearlWhite)"
            stroke="#e2e8f0"
            strokeWidth="1.8"
          />

          {/* ============================================================= */}
          {/* DARK TEAL GLOSSY VISOR SCREEN (Image 3)                       */}
          {/* ============================================================= */}
          <rect
            x="60"
            y="58"
            width="80"
            height="60"
            rx="24"
            fill="url(#darkVisor)"
            stroke="#06b6d4"
            strokeWidth="1.2"
            strokeOpacity="0.4"
          />

          {/* Glossy Reflection Arc on Visor */}
          <path
            d="M66 68 Q100 62 134 68"
            stroke="#ffffff"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.25"
          />

          {/* ============================================================= */}
          {/* LUMINOUS CYAN EYES, EYEBROWS & SMILE ON DARK VISOR            */}
          {/* ============================================================= */}

          {/* Eyebrows */}
          {state === 'confused' ? (
            <g>
              <line x1="74" y1="71" x2="86" y2="69" stroke={current.eye} strokeWidth="2.2" strokeLinecap="round" filter="url(#visorGlow)" />
              <line x1="114" y1="67" x2="126" y2="72" stroke={current.eye} strokeWidth="2.2" strokeLinecap="round" filter="url(#visorGlow)" />
            </g>
          ) : (
            <g>
              <path d="M74 72 Q80 69 86 72" stroke={current.eye} strokeWidth="2.2" strokeLinecap="round" fill="none" filter="url(#visorGlow)" />
              <path d="M114 72 Q120 69 126 72" stroke={current.eye} strokeWidth="2.2" strokeLinecap="round" fill="none" filter="url(#visorGlow)" />
            </g>
          )}

          {/* Eyes & Catchlights */}
          {state === 'happy' ? (
            <g filter="url(#visorGlow)">
              <path d="M74 85 Q80 75 86 85" stroke={current.eye} strokeWidth="3.5" strokeLinecap="round" fill="none" />
              <path d="M114 85 Q120 75 126 85" stroke={current.eye} strokeWidth="3.5" strokeLinecap="round" fill="none" />
              <path d="M92 98 Q100 106 108 98" stroke={current.eye} strokeWidth="2.5" strokeLinecap="round" fill="none" />
            </g>
          ) : (
            <g filter="url(#visorGlow)">
              {/* Left Eye */}
              <ellipse cx="80" cy="84" rx="8" ry="11" fill={current.eye} />
              <circle cx="83" cy="80" r="3.2" fill="#ffffff" />
              <circle cx="78" cy="87" r="1.5" fill="#ffffff" opacity="0.8" />

              {/* Right Eye */}
              <ellipse cx="120" cy="84" rx="8" ry="11" fill={current.eye} />
              <circle cx="123" cy="80" r="3.2" fill="#ffffff" />
              <circle cx="118" cy="87" r="1.5" fill="#ffffff" opacity="0.8" />

              {/* Smiling Mouth */}
              {state === 'speaking' ? (
                <ellipse cx="100" cy="99" rx="6" ry="4" fill={current.eye} />
              ) : state === 'confused' ? (
                <path d="M94 100 Q100 97 106 100" stroke={current.eye} strokeWidth="2.2" strokeLinecap="round" fill="none" />
              ) : (
                <path d="M93 97 Q100 104 107 97" stroke={current.eye} strokeWidth="2.4" strokeLinecap="round" fill="none" />
              )}
            </g>
          )}

          {state === 'confused' && (
            <text x="136" y="58" fill="#f59e0b" fontSize="18" fontWeight="bold">?</text>
          )}
        </g>
      </svg>
    </div>
  );
};
