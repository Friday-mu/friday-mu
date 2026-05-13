'use client';

// AI Bet #3 — project-scoped Ask Friday drawer.
//
// Chat-style panel that POSTs to /api/design/ai/ask with the active
// project_id + the user's query. Renders the Kimi answer with inline
// citation pills (each [budget:bi-x5] etc. becomes a clickable badge).
//
// Strict R-class: the backend system prompt forbids drafting / writing.
// This drawer is read-only — there's no "send this" affordance, no
// staged edits. S-class / A-class are future iterations.

import { useEffect, useRef, useState } from 'react';
import type { DesignProject } from '../../../_data/design';
import { aiAsk, type AiAskCitation } from '../../../_data/designClient';

interface Props {
  project: DesignProject;
  onClose: () => void;
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  citations?: AiAskCitation[];
  source?: 'kimi' | 'template-fallback';
  durationMs?: number;
}

const SUGGESTED_QUERIES = [
  "What's blocking this project?",
  'What is the next action?',
  'Summarize the current budget status',
  'When was the agreement signed?',
  'Have the moodboards been approved?',
];

export function ProjectAskFridayDrawer({ project, onClose }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  const submit = async (query: string) => {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setInput('');
    try {
      const res = await aiAsk({ project_id: project.id, query: q });
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          text: res.answer,
          citations: res.citations,
          source: res.source,
          durationMs: res.durationMs,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTurns((t) => [...t, { role: 'assistant', text: `_Failed: ${msg}_` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 70,
          background: 'rgba(0,0,0,0.45)',
        }}
      />
      <aside
        data-project-ask-friday-drawer
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(520px, 100%)',
          zIndex: 71,
          background: 'var(--color-background-primary)',
          borderLeft: '0.5px solid var(--color-border-tertiary)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 18 }}>✨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Ask Friday</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              about <strong>{project.name}</strong> · read-only
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-project-ask-friday-close
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              border: '0.5px solid var(--color-border-tertiary)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </header>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {turns.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                I&apos;ll only read your project data — I won&apos;t draft, write, or send anything.
                Try one of these:
              </p>
              {SUGGESTED_QUERIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => submit(q)}
                  disabled={busy}
                  data-project-ask-friday-suggestion
                  style={{
                    padding: '8px 12px',
                    fontSize: 12,
                    textAlign: 'left',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-background-tertiary)',
                    border: '0.5px solid var(--color-border-tertiary)',
                    color: 'var(--color-text-secondary)',
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          {turns.map((t, i) => (
            <TurnBubble key={i} turn={t} />
          ))}
          {busy && (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
              Reading the project data…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          style={{
            padding: 12,
            borderTop: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this project…"
            disabled={busy}
            data-project-ask-friday-input
            style={{
              flex: 1,
              padding: '8px 10px',
              fontSize: 13,
              borderRadius: 'var(--radius-sm)',
              border: '0.5px solid var(--color-border-secondary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            data-project-ask-friday-submit
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              background: busy || !input.trim() ? 'var(--color-background-tertiary)' : 'var(--color-brand-accent)',
              color: busy || !input.trim() ? 'var(--color-text-tertiary)' : '#fff',
              border: 'none',
              cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            Ask
          </button>
        </form>
      </aside>
    </>
  );
}

// ─────────────────────────── Turn bubble ───────────────────────────

function TurnBubble({ turn }: { turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <div
        style={{
          alignSelf: 'flex-end',
          maxWidth: '85%',
          padding: '8px 12px',
          fontSize: 13,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-brand-accent)',
          color: '#fff',
        }}
      >
        {turn.text}
      </div>
    );
  }
  // Assistant turn. Render markdown-ish text with citation tags
  // replaced by inline pills.
  const segments = splitWithCitations(turn.text, turn.citations || []);
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '95%',
        padding: '10px 14px',
        fontSize: 13,
        lineHeight: 1.5,
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-background-tertiary)',
        color: 'var(--color-text-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
      }}
    >
      <div style={{ whiteSpace: 'pre-wrap' }}>
        {segments.map((seg, i) =>
          seg.kind === 'text' ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <CitationPill key={i} citation={seg.citation} />
          ),
        )}
      </div>
      {(turn.source || turn.durationMs) && (
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {turn.source ?? ''}
          {turn.durationMs ? ` · ${(turn.durationMs / 1000).toFixed(1)}s` : ''}
        </div>
      )}
    </div>
  );
}

function CitationPill({ citation }: { citation: AiAskCitation }) {
  return (
    <span
      data-ask-friday-citation={`${citation.kind}:${citation.refId}`}
      title={`${citation.kind} · ${citation.refId}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 6px',
        margin: '0 2px',
        fontSize: 10,
        fontWeight: 500,
        borderRadius: 'var(--radius-full)',
        background: 'var(--color-brand-accent-softer)',
        color: 'var(--color-brand-accent)',
        fontFamily: 'var(--font-mono-fad)',
        verticalAlign: 'baseline',
      }}
    >
      {citation.label}
    </span>
  );
}

// Parse [kind:refId] tags in the answer markdown and replace with
// citation segments. Tags that don't match a citation in the array
// are rendered as plain text (defensive — model may forget the
// citations array entry).
type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'citation'; citation: AiAskCitation };

function splitWithCitations(text: string, citations: AiAskCitation[]): Segment[] {
  const byTag = new Map<string, AiAskCitation>();
  for (const c of citations) {
    byTag.set(`${c.kind}:${c.refId}`, c);
  }
  const segments: Segment[] = [];
  const regex = /\[([a-z_]+):([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', text: text.slice(lastIndex, match.index) });
    }
    const tag = `${match[1]}:${match[2]}`;
    const cite = byTag.get(tag);
    if (cite) {
      segments.push({ kind: 'citation', citation: cite });
    } else {
      // Unknown citation — render as plain pill with the tag itself as label.
      segments.push({ kind: 'citation', citation: { kind: match[1], refId: match[2], label: tag } });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: 'text', text: text.slice(lastIndex) });
  }
  return segments;
}
