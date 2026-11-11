import React, { useState, useEffect } from 'react';
import {
  Bot,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';

export type AppTab = 'landing' | 'chat' | 'contact' | 'agent' | 'admin' | 'knowledge' | 'history' | 'dashboard' | 'insights';

interface HeaderProps {
  currentTab: AppTab;
  activeSection?: string;
  onSelectTab: (tab: AppTab) => void;
  onSelectSection?: (sectionId: string) => void;
  isBackendOnline: boolean | null;
  isCheckingHealth: boolean;
  onRefreshHealth: () => void;
  conversationId: string;
  onNewConversation: () => void;
}

export const Header: React.FC<HeaderProps> = React.memo(({
  currentTab,
  activeSection = 'home',
  onSelectTab,
  onSelectSection,
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (onSelectSection) {
      onSelectSection(sectionId);
      return;
    }
    if (currentTab !== 'landing' && currentTab !== 'dashboard') {
      onSelectTab('landing');
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 120);
    } else {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const isHomeRoute = currentTab === 'landing' || currentTab === 'dashboard';

  const navItems = [
    {
      label: 'Home',
      action: () => {
        setMobileMenuOpen(false);
        if (isHomeRoute) {
          window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
          if (onSelectSection) onSelectSection('hero');
        } else {
          onSelectTab('landing');
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
      },
      active: isHomeRoute && (activeSection === 'home' || activeSection === 'hero'),
    },
    {
      label: 'AI Assistant',
      action: () => {
        setMobileMenuOpen(false);
        onSelectTab('chat');
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      },
      active: currentTab === 'chat',
    },
    {
      label: 'AI Features',
      action: () => scrollToSection('features'),
      active: isHomeRoute && activeSection === 'features',
    },
    {
      label: 'How It Works',
      action: () => scrollToSection('how-it-works'),
      active: isHomeRoute && activeSection === 'how-it-works',
    },
    {
      label: 'Contact',
      action: () => {
        setMobileMenuOpen(false);
        onSelectTab('contact');
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      },
      active: currentTab === 'contact',
    },
  ];

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(6, 9, 17, 0.94)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '0.8rem 1.75rem',
          minHeight: '64px',
          maxHeight: '72px',
          boxSizing: 'border-box',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          transition: 'all 0.25s ease',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1.5rem',
          }}
        >
          {/* Brand Logo (Exact VaatBot Style) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => {
              onSelectTab('landing');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectTab('landing');
            }}
          >
            {/* Cute Purple Robot Icon Badge */}
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
              }}
            >
              <Bot size={22} />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-display, Inter, sans-serif)',
                fontWeight: 800,
                fontSize: '1.25rem',
                letterSpacing: '-0.02em',
                color: '#ffffff',
              }}
            >
              Nexus AI Support
            </span>
          </div>

          {/* Desktop Center Navigation Bar (Pill Group matching Reference) */}
          <nav
            className="desktop-nav-pills"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'transparent',
              padding: '0.2rem',
            }}
            aria-label="Main Navigation"
          >
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                style={{
                  padding: item.active ? '0.45rem 1.35rem' : '0.45rem 1.05rem',
                  borderRadius: '9999px',
                  fontSize: '0.92rem',
                  fontWeight: item.active ? 700 : 500,
                  color: item.active ? '#ffffff' : '#94a3b8',
                  background: item.active ? '#4f46e5' : 'transparent',
                  border: 'none',
                  boxShadow: item.active ? '0 2px 14px rgba(79, 70, 229, 0.45)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (!item.active) e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  if (!item.active) e.currentTarget.style.color = '#94a3b8';
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right Action: Theme Toggle & Launch Nexus AI Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Theme Toggle (subtle) */}
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              aria-label="Toggle theme mode"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Launch Nexus AI Button */}
            <button
              type="button"
              onClick={() => {
                onSelectTab('chat');
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              }}
              className="desktop-launch-btn"
              style={{
                padding: '0.55rem 1.45rem',
                borderRadius: '9999px',
                fontSize: '0.9rem',
                fontWeight: 700,
                color: '#ffffff',
                background: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 50%, #0ea5e9 100%)',
                border: 'none',
                boxShadow: '0 4px 16px rgba(79, 70, 229, 0.45)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 70, 229, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(79, 70, 229, 0.45)';
              }}
            >
              <Sparkles size={14} />
              <span>Launch Nexus AI</span>
            </button>

            {/* Mobile Menu Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="mobile-menu-toggle"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
                display: 'none', // Shown via CSS media query
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer with Smooth Slide Transition */}
        {mobileMenuOpen && (
          <div
            className="mobile-nav-drawer"
            style={{
              padding: '1.25rem 0.5rem 0.75rem 0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              marginTop: '1rem',
            }}
          >
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  fontSize: '0.95rem',
                  fontWeight: item.active ? 700 : 500,
                  color: item.active ? '#ffffff' : '#cbd5e1',
                  background: item.active ? 'rgba(79, 70, 229, 0.25)' : 'transparent',
                  border: item.active ? '1px solid rgba(79, 70, 229, 0.4)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onSelectTab('chat');
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              }}
              style={{
                width: '100%',
                marginTop: '0.5rem',
                padding: '0.8rem 1rem',
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#ffffff',
                background: 'linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <Sparkles size={16} />
              <span>Launch Nexus AI</span>
            </button>
          </div>
        )}
      </header>

      {/* Floating Gear / Settings Icon Button on Right Screen Edge (Matching Reference) */}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 40,
        }}
      >
        <button
          type="button"
          onClick={() => onSelectTab('admin')}
          style={{
            width: '38px',
            height: '38px',
            borderTopLeftRadius: '8px',
            borderBottomLeftRadius: '8px',
            background: '#6366f1',
            border: 'none',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '-2px 0 16px rgba(99, 102, 241, 0.5)',
            transition: 'all 0.2s ease',
          }}
          title="Open Settings & Workspace"
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </>
  );
});
