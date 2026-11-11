import React, { useState, useEffect, useCallback } from 'react';
import type { KnowledgeFaq } from '../../types/chat';
import {
  fetchKnowledgeFaqsApi,
  saveKnowledgeFaqApi,
  deleteKnowledgeFaqApi,
  testKnowledgeRetrievalApi,
  rebuildKnowledgeIndexApi,
  checkAdminAuthApi,
  loginAdminApi,
} from '../../services/api';
import {
  Database,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Play,
  Lock,
  Shield,
} from 'lucide-react';

interface RetrievalSource {
  intent: string;
  similarity_score: number;
  answer?: string;
  response?: string;
  [key: string]: unknown;
}

interface TestRetrievalResult {
  requires_human_review?: boolean;
  sources?: RetrievalSource[];
  [key: string]: unknown;
}

interface KnowledgeBaseViewProps {
  isBackendOnline?: boolean | null;
}

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // FAQ List
  const [faqs, setFaqs] = useState<KnowledgeFaq[]>([]);
  const [systemSampleFaqs, setSystemSampleFaqs] = useState<KnowledgeFaq[]>([]);
  const [totalFaqs, setTotalFaqs] = useState(0);
  const [totalSystemDocs, setTotalSystemDocs] = useState<number | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Add FAQ Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newIntent, setNewIntent] = useState('card_services');
  const [newCategory, setNewCategory] = useState('Payment Cards');
  const [newKeywords, setNewKeywords] = useState('');
  const [isSavingFaq, setIsSavingFaq] = useState(false);

  // Live Query Testing Simulator
  const [testQuery, setTestQuery] = useState('lost debit card abroad');
  const [testTopK, setTestTopK] = useState(3);
  const [testResults, setTestResults] = useState<TestRetrievalResult | null>(null);
  const [isTestingRetrieval, setIsTestingRetrieval] = useState(false);

  // Index Rebuild State
  const [isRebuilding, setIsRebuilding] = useState(false);

  // Auth check
  useEffect(() => {
    checkAdminAuthApi().then((auth) => {
      setIsAuthenticated(auth);
    });
  }, []);

  const loadFaqs = useCallback(async (search: string = '') => {
    setIsLoadingFaqs(true);
    try {
      const data = await fetchKnowledgeFaqsApi(search, 50, 0);
      setFaqs(data.faqs);
      setTotalFaqs(data.total);
      if (data.system_faqs_sample) setSystemSampleFaqs(data.system_faqs_sample);
      if (data.total_system_documents) setTotalSystemDocs(data.total_system_documents);
    } catch {
      // silent
    } finally {
      setIsLoadingFaqs(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => {
        void loadFaqs(searchQuery);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, loadFaqs, searchQuery]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPasswordInput.trim()) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await loginAdminApi(adminPasswordInput.trim());
      setIsAuthenticated(true);
      setAdminPasswordInput('');
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Invalid administrator credentials');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;

    setIsSavingFaq(true);
    try {
      await saveKnowledgeFaqApi({
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
        intent: newIntent.trim(),
        category: newCategory.trim(),
        keywords: newKeywords.trim(),
      });
      setIsAddModalOpen(false);
      setNewQuestion('');
      setNewAnswer('');
      setNewKeywords('');
      setActionMessage('New verified FAQ saved to knowledge base!');
      setTimeout(() => setActionMessage(null), 3500);
      loadFaqs();
    } catch {
      setActionMessage('Failed to save FAQ');
    } finally {
      setIsSavingFaq(false);
    }
  };

  const handleDeleteFaq = async (faqId: string) => {
    if (!window.confirm('Are you sure you want to delete this FAQ entry?')) return;
    try {
      await deleteKnowledgeFaqApi(faqId);
      setActionMessage('FAQ entry removed');
      setTimeout(() => setActionMessage(null), 3000);
      loadFaqs();
    } catch {
      setActionMessage('Failed to delete FAQ');
    }
  };

  const handleTestRetrieval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;
    setIsTestingRetrieval(true);
    try {
      const data = await testKnowledgeRetrievalApi(testQuery.trim(), testTopK);
      setTestResults(data.results as unknown as TestRetrievalResult);
    } catch {
      setTestResults(null);
    } finally {
      setIsTestingRetrieval(false);
    }
  };

  const handleRebuildIndex = async () => {
    if (!window.confirm('Verify and refresh active semantic vector index? An automated backup of current models will be created.')) return;
    setIsRebuilding(true);
    try {
      const data = await rebuildKnowledgeIndexApi();
      setActionMessage(data.message || 'Vector index verified and refreshed.');
      setTimeout(() => setActionMessage(null), 4000);
    } catch {
      setActionMessage('Index verification failed');
    } finally {
      setIsRebuilding(false);
    }
  };

  if (isAuthenticated === false) {
    return (
      <div style={{ maxWidth: '480px', margin: '4rem auto', width: '100%' }}>
        <div
          className="glass-panel"
          style={{
            padding: '2.5rem',
            borderRadius: 'var(--radius-xl)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'rgba(14, 165, 233, 0.15)',
              color: 'var(--primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
            }}
          >
            <Lock size={28} />
          </div>

          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              Knowledge Base Management
            </h2>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Protected administrative portal to manage verified banking FAQ documents, inspect semantic similarity vectors, and test zero-hallucination gating.
            </p>
          </div>

          {loginError && (
            <div style={{ padding: '0.65rem', borderRadius: 'var(--radius-md)', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '0.82rem' }}>
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            <input
              type="password"
              placeholder="Enter Admin Secret Key..."
              value={adminPasswordInput}
              onChange={(e) => setAdminPasswordInput(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-card-subtle)',
                border: '1px solid var(--surface-card-border)',
                color: 'var(--text-primary)',
                fontSize: '0.92rem',
                outline: 'none',
              }}
            />
            <button type="submit" disabled={isLoggingIn || !adminPasswordInput.trim()} className="btn btn-primary" style={{ padding: '0.75rem', width: '100%' }}>
              <span>{isLoggingIn ? 'Authenticating...' : 'Unlock Knowledge Base'}</span>
              <Shield size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
      {/* Top Banner */}
      <div
        className="glass-panel"
        style={{
          padding: '1.25rem 1.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--cyan) 0%, var(--primary) 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(6, 182, 212, 0.3)',
            }}
          >
            <Database size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              Verified Knowledge Base & RAG Manager
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {totalSystemDocs ? `${totalSystemDocs.toLocaleString()} Bitext Verified Documents Active` : 'Semantic Vector FAQ Knowledge'} • Air-gapped from customer uploads
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="btn btn-primary"
            style={{ padding: '0.5rem 0.95rem', fontSize: '0.82rem' }}
          >
            <Plus size={15} />
            <span>Add Verified FAQ</span>
          </button>

          <button
            type="button"
            onClick={handleRebuildIndex}
            disabled={isRebuilding}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 0.95rem', fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} className={isRebuilding ? 'spin-slow' : ''} />
            <span>{isRebuilding ? 'Refreshing Index...' : 'Verify & Refresh Index'}</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            color: 'var(--success)',
            fontSize: '0.86rem',
            fontWeight: 600,
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* Grid: Live Retrieval Simulator (Left) & Knowledge FAQ Catalog (Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(340px, 420px) minmax(0, 1fr)',
          gap: '1.5rem',
          alignItems: 'start',
        }}
        className="knowledge-grid"
      >
        {/* ================================================================= */}
        {/* LEFT: LIVE RETRIEVAL TEST SIMULATOR */}
        {/* ================================================================= */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <span className="badge badge-cyan" style={{ marginBottom: '0.35rem' }}>
              Vector Cosine Testing
            </span>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Live Semantic Retrieval Simulator</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Test raw inquiries against the dense vector index to check cosine scores, intent margin, and human review gates.
            </p>
          </div>

          <form onSubmit={handleTestRetrieval} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                Test Query (English, Hindi, or Hinglish):
              </label>
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="e.g. lost my debit card abroad"
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-card-subtle)',
                  border: '1px solid var(--surface-card-border)',
                  color: 'var(--text-primary)',
                  fontSize: '0.86rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <span>Top K Chunks:</span>
                <select
                  value={testTopK}
                  onChange={(e) => setTestTopK(Number(e.target.value))}
                  style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-card-subtle)',
                    border: '1px solid var(--surface-card-border)',
                    color: 'var(--text-primary)',
                    fontSize: '0.78rem',
                  }}
                >
                  <option value={1}>1</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </div>

              <button type="submit" disabled={isTestingRetrieval} className="btn btn-primary" style={{ padding: '0.45rem 1rem', fontSize: '0.82rem' }}>
                <Play size={13} />
                <span>{isTestingRetrieval ? 'Searching...' : 'Run Query'}</span>
              </button>
            </div>
          </form>

          {/* Test Results Output */}
          {testResults && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(7, 10, 19, 0.7)',
                border: '1px solid var(--surface-card-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                maxHeight: '380px',
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                <strong style={{ color: 'var(--primary-light)' }}>RETRIEVAL DIAGNOSTICS</strong>
                <span className={`badge ${testResults.requires_human_review ? 'badge-warning' : 'badge-success'}`}>
                  {testResults.requires_human_review ? 'Human Review Triggered' : 'Auto Answer Allowed'}
                </span>
              </div>

              {testResults.sources && testResults.sources.length > 0 ? (
                testResults.sources.map((s: RetrievalSource, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-card-subtle)',
                      border: '1px solid var(--surface-card-border)',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Intent: {s.intent}</span>
                      <span style={{ color: 'var(--mint-light)', fontWeight: 700 }}>
                        Score: {(s.similarity_score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>{s.answer || s.response}</div>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No matching documents found above threshold.</div>
              )}
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* RIGHT: KNOWLEDGE BASE FAQ CATALOG */}
        {/* ================================================================= */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Verified Knowledge Catalog {totalFaqs > 0 ? `(${totalFaqs} Custom FAQs)` : ''}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Custom banking policy FAQs & pre-indexed Bitext corporate guidelines.
              </p>
            </div>

            <div style={{ position: 'relative', minWidth: '240px' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search FAQs by question..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadFaqs(searchQuery);
                }}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem 0.45rem 2rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-card-subtle)',
                  border: '1px solid var(--surface-card-border)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* List of Custom & System FAQs */}
          <div style={{ maxHeight: '560px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {isLoadingFaqs && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem' }}>
                <RefreshCw size={14} className="spin-slow" />
                <span>Loading FAQs...</span>
              </div>
            )}
            {/* Custom FAQs */}
            {faqs.map((f) => (
              <div
                key={f.id}
                style={{
                  padding: '0.9rem 1.15rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-card-subtle)',
                  border: '1px solid var(--surface-card-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className="badge badge-cyan">{f.category}</span>
                    <span className="badge badge-primary">{f.intent}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteFaq(f.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}
                    title="Delete FAQ"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{f.question}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{f.answer}</div>
              </div>
            ))}

            {/* System FAQs Sample */}
            {systemSampleFaqs.map((f) => (
              <div
                key={f.id}
                style={{
                  padding: '0.9rem 1.15rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(15, 23, 42, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge badge-muted">Pre-Indexed System Policy</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{f.intent}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{f.question}</div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{f.answer}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add FAQ Modal */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '540px',
              width: '100%',
              padding: '2rem',
              borderRadius: 'var(--radius-xl)',
              background: 'var(--surface-card-solid)',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              Add Verified Banking FAQ
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Define official banking guidance to ground assistant answers and prevent AI hallucination.
            </p>

            <form onSubmit={handleSaveFaq} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Question:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. How do I enable international transactions on my debit card?"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-card-subtle)',
                    border: '1px solid var(--surface-card-border)',
                    color: 'var(--text-primary)',
                    fontSize: '0.86rem',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Verified Answer:
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="e.g. In the Nexus Mobile App, go to Cards > Manage Preferences and toggle International Usage..."
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-card-subtle)',
                    border: '1px solid var(--surface-card-border)',
                    color: 'var(--text-primary)',
                    fontSize: '0.86rem',
                    resize: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                    Intent Category:
                  </label>
                  <input
                    type="text"
                    value={newIntent}
                    onChange={(e) => setNewIntent(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-card-subtle)',
                      border: '1px solid var(--surface-card-border)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                    Category Label:
                  </label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-card-subtle)',
                      border: '1px solid var(--surface-card-border)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '0.55rem 1rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingFaq}
                  className="btn btn-primary"
                  style={{ padding: '0.55rem 1.25rem' }}
                >
                  <span>{isSavingFaq ? 'Saving...' : 'Save Verified FAQ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
