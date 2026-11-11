import React, { useState, Suspense, lazy } from 'react';
import type { MascotState } from '../../types/chat';
import { MascotFallback2D } from '../mascot/MascotFallback2D';

const MascotCanvasLazy = lazy(() =>
  import('../mascot/MascotCanvas').then((mod) => ({ default: mod.MascotCanvas }))
);
import {
  MessageSquare,
  ShieldCheck,
  Globe2,
  FileCheck2,
  Mic,
  Cpu,
  ArrowRight,
  Database,
  Lock,
  Headphones,
  BarChart3,
  CheckCircle2,
  Send,
  Bot,
  Mail,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';

interface LandingViewProps {
  onOpenChat: () => void;
  onOpenAgentDesk: () => void;
  onOpenAdmin: () => void;
  onOpenKnowledge: () => void;
  onOpenContact?: () => void;
  isBackendOnline: boolean | null;
  backendLatency?: number;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onOpenChat,
  onOpenAgentDesk,
  onOpenAdmin,
  onOpenKnowledge,
  onOpenContact,
  isBackendOnline: _isBackendOnline,
  backendLatency: _backendLatency,
}) => {
  const [mascotMood] = useState<MascotState>('idle');

  // Contact form state
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    message: '',
    consent: false,
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showMessageField, setShowMessageField] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!formData.name.trim()) {
      setFormError('Please enter your full name.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!formData.consent) {
      setFormError('You must agree to the privacy policy to submit.');
      return;
    }

    setFormSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit contact message.');
      }
      setFormSuccess(
        data.message || 'Thank you! Your inquiry has been securely recorded. Our team will get back to you shortly.'
      );
      setFormData({
        name: '',
        company: '',
        email: '',
        phone: '',
        message: '',
        consent: false,
      });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Subtle starry dust particle coordinates matching the VaatBot hero background
  const HERO_PARTICLES = [
    { top: '12%', left: '8%', size: 3, opacity: 0.55, delay: '0s' },
    { top: '22%', left: '18%', size: 2, opacity: 0.35, delay: '1.2s' },
    { top: '8%', left: '34%', size: 3.5, opacity: 0.65, delay: '2.1s' },
    { top: '38%', left: '24%', size: 2.5, opacity: 0.4, delay: '0.8s' },
    { top: '16%', left: '46%', size: 2, opacity: 0.5, delay: '1.7s' },
    { top: '6%', left: '58%', size: 3, opacity: 0.45, delay: '2.5s' },
    { top: '32%', left: '50%', size: 2, opacity: 0.3, delay: '0.4s' },
    { top: '14%', left: '72%', size: 4, opacity: 0.7, delay: '1.9s' },
    { top: '30%', left: '68%', size: 2.5, opacity: 0.35, delay: '3.1s' },
    { top: '10%', left: '88%', size: 3, opacity: 0.55, delay: '0.6s' },
    { top: '24%', left: '84%', size: 2, opacity: 0.4, delay: '2.3s' },
    { top: '46%', left: '92%', size: 3, opacity: 0.5, delay: '1.4s' },
    { top: '64%', left: '8%', size: 2.5, opacity: 0.4, delay: '2.8s' },
    { top: '80%', left: '20%', size: 2, opacity: 0.3, delay: '0.9s' },
    { top: '84%', left: '36%', size: 3, opacity: 0.45, delay: '1.6s' },
    { top: '72%', left: '62%', size: 2, opacity: 0.35, delay: '2.4s' },
    { top: '86%', left: '78%', size: 3.5, opacity: 0.6, delay: '0.3s' },
    { top: '70%', left: '94%', size: 2, opacity: 0.4, delay: '1.8s' },
  ];

  const ARCHITECTURE_PILLARS = [
    {
      icon: Cpu,
      title: 'Banking77 Intent Engine',
      badge: 'Fine-Tuned SVM',
      description:
        'Trained on 13,000+ certified banking queries across 77 domain categories. Uses TF-IDF semantic vectorization with calibrated probability gating.',
      metric: '77 Categories',
    },
    {
      icon: Database,
      title: 'Verified Semantic RAG',
      badge: 'Bitext FAQ Index',
      description:
        'Dense vector embeddings matched against official banking policies with cosine similarity thresholds and intent-margin validation to eliminate hallucinations.',
      metric: 'Zero Hallucination Gate',
    },
    {
      icon: Globe2,
      title: 'Multilingual & Hinglish',
      badge: 'Auto Detection',
      description:
        'Real-time language identification across English, Devanagari Hindi, and Romanized Hinglish with semantic canonicalization before model routing.',
      metric: '3 Dialects Supported',
    },
    {
      icon: FileCheck2,
      title: 'Air-Gapped Private Docs',
      badge: 'Strict Isolation',
      description:
        'Instant text extraction from PDFs, statements, CSVs, and images. Scoped exclusively to the customer turn and strictly never indexed into shared knowledge.',
      metric: '10 MB Secure Jail',
    },
  ];

  const CAPABILITY_CARDS = [
    {
      icon: Mic,
      title: 'Voice Input & TTS Read Aloud',
      desc: 'Browser speech recognition with editable transcripts and SpeechSynthesis with variable playback speed (0.75x to 1.5x) and speaking mascot animation.',
    },
    {
      icon: ShieldCheck,
      title: 'Cryptographic Session Ownership',
      desc: 'Server-managed anonymous customer tokens prevent cross-customer access and conversation tampering without forcing intrusive account sign-ups.',
    },
    {
      icon: Headphones,
      title: 'Human Support Handoff',
      desc: 'One-click agent escalation queue with transcript preservation, ticket status tracking, agent replies into chat, and internal staff notes.',
    },
    {
      icon: BarChart3,
      title: 'Real-Time Admin CSAT Analytics',
      desc: 'Real aggregate 1-5 star ratings, feedback comments, Banking77 intent frequency distributions, and privacy-protected audit inspector.',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3.5rem', width: '100%', padding: '0.5rem 0 3rem 0' }}>
      {/* ===================================================================== */}
      {/* 1. HERO SECTION — EXACT VAATBOT-STYLE NEXUS AI COMPOSITION           */}
      {/* ===================================================================== */}
      <section
        id="hero"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--radius-xl)',
          background: 'radial-gradient(ellipse at 50% 30%, #0c1326 0%, #060810 75%)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 20px 60px -15px rgba(0, 0, 0, 0.9), 0 0 40px rgba(14, 165, 233, 0.05)',
          padding: 'clamp(2.5rem, 5vw, 4rem) clamp(1.5rem, 4vw, 3.5rem)',
        }}
      >
        {/* Subtle glowing background starry particles */}
        {HERO_PARTICLES.map((particle, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              top: particle.top,
              left: particle.left,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              borderRadius: '50%',
              background: '#ffffff',
              boxShadow: `0 0 ${particle.size * 3}px rgba(56, 189, 248, 0.9)`,
              opacity: particle.opacity,
              pointerEvents: 'none',
              animation: `twinkleSlow 4s ease-in-out infinite ${particle.delay}`,
            }}
          />
        ))}

        {/* Horizontal Glowing Axis Line with Center Luminous Node (Matching VaatBot Reference) */}
        <div
          style={{
            position: 'absolute',
            top: '52%',
            left: '42%',
            right: '2%',
            height: '1px',
            background: 'linear-gradient(90deg, rgba(56, 189, 248, 0) 0%, rgba(56, 189, 248, 0.45) 25%, rgba(129, 140, 248, 0.45) 75%, rgba(56, 189, 248, 0) 100%)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          {/* Central Luminous Star Node */}
          <div
            style={{
              position: 'absolute',
              left: '28%',
              top: '-5px',
              width: '11px',
              height: '11px',
              borderRadius: '50%',
              background: '#ffffff',
              boxShadow: '0 0 14px 4px rgba(56, 189, 248, 0.95), 0 0 28px 8px rgba(129, 140, 248, 0.6)',
            }}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.15fr) minmax(340px, 0.85fr)',
            gap: '2.5rem',
            alignItems: 'center',
            position: 'relative',
            zIndex: 2,
          }}
          className="hero-grid"
        >
          {/* Left Column: Headline & Action */}
          <div>
            {/* Eyebrow Pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.55rem',
                padding: '0.4rem 1.05rem',
                borderRadius: '9999px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                fontSize: '0.84rem',
                fontWeight: 600,
                letterSpacing: '0.04em',
                marginBottom: '1.6rem',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#818cf8',
                  display: 'inline-block',
                  boxShadow: '0 0 8px #818cf8',
                }}
              />
              <span>AI Assistant</span>
            </div>

            <h1
              style={{
                fontFamily: 'var(--font-display, Inter, sans-serif)',
                fontSize: 'clamp(2.7rem, 4.6vw, 4.1rem)',
                fontWeight: 800,
                letterSpacing: '-0.035em',
                lineHeight: 1.12,
                color: '#ffffff',
                marginBottom: '1.4rem',
              }}
            >
              Supercharge Your<br />
              Support with<br />
              <span
                style={{
                  background: 'linear-gradient(135deg, #38bdf8 0%, #60a5fa 50%, #818cf8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  position: 'relative',
                  display: 'inline-block',
                }}
              >
                AI Conversations
                <span
                  style={{
                    position: 'absolute',
                    bottom: '-6px',
                    left: 0,
                    width: '100%',
                    height: '3px',
                    borderRadius: '2px',
                    background: 'linear-gradient(90deg, #38bdf8 0%, rgba(129, 140, 248, 0.4) 100%)',
                    boxShadow: '0 0 12px rgba(56, 189, 248, 0.75)',
                  }}
                />
              </span>
            </h1>

            <p
              style={{
                fontSize: '1.05rem',
                lineHeight: 1.65,
                color: '#94a3b8',
                maxWidth: '480px',
                marginBottom: '2.4rem',
              }}
            >
              From customer service to intelligent banking support, Nexus makes every conversation smarter.
            </p>

            {/* CTAs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={onOpenChat}
                style={{
                  padding: '0.85rem 1.85rem',
                  fontSize: '0.96rem',
                  borderRadius: '9999px',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 50%, #0ea5e9 100%)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 22px rgba(37, 99, 235, 0.5)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 28px rgba(37, 99, 235, 0.65)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 22px rgba(37, 99, 235, 0.5)';
                }}
              >
                <span>Get Started Free</span>
                <span style={{ fontSize: '1.1rem' }}>→</span>
              </button>

              <button
                type="button"
                onClick={onOpenChat}
                style={{
                  padding: '0.85rem 1.65rem',
                  fontSize: '0.96rem',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(10px)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span>🚀</span>
                <span>See Demo</span>
              </button>
            </div>
          </div>

          {/* Right Column: 3D Robot Mascot (Direct on Background, Large Full-Body, with Animated Speech Bubbles positioned safely outside face) */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              minHeight: '480px',
              height: '520px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Animated Speech Bubble: "How can I help you today?" (Positioned safely above and outside right ear) */}
            <div
              style={{
                position: 'absolute',
                top: '2%',
                right: '0%',
                padding: '0.65rem 1.3rem',
                borderRadius: '16px',
                background: 'rgba(12, 18, 34, 0.92)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(129, 140, 248, 0.14)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: '#ffffff',
                fontSize: '0.88rem',
                fontWeight: 600,
                zIndex: 10,
                pointerEvents: 'none',
                animation: 'floatSlow 5s ease-in-out infinite 0.75s',
              }}
            >
              How can I help you today?
              {/* Bubble Pointer Tail */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '-5px',
                  left: '24px',
                  width: '10px',
                  height: '10px',
                  background: 'rgba(12, 18, 34, 0.92)',
                  borderRight: '1px solid rgba(255, 255, 255, 0.14)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.14)',
                  transform: 'rotate(45deg)',
                }}
              />
            </div>

            {/* 3D Robot Mascot Canvas */}
            <div
              style={{
                width: '100%',
                height: '100%',
                position: 'relative',
              }}
            >
              <Suspense fallback={<MascotFallback2D state={mascotMood} size={300} />}>
                <MascotCanvasLazy state={mascotMood} fullBody={true} />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. CORE ARCHITECTURE PILLARS (ML + RAG + MULTILINGUAL + DOCS) */}
      {/* ===================================================================== */}
      <section id="features">
        <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 2.5rem auto' }}>
          <span className="badge badge-cyan" style={{ marginBottom: '0.5rem' }}>
            Engineered For Zero Hallucination
          </span>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.7rem, 2.5vw, 2.2rem)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              marginBottom: '0.75rem',
            }}
          >
            Dual AI Architecture: Statistical ML + Verified Semantic RAG
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.96rem', lineHeight: 1.6 }}>
            Nexus never guesses or makes up banking guidelines. Every customer inquiry is routed through a rigorous 4-step pipeline before an answer is delivered.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {ARCHITECTURE_PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="interactive-card"
                style={{
                  padding: '1.75rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.9rem',
                  border: '1px solid var(--surface-card-border)',
                  background: 'var(--surface-card)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'var(--primary-soft)',
                      color: 'var(--primary-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <span className="badge badge-primary">{pillar.badge}</span>
                </div>

                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    {pillar.title}
                  </h3>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {pillar.description}
                  </p>
                </div>

                <div
                  style={{
                    marginTop: 'auto',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: 'var(--mint-light)',
                  }}
                >
                  <CheckCircle2 size={13} />
                  <span>{pillar.metric}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3. CAPABILITIES SHOWCASE */}
      {/* ===================================================================== */}
      <section
        id="how-it-works"
        className="glass-panel"
        style={{
          padding: '2.5rem 2rem',
          background: 'linear-gradient(180deg, var(--surface-card) 0%, rgba(8, 13, 24, 0.95) 100%)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        <div style={{ marginBottom: '2rem' }}>
          <span className="badge badge-lavender" style={{ marginBottom: '0.5rem' }}>
            Production SaaS Features
          </span>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Comprehensive Omnichannel Intelligence
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          {CAPABILITY_CARDS.map((cap) => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.title}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '9px',
                    background: 'rgba(139, 92, 246, 0.12)',
                    color: 'var(--secondary-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <Icon size={18} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    {cap.title}
                  </h4>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {cap.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Action Navigation Grid */}
        <div
          style={{
            marginTop: '2.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid var(--surface-card-border)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            <span>Ready to test live responses with Bank statements, Hindi queries, or human agent handoff?</span>
            {_isBackendOnline !== null && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: _isBackendOnline ? 'var(--mint-light)' : 'var(--danger)',
                }}
              >
                <span className={`status-dot ${_isBackendOnline ? 'online' : 'offline'}`} />
                {_isBackendOnline ? `System Online (${_backendLatency || 12}ms)` : 'Offline'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={onOpenChat} className="btn btn-primary" style={{ padding: '0.55rem 1.15rem' }}>
              <MessageSquare size={15} />
              <span>Open AI Chat</span>
            </button>
            <button type="button" onClick={onOpenAgentDesk} className="btn btn-secondary" style={{ padding: '0.55rem 1.15rem' }}>
              <Headphones size={15} />
              <span>Agent Desk</span>
            </button>
            <button type="button" onClick={onOpenAdmin} className="btn btn-ghost" style={{ padding: '0.55rem 1.15rem' }}>
              <BarChart3 size={15} />
              <span>Admin Analytics</span>
            </button>
            <button type="button" onClick={onOpenKnowledge} className="btn btn-secondary" style={{ padding: '0.55rem 1.15rem' }}>
              <Database size={15} />
              <span>Explore Knowledge Base</span>
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 4. PRIVACY & SECURITY GUARANTEES */}
      {/* ===================================================================== */}
      <section
        style={{
          padding: '2rem 2.25rem',
          borderRadius: 'var(--radius-lg)',
          background: 'rgba(16, 185, 129, 0.05)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Lock size={24} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
              Zero-Trust Financial Privacy & Knowledge Isolation
            </div>
            <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', maxWidth: '780px' }}>
              Customer conversations and uploaded debit statements are strictly server-jailed to the active session.
              Internal ML confidence matrices and RAG retrieval vectors are never exposed to customer viewports, and customer files are never added to the shared knowledge base.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenChat}
          className="btn btn-secondary"
          style={{ padding: '0.6rem 1.1rem', fontSize: '0.85rem' }}
        >
          <span>Start Anonymous Session</span>
          <ArrowRight size={14} />
        </button>
      </section>

      {/* ===================================================================== */}
      {/* 5. EXACT CAMERON-STYLE CONTACT US CARD SECTION                        */}
      {/* ===================================================================== */}
      <section
        id="contact"
        style={{
          borderRadius: '28px',
          background: 'linear-gradient(135deg, #090e1e 0%, #060915 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.8), 0 0 40px rgba(124, 58, 237, 0.08)',
          padding: 'clamp(2rem, 5vw, 3.5rem)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Three Window Dots (Red, Amber, Green) matching the Reference */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '2.5rem' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)',
            gap: '3.5rem',
            alignItems: 'start',
          }}
          className="contact-card-grid"
        >
          {/* Left Column: Heading, Description, Profile & Floating AI Button */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Inter, sans-serif)',
                fontSize: 'clamp(2.4rem, 4vw, 3.2rem)',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
                color: '#ffffff',
                marginBottom: '1.25rem',
              }}
            >
              Let's Connect with Nexus AI
            </h2>

            <p
              style={{
                fontSize: '1.05rem',
                color: '#94a3b8',
                lineHeight: 1.6,
                maxWidth: '440px',
                marginBottom: '2.5rem',
              }}
            >
              Have questions about Nexus AI Support? Need help or want to share your feedback? We'd love to hear from you.
            </p>

            {/* Profile Visual (Nexus AI Support Avatar) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 4px 16px rgba(124, 58, 237, 0.4)',
                  flexShrink: 0,
                }}
              >
                <Bot size={28} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#ffffff' }}>
                  Nexus AI Support
                </div>
                <a
                  href="mailto:kushwahmitansh@gmail.com"
                  style={{
                    fontSize: '0.92rem',
                    color: '#38bdf8',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    marginTop: '2px',
                    transition: 'color 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#818cf8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#38bdf8')}
                >
                  <Mail size={13} />
                  <span>kushwahmitansh@gmail.com</span>
                </a>
                {onOpenContact && (
                  <div style={{ marginTop: '0.45rem' }}>
                    <button
                      type="button"
                      onClick={onOpenContact}
                      style={{
                        background: 'none',
                        border: '1px solid rgba(139, 92, 246, 0.45)',
                        borderRadius: '8px',
                        color: '#a78bfa',
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <span>Open Dedicated Contact Portal →</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Recreated Floating Assistant Button (Near lower-left corner) */}
            <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={onOpenChat}
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                    border: 'none',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 0 32px 8px rgba(139, 92, 246, 0.45), 0 8px 24px rgba(0, 0, 0, 0.4)',
                    transition: 'all 0.25s ease',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.08)';
                    e.currentTarget.style.boxShadow = '0 0 42px 12px rgba(139, 92, 246, 0.65), 0 10px 28px rgba(0, 0, 0, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1.0)';
                    e.currentTarget.style.boxShadow = '0 0 32px 8px rgba(139, 92, 246, 0.45), 0 8px 24px rgba(0, 0, 0, 0.4)';
                  }}
                  title="Launch Nexus AI Assistant"
                  aria-label="Launch Nexus AI Assistant"
                >
                  <MessageSquare size={26} />
                </button>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  <span style={{ fontWeight: 600, color: '#f1f5f9' }}>Need instant answers?</span>
                  <br />
                  Click to open Nexus AI Assistant anytime.
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Working Contact Form */}
          <form
            onSubmit={handleContactSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.4rem',
            }}
          >
            {/* Feedback notifications */}
            {formSuccess && (
              <div
                style={{
                  padding: '1rem 1.25rem',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#34d399',
                  fontSize: '0.92rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                }}
              >
                <Check size={18} />
                <span>{formSuccess}</span>
              </div>
            )}

            {formError && (
              <div
                style={{
                  padding: '1rem 1.25rem',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#f87171',
                  fontSize: '0.92rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                }}
              >
                <AlertCircle size={18} />
                <span>{formError}</span>
              </div>
            )}

            {/* FULL NAME */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  marginBottom: '0.5rem',
                }}
              >
                Full Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Your full name"
                style={{
                  width: '100%',
                  padding: '0.95rem 1.25rem',
                  borderRadius: '14px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
                  outline: 'none',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                  e.currentTarget.style.boxShadow = '0 0 16px rgba(139, 92, 246, 0.25)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3)';
                }}
              />
            </div>

            {/* COMPANY NAME */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  marginBottom: '0.5rem',
                }}
              >
                Company Name
              </label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Your company name (optional)"
                style={{
                  width: '100%',
                  padding: '0.95rem 1.25rem',
                  borderRadius: '14px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
                  outline: 'none',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                  e.currentTarget.style.boxShadow = '0 0 16px rgba(139, 92, 246, 0.25)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3)';
                }}
              />
            </div>

            {/* EMAIL */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  marginBottom: '0.5rem',
                }}
              >
                Email <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Your email address"
                style={{
                  width: '100%',
                  padding: '0.95rem 1.25rem',
                  borderRadius: '14px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
                  outline: 'none',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                  e.currentTarget.style.boxShadow = '0 0 16px rgba(139, 92, 246, 0.25)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3)';
                }}
              />
            </div>

            {/* PHONE */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  marginBottom: '0.5rem',
                }}
              >
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Your phone number (optional)"
                style={{
                  width: '100%',
                  padding: '0.95rem 1.25rem',
                  borderRadius: '14px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
                  outline: 'none',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                  e.currentTarget.style.boxShadow = '0 0 16px rgba(139, 92, 246, 0.25)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3)';
                }}
              />
            </div>

            {/* Expandable Optional Message Field */}
            {!showMessageField ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowMessageField(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#818cf8',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '0.2rem 0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <span>+ Add a message or query details (optional)</span>
                </button>
              </div>
            ) : (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    marginBottom: '0.5rem',
                  }}
                >
                  Message
                </label>
                <textarea
                  rows={3}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Tell us about your requirements or questions..."
                  style={{
                    width: '100%',
                    padding: '0.95rem 1.25rem',
                    borderRadius: '14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    fontSize: '0.95rem',
                    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            )}

            {/* Privacy Policy Checkbox & Send Message Button Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1.25rem',
                marginTop: '0.5rem',
              }}
            >
              {/* Privacy Consent Checkbox */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  cursor: 'pointer',
                  fontSize: '0.86rem',
                  color: '#94a3b8',
                  maxWidth: '380px',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  required
                  checked={formData.consent}
                  onChange={(e) => setFormData({ ...formData, consent: e.target.checked })}
                  style={{
                    marginTop: '3px',
                    accentColor: '#7c3aed',
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer',
                  }}
                />
                <span>
                  I agree that my personal data will be processed in accordance with the{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setPrivacyModalOpen(true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#818cf8',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: 0,
                      font: 'inherit',
                    }}
                  >
                    privacy policy
                  </button>
                </span>
              </label>

              {/* Purple Send Message Button */}
              <button
                type="submit"
                disabled={formSubmitting}
                style={{
                  padding: '0.9rem 2.2rem',
                  borderRadius: '14px',
                  fontSize: '0.96rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                  border: 'none',
                  cursor: formSubmitting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 18px rgba(124, 58, 237, 0.45)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  transition: 'all 0.2s ease',
                  marginLeft: 'auto',
                }}
                onMouseEnter={(e) => {
                  if (!formSubmitting) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 24px rgba(124, 58, 237, 0.6)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!formSubmitting) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 18px rgba(124, 58, 237, 0.45)';
                  }
                }}
              >
                {formSubmitting ? (
                  <>
                    <span className="spin" style={{ display: 'inline-block' }}>⏳</span>
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <span>Send Message</span>
                    <Send size={15} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Privacy Policy Modal */}
      {privacyModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1.5rem',
          }}
          onClick={() => setPrivacyModalOpen(false)}
        >
          <div
            style={{
              background: '#0d1527',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              padding: '2rem',
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ffffff' }}>
                Privacy & Data Processing Policy
              </div>
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '1rem' }}>
              Nexus AI Support treats your data with zero-trust financial confidentiality:
            </p>
            <ul style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.6, paddingLeft: '1.25rem', marginBottom: '1.5rem' }}>
              <li>Contact submissions are securely stored in a private Firestore database collection.</li>
              <li>Your personal contact information will only be used to respond to your specific inquiry.</li>
              <li>Customer data is never sold, leased, or added to public training data or shared knowledge bases.</li>
              <li>Uploaded documents and statement snippets remain strictly air-gapped within the active conversation.</li>
            </ul>
            <button
              type="button"
              onClick={() => setPrivacyModalOpen(false)}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem' }}
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
