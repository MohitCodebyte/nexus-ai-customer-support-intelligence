import React from 'react';
import { Bot } from 'lucide-react';
import type { AppTab } from './Header';

interface FooterProps {
  onNavigate: (tab: AppTab) => void;
  onScrollToSection?: (sectionId: string) => void;
}

export const Footer: React.FC<FooterProps> = React.memo(({ onNavigate, onScrollToSection }) => {
  const handleScroll = (id: string) => {
    if (onScrollToSection) {
      onScrollToSection(id);
    } else {
      onNavigate('landing');
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  return (
    <footer
      style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(6, 9, 20, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        paddingTop: '2.25rem',
        paddingBottom: '1.5rem',
        paddingLeft: '2rem',
        paddingRight: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 10,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '2rem',
        }}
      >
        {/* Brand & Description */}
        <div style={{ maxWidth: '440px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              marginBottom: '0.75rem',
              cursor: 'pointer',
            }}
            onClick={() => onNavigate('landing')}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '9px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(124, 58, 237, 0.35)',
              }}
            >
              <Bot size={18} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#ffffff', letterSpacing: '-0.02em' }}>
              Nexus AI Support
            </span>
          </div>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
            Autonomous AI customer support intelligence powered by fine-tuned Banking77 classification, verified semantic RAG, and air-gapped security.
          </p>
        </div>

        {/* Navigation Links */}
        <div style={{ display: 'flex', gap: '1.75rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.9rem' }}>
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => onNavigate('chat')}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            AI Assistant
          </button>
          <button
            type="button"
            onClick={() => handleScroll('features')}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            AI Features
          </button>
          <button
            type="button"
            onClick={() => handleScroll('how-it-works')}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => onNavigate('contact')}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            Contact
          </button>
          <a
            href="mailto:kushwahmitansh@gmail.com"
            style={{ color: '#818cf8', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#a78bfa')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#818cf8')}
          >
            kushwahmitansh@gmail.com
          </a>
        </div>
      </div>

      {/* Bottom Row: Copyright & Independent Ownership Statement */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          paddingTop: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          fontSize: '0.82rem',
          color: '#64748b',
        }}
      >
        <div>© 2026 Mitansh Kushwah. All Rights Reserved.</div>

      </div>
    </footer>
  );
});

