import React from 'react';
import { ExternalLink, Phone, Mail } from 'lucide-react';

interface MarkdownContentProps {
  content: string;
}

/**
 * Sanitizes URLs to ensure only safe protocols are rendered.
 * Strictly blocks javascript:, data:, vbscript:, etc.
 */
function isSafeUrl(url: string): boolean {
  try {
    const trimmed = url.trim();
    if (trimmed.startsWith('tel:') || trimmed.startsWith('mailto:')) {
      return true;
    }
    const parsed = new URL(trimmed, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parses inline formatting:
 * - **bold text**
 * - `code`
 * - [label](url)
 * - phone numbers (e.g. 1-800-555-CARD or 1-800-555-0199)
 * - emails
 * - bare https:// URLs
 */
function renderInline(text: string): React.ReactNode[] {
  // Regex to tokenize inline markdown, links, phones, emails, and code spans
  const tokenRegex =
    /(\*\*.*?\*\*|__.*?__|`.*?`|\[.*?\]\(.*?\)|\b(?:https?:\/\/[^\s<)]+)|(?:\b1-\d{3}-[A-Z0-9]{3,4}-[A-Z0-9]{4}\b|\b1-\d{3}-\d{3}-\d{4}\b|\b\d{3}-\d{3}-\d{4}\b)|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const token = match[0];

    // 1. Bold text (**text** or __text__)
    if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      const inner = token.slice(2, -2);
      parts.push(
        <strong key={match.index} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
          {inner}
        </strong>
      );
    }
    // 2. Inline code (`code`)
    else if (token.startsWith('`') && token.endsWith('`')) {
      const code = token.slice(1, -1);
      parts.push(
        <code
          key={match.index}
          style={{
            background: 'var(--bg-secondary)',
            color: 'var(--primary)',
            padding: '0.15rem 0.4rem',
            borderRadius: '4px',
            fontSize: '0.85em',
            fontFamily: 'monospace',
            border: '1px solid var(--surface-card-border)',
          }}
        >
          {code}
        </code>
      );
    }
    // 3. Markdown links [text](url)
    else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const closingBracket = token.indexOf('](');
      const linkText = token.slice(1, closingBracket);
      const url = token.slice(closingBracket + 2, -1).trim();

      if (isSafeUrl(url)) {
        parts.push(
          <a
            key={match.index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--primary)',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
              fontWeight: 600,
            }}
          >
            {linkText}
            <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
          </a>
        );
      } else {
        parts.push(linkText);
      }
    }
    // 4. Bare HTTP/HTTPS URLs
    else if (token.startsWith('http://') || token.startsWith('https://')) {
      if (isSafeUrl(token)) {
        parts.push(
          <a
            key={match.index}
            href={token}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--primary)',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
              wordBreak: 'break-all',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
              fontWeight: 500,
            }}
          >
            {token}
            <ExternalLink size={11} />
          </a>
        );
      } else {
        parts.push(token);
      }
    }
    // 5. Phone numbers
    else if (
      /^(?:1-\d{3}-[A-Z0-9]{3,4}-[A-Z0-9]{4}|1-\d{3}-\d{3}-\d{4}|\d{3}-\d{3}-\d{4})$/i.test(token)
    ) {
      parts.push(
        <a
          key={match.index}
          href={`tel:${token.replace(/[^0-9+]/g, '')}`}
          style={{
            color: 'var(--primary)',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            textDecoration: 'none',
            background: 'var(--primary-soft)',
            padding: '0.1rem 0.45rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.86em',
          }}
          title={`Call ${token}`}
        >
          <Phone size={11} />
          {token}
        </a>
      );
    }
    // 6. Emails
    else if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(token)) {
      parts.push(
        <a
          key={match.index}
          href={`mailto:${token}`}
          style={{
            color: 'var(--primary)',
            textDecoration: 'underline',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontWeight: 600,
          }}
          title={`Email ${token}`}
        >
          <Mail size={11} />
          {token}
        </a>
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = React.memo(({ content }) => {
  if (!content) return null;

  // Split lines into blocks: headings, numbered lists, bullet lists, or regular paragraphs
  const rawLines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];

  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = () => {
    if (!currentList) return;
    const ListTag = currentList.type;
    const isOrdered = currentList.type === 'ol';

    blocks.push(
      <ListTag
        key={`list-${blocks.length}`}
        style={{
          margin: '0.5rem 0 0.75rem 1.35rem',
          paddingLeft: '0.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          listStyleType: isOrdered ? 'decimal' : 'disc',
        }}
      >
        {currentList.items.map((item, idx) => (
          <li key={idx} style={{ lineHeight: 1.55 }}>
            {renderInline(item)}
          </li>
        ))}
      </ListTag>
    );
    currentList = null;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    if (!line) {
      flushList();
      continue;
    }

    // Numbered list item: e.g. "1. Step description"
    const orderedMatch = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (orderedMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(orderedMatch[2]);
      continue;
    }

    // Bulleted list item: e.g. "- Item" or "* Item"
    const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // Heading item: e.g. "### Title" or "## Title"
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      blocks.push(
        <h4
          key={`h-${i}`}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            fontWeight: 800,
            margin: '0.75rem 0 0.35rem 0',
            color: 'var(--text-primary)',
          }}
        >
          {renderInline(headingMatch[2])}
        </h4>
      );
      continue;
    }

    // Regular paragraph line
    flushList();
    blocks.push(
      <p
        key={`p-${i}`}
        style={{
          margin: '0.4rem 0',
          lineHeight: 1.6,
          color: 'var(--text-primary)',
        }}
      >
        {renderInline(line)}
      </p>
    );
  }

  flushList();

  return (
    <div
      className="chat-markdown-body"
      style={{
        fontSize: '0.94rem',
        wordBreak: 'break-word',
      }}
    >
      {blocks}
    </div>
  );
});

