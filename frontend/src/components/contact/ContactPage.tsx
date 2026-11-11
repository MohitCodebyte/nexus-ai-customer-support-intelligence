import React, { useState } from 'react';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  X,
  MessageSquare,
  Bot,
  Mail,
  Sparkles,
} from 'lucide-react';

interface ContactPageProps {
  onOpenChat: () => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({ onOpenChat }) => {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    message: '',
    consent: true,
  });

  const [showMessageField, setShowMessageField] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      setFormError('Please enter both your name and email address.');
      return;
    }

    if (!formData.consent) {
      setFormError('Please agree to data processing before submitting.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      const resp = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          company: formData.company.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          message: formData.message.trim(),
          consent: formData.consent,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to send message. Please try again.');
      }

      setFormSuccess(true);
      setFormData({
        name: '',
        company: '',
        email: '',
        phone: '',
        message: '',
        consent: true,
      });
      setShowMessageField(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to deliver message.';
      setFormError(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2rem 1.5rem 3rem 1.5rem',
        boxSizing: 'border-box',
      }}
    >
      {/* Header Eyebrow */}
      <div style={{ textAlign: 'center', maxWidth: '640px', marginBottom: '2rem' }}>
        <span
          className="badge"
          style={{
            background: 'rgba(124, 58, 237, 0.18)',
            color: '#a78bfa',
            border: '1px solid rgba(124, 58, 237, 0.35)',
            padding: '0.4rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginBottom: '0.75rem',
          }}
        >
          <Sparkles size={14} />
          Direct Enterprise Connect
        </span>
        <h1
          style={{
            fontSize: 'clamp(2rem, 3.8vw, 2.8rem)',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.03em',
            margin: '0.25rem 0 0.5rem 0',
          }}
        >
          Let&apos;s Connect with Nexus AI
        </h1>
        <p style={{ fontSize: '1rem', color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
          Reach out to explore how autonomous intelligence and zero-trust security empower enterprise banking support.
        </p>
      </div>

      {/* Cameron-Style Window Card (Reference Exact Structure) */}
      <div
        style={{
          width: '100%',
          maxWidth: '1100px',
          background: '#090e1e',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '28px',
          padding: '2.5rem 3rem 3rem 3rem',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65), 0 0 32px rgba(124, 58, 237, 0.12)',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* macOS-style Window Dots (Top Left) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2.5rem' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' }} />
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981' }} />
        </div>

        {/* 2-Column Responsive Layout */}
        <div
          className="contact-card-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(300px, 0.95fr) minmax(360px, 1.25fr)',
            gap: '3.5rem',
            alignItems: 'start',
          }}
        >
          {/* Left Column (Brand, Pitch, Profile Badge, Floating Chat Launcher) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h2
                style={{
                  fontSize: 'clamp(1.8rem, 2.6vw, 2.35rem)',
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: '#ffffff',
                  marginBottom: '1rem',
                  lineHeight: 1.2,
                }}
              >
                Meet with Nexus AI
              </h2>
              <p
                style={{
                  fontSize: '1rem',
                  color: '#94a3b8',
                  lineHeight: 1.65,
                  maxWidth: '380px',
                  margin: 0,
                }}
              >
                Let us show you how Nexus AI can transform the way you govern, secure, and resolve sensitive financial data requests.
              </p>
            </div>

            {/* Profile Avatar Badge (Cameron-style circular badge) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.85rem 1.1rem',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                width: 'fit-content',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #38bdf8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
                }}
              >
                <Bot size={26} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#ffffff' }}>
                  Mitansh Kushwah
                </div>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  Lead AI Architect & Support
                </div>
              </div>
            </div>

            {/* Direct Email Contact Link */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <Mail size={16} color="#818cf8" />
              <a
                href="mailto:kushwahmitansh@gmail.com"
                style={{
                  fontSize: '0.92rem',
                  color: '#818cf8',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#a78bfa')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#818cf8')}
              >
                kushwahmitansh@gmail.com
              </a>
            </div>

            {/* Cameron-Style Floating Assistant Glow Button (Launches Chat) */}
            <div style={{ marginTop: '1rem' }}>
              <button
                type="button"
                onClick={onOpenChat}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  border: '3px solid rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 0 28px rgba(139, 92, 246, 0.65), 0 8px 24px rgba(0, 0, 0, 0.4)',
                  transition: 'all 0.25s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.08)';
                  e.currentTarget.style.boxShadow = '0 0 36px rgba(139, 92, 246, 0.9), 0 10px 28px rgba(0, 0, 0, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 0 28px rgba(139, 92, 246, 0.65), 0 8px 24px rgba(0, 0, 0, 0.4)';
                }}
                title="Launch Instant Chat with Nexus AI"
                aria-label="Launch Instant Chat with Nexus AI"
              >
                <MessageSquare size={26} />
              </button>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.5rem' }}>
                Instant AI Demo Mode
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Working Contact Form */}
          <div>
            {formSuccess ? (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '20px',
                  padding: '2.5rem 2rem',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.25rem auto',
                    color: '#34d399',
                  }}
                >
                  <CheckCircle2 size={36} />
                </div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.5rem' }}>
                  Message Sent Successfully!
                </h3>
                <p style={{ fontSize: '0.92rem', color: '#94a3b8', lineHeight: 1.6, maxWidth: '420px', margin: '0 auto 1.5rem auto' }}>
                  Thank you! Your message has been encrypted, stored securely in our enterprise database, and dispatched to our team at kushwahmitansh@gmail.com.
                </p>
                <button
                  type="button"
                  onClick={() => setFormSuccess(false)}
                  style={{
                    padding: '0.75rem 1.8rem',
                    borderRadius: '12px',
                    background: '#7c3aed',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                  }}
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {formError && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      borderRadius: '12px',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      color: '#f87171',
                      fontSize: '0.88rem',
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
                      boxSizing: 'border-box',
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
                    placeholder="Your company name"
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
                      boxSizing: 'border-box',
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
                      boxSizing: 'border-box',
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
                    placeholder="Your phone number"
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
                      boxSizing: 'border-box',
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
                      <span>+ Add message details or questions (optional)</span>
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
                        boxSizing: 'border-box',
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
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.65rem',
                      cursor: 'pointer',
                      fontSize: '0.86rem',
                      color: '#94a3b8',
                      maxWidth: '360px',
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
            )}
          </div>
        </div>
      </div>

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

