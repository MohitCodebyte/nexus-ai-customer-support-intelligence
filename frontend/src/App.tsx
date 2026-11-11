import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ChatTurn, MascotState } from './types/chat';
import { checkBackendHealth } from './services/api';
import { getCustomerSessionToken } from './lib/customerSession';
import { Header, type AppTab } from './components/common/Header';
import { LandingView } from './components/landing/LandingView';
import { Footer } from './components/common/Footer';
import { CursorGlow } from './components/common/CursorGlow';

// Lazy-loaded routes for optimal initial bundle performance
const ChatWorkspaceLazy = lazy(() =>
  import('./components/chat/ChatWorkspace').then((m) => ({ default: m.ChatWorkspace }))
);
const ContactPageLazy = lazy(() =>
  import('./components/contact/ContactPage').then((m) => ({ default: m.ContactPage }))
);
const HistoryViewLazy = lazy(() =>
  import('./components/history/HistoryView').then((m) => ({ default: m.HistoryView }))
);
const AdminDashboardViewLazy = lazy(() =>
  import('./components/dashboard/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView }))
);
const AgentWorkspaceViewLazy = lazy(() =>
  import('./components/agent/AgentWorkspaceView').then((m) => ({ default: m.AgentWorkspaceView }))
);
const KnowledgeBaseViewLazy = lazy(() =>
  import('./components/knowledge/KnowledgeBaseView').then((m) => ({ default: m.KnowledgeBaseView }))
);

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SESSION_STORAGE_KEY = 'ai_support_conversation_id';

function getTabFromPath(pathname: string): AppTab {
  const clean = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (clean === '/chat' || clean === '/assistant') return 'chat';
  if (clean === '/contact') return 'contact';
  if (clean === '/agent') return 'agent';
  if (clean === '/admin' || clean === '/dashboard') return 'admin';
  if (clean === '/knowledge') return 'knowledge';
  if (clean === '/history') return 'history';
  return 'landing';
}

function getPathFromTab(tab: AppTab): string {
  switch (tab) {
    case 'chat':
      return '/chat';
    case 'contact':
      return '/contact';
    case 'agent':
      return '/agent';
    case 'admin':
      return '/admin';
    case 'knowledge':
      return '/knowledge';
    case 'history':
      return '/history';
    case 'landing':
    case 'dashboard':
    default:
      return '/';
  }
}

export const App: React.FC = () => {
  // Navigation State with URL synchronization
  const [currentTab, setCurrentTabState] = useState<AppTab>(() => {
    if (typeof window !== 'undefined') {
      return getTabFromPath(window.location.pathname);
    }
    return 'landing';
  });

  // Active section for Home page scroll-spy ('home' | 'features' | 'how-it-works')
  const [activeSection, setActiveSection] = useState<string>('home');

  // Backend status
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null);
  const [backendLatency, setBackendLatency] = useState<number | undefined>();
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);

  // Active Conversation State
  const [conversationId, setConversationId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved && saved.trim()) return saved.trim();
    }
    const newId = generateUUID();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, newId);
    }
    return newId;
  });

  // Session message turns
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  // 3D Mascot State
  const [mascotState, setMascotState] = useState<MascotState>('idle');

  // Primary navigation handler with pushState and instant scroll-to-top
  const handleNavigate = useCallback((tab: AppTab) => {
    setCurrentTabState(tab);
    if (tab === 'landing') setActiveSection('home');
    const targetPath = getPathFromTab(tab);
    if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
      window.history.pushState({ tab }, '', targetPath);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  // Listen to browser Back and Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      setCurrentTabState(tab);
      if (tab === 'landing') setActiveSection('home');
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Scroll-spy IntersectionObserver for Home sections
  useEffect(() => {
    if (currentTab !== 'landing' && currentTab !== 'dashboard') return;

    const sections = [
      { id: 'hero', key: 'home' },
      { id: 'features', key: 'features' },
      { id: 'how-it-works', key: 'how-it-works' },
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          const matched = sections.find((s) => s.id === visible[0].target.id);
          if (matched) {
            setActiveSection(matched.key);
          }
        }
      },
      {
        root: null,
        rootMargin: '-85px 0px -40% 0px',
        threshold: [0.15, 0.35, 0.6],
      }
    );

    sections.forEach((sec) => {
      const el = document.getElementById(sec.id);
      if (el) observer.observe(el);
    });

    const handleScroll = () => {
      if (window.scrollY < 180) {
        setActiveSection('home');
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, [currentTab]);

  // Smooth scroll to landing sections, navigating to landing first if on another route
  const handleScrollToSection = useCallback(
    (sectionId: string) => {
      const targetKey = sectionId === 'hero' ? 'home' : sectionId;
      setActiveSection(targetKey);

      if (currentTab !== 'landing' && currentTab !== 'dashboard') {
        handleNavigate('landing');
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
    },
    [currentTab, handleNavigate]
  );

  // Check backend health
  const probeHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    const result = await checkBackendHealth();
    setIsBackendOnline(result.online);
    setBackendLatency(result.latencyMs);
    setIsCheckingHealth(false);
  }, []);

  useEffect(() => {
    getCustomerSessionToken();
    let isMounted = true;
    checkBackendHealth().then((result) => {
      if (isMounted) {
        setIsBackendOnline(result.online);
        setBackendLatency(result.latencyMs);
      }
    });

    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return; // Pause background polling to save battery, CPU and network
      }
      checkBackendHealth().then((result) => {
        if (isMounted) {
          setIsBackendOnline(result.online);
          setBackendLatency(result.latencyMs);
        }
      });
    }, 20000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  // Handle creating a new conversation
  const handleNewConversation = useCallback(() => {
    const newId = generateUUID();
    setConversationId(newId);
    sessionStorage.setItem(SESSION_STORAGE_KEY, newId);
    setTurns([]);
    setMascotState('idle');
    handleNavigate('chat');
  }, [handleNavigate]);

  // Handle resuming an existing conversation with full context preserved
  const handleResumeConversation = useCallback(
    (resumedId: string, loadedTurns: ChatTurn[]) => {
      setConversationId(resumedId);
      sessionStorage.setItem(SESSION_STORAGE_KEY, resumedId);
      setTurns(loadedTurns);
      setMascotState('idle');
      handleNavigate('chat');
    },
    [handleNavigate]
  );

  // Add turn to session
  const handleAddTurn = useCallback((turn: ChatTurn) => {
    setTurns((prev) => [...prev, turn]);
  }, []);

  return (
    <div className="app-container">
      {/* Interactive Cursor Proximity Lighting Glow */}
      <CursorGlow />

      {/* Atmospheric Ambient Background Mesh & Dynamic Orbs */}
      <div className="ambient-background" aria-hidden="true">
        <div className="ambient-orb ambient-orb-cyan" />
        <div className="ambient-orb ambient-orb-violet" />
      </div>

      {/* Header */}
      <Header
        currentTab={currentTab}
        activeSection={activeSection}
        onSelectTab={handleNavigate}
        onSelectSection={handleScrollToSection}
        isBackendOnline={isBackendOnline}
        isCheckingHealth={isCheckingHealth}
        onRefreshHealth={probeHealth}
        conversationId={conversationId}
        onNewConversation={handleNewConversation}
      />

      {/* Main Content Area with Smooth Motion Page Transitions */}
      <main
        className="main-content"
        style={
          currentTab === 'chat'
            ? {
                padding: '0.5rem 0.75rem 0.5rem 0.75rem',
                height: 'calc(100vh - 68px)',
                maxHeight: 'calc(100vh - 68px)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }
            : undefined
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              height: currentTab === 'chat' ? '100%' : 'auto',
              minHeight: 0,
            }}
          >
            <Suspense
              fallback={
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    minHeight: '260px',
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                    gap: '0.65rem',
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: '2px solid rgba(124, 58, 237, 0.25)',
                      borderTopColor: '#38bdf8',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  <span>Loading workspace...</span>
                </div>
              }
            >
              {(currentTab === 'landing' || currentTab === 'dashboard') && (
                <LandingView
                  onOpenChat={() => handleNavigate('chat')}
                  onOpenAgentDesk={() => handleNavigate('agent')}
                  onOpenAdmin={() => handleNavigate('admin')}
                  onOpenKnowledge={() => handleNavigate('knowledge')}
                  onOpenContact={() => handleNavigate('contact')}
                  isBackendOnline={isBackendOnline}
                  backendLatency={backendLatency}
                />
              )}

              {currentTab === 'chat' && (
                <ChatWorkspaceLazy
                  conversationId={conversationId}
                  turns={turns}
                  onAddTurn={handleAddTurn}
                  onClearTurns={() => setTurns([])}
                  mascotState={mascotState}
                  onSetMascotState={setMascotState}
                  isBackendOnline={isBackendOnline}
                  onCheckHealth={probeHealth}
                  onNewConversation={handleNewConversation}
                  onResumeConversation={handleResumeConversation}
                />
              )}

              {currentTab === 'contact' && (
                <ContactPageLazy onOpenChat={() => handleNavigate('chat')} />
              )}

              {currentTab === 'agent' && (
                <AgentWorkspaceViewLazy
                  onOpenConversationInChat={(id) => {
                    setConversationId(id);
                    handleNavigate('chat');
                  }}
                  isBackendOnline={isBackendOnline}
                />
              )}

              {(currentTab === 'admin' || currentTab === 'insights') && (
                <AdminDashboardViewLazy isBackendOnline={isBackendOnline} />
              )}

              {currentTab === 'knowledge' && (
                <KnowledgeBaseViewLazy isBackendOnline={isBackendOnline} />
              )}

              {currentTab === 'history' && (
                <HistoryViewLazy
                  currentConversationId={conversationId}
                  onOpenChat={() => handleNavigate('chat')}
                  onResumeConversation={handleResumeConversation}
                  isBackendOnline={isBackendOnline}
                />
              )}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Unified Global SaaS Footer across landing, contact & admin pages (hidden on chat workspace to guarantee zero window scroll) */}
      {currentTab !== 'chat' && (
        <Footer onNavigate={handleNavigate} onScrollToSection={handleScrollToSection} />
      )}
    </div>
  );
};

export default App;
