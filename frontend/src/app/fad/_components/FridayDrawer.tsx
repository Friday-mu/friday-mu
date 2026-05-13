'use client';

import { useEffect, useRef, useState } from 'react';
import type { FridayCard, FridayStep } from '../_data/friday';
import { FRIDAY_PROMPTS_HOME, pickScript } from '../_data/friday';
import { aiAsk, type AiAskCitation } from '../_data/designClient';
import { FCard } from './FridayCards';
import { IconCheck, IconClose, IconExpand, IconSend, IconSparkle } from './icons';
import { canSeeFridayCard, useCurrentRole, useCurrentUserId } from './usePermissions';
import { TASK_USER_BY_ID } from '../_data/tasks';

interface AIMessage {
  role: 'ai';
  scope: string;
  steps: FridayStep[];
  stepsDone: number;
  ready: boolean;
  text: string;
  cards: FridayCard[];
  followups: string[];
  // When the chat detects it's on a design project URL the submit
  // handler calls /api/design/ai/ask (real Kimi) instead of the
  // scripted mocks. Real responses carry citations + a source +
  // latency the renderer surfaces below the answer text.
  realAi?: boolean;
  citations?: AiAskCitation[];
  source?: 'kimi' | 'template-fallback';
  durationMs?: number;
}
type UserMessage = { role: 'user'; body: string };
type Message = UserMessage | AIMessage;

// Detect the active design project from the URL at submit-time. The
// header drawer is mounted at the FAD shell level, so its hook
// doesn't get re-rendered on project navigation — but the URL is
// always current and read once per submit. Returns the project id
// only when the user is on a design project shell (m=design + pid).
function activeDesignProjectId(): string | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  if (p.get('m') !== 'design') return null;
  const pid = p.get('pid');
  return pid && pid !== '__new' ? pid : null;
}

export function useFridayChat(scope: string) {
  const [msgs, setMsgs] = useState<Message[]>([]);

  const submit = (q: string) => {
    if (!q.trim()) return;
    const user: UserMessage = { role: 'user', body: q };

    // If the user is currently viewing a design project shell, route
    // the question to the real Kimi-backed /api/design/ai/ask endpoint
    // instead of the scripted mocks. This consolidates the previously
    // separate ProjectAskFridayDrawer into the global header drawer.
    const projectId = activeDesignProjectId();
    if (projectId) {
      const realStep: FridayStep = { type: 'tool', name: 'Reading project data', args: 'kimi · /api/design/ai/ask', ms: 0 };
      const ai: AIMessage = {
        role: 'ai',
        scope,
        steps: [realStep],
        stepsDone: 0,
        ready: false,
        text: '',
        cards: [],
        followups: [],
        realAi: true,
      };
      setMsgs((m) => [...m, user, ai]);
      aiAsk({ project_id: projectId, query: q })
        .then((res) => {
          setMsgs((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === 'ai') {
              copy[copy.length - 1] = {
                ...last,
                stepsDone: 1,
                ready: true,
                text: res.answer,
                citations: res.citations,
                source: res.source,
                durationMs: res.durationMs,
              };
            }
            return copy;
          });
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          setMsgs((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === 'ai') {
              copy[copy.length - 1] = {
                ...last,
                stepsDone: 1,
                ready: true,
                text: `_Failed: ${msg}_`,
              };
            }
            return copy;
          });
        });
      return;
    }

    // Fallback to the scripted mock flow used by every non-design
    // surface (Inbox, Finance, Calendar, etc.) until those modules
    // get their own R-class endpoints.
    const script = pickScript(q);
    const ai: AIMessage = {
      role: 'ai',
      scope,
      steps: script.steps,
      stepsDone: 0,
      ready: false,
      text: script.reply.text,
      cards: script.reply.cards,
      followups: script.reply.followups,
    };
    setMsgs((m) => [...m, user, ai]);

    let cumulative = 0;
    script.steps.forEach((s, i) => {
      cumulative += s.ms;
      setTimeout(() => {
        setMsgs((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.role === 'ai') copy[copy.length - 1] = { ...last, stepsDone: i + 1 };
          return copy;
        });
      }, cumulative);
    });
    setTimeout(() => {
      setMsgs((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.role === 'ai') copy[copy.length - 1] = { ...last, ready: true };
        return copy;
      });
    }, cumulative + 150);
  };

  return { msgs, submit };
}

// ─────────── Citation pill rendering (real-AI mode) ────────────
// Mirrors the inline citation rendering that previously lived in
// ProjectAskFridayDrawer. Parses [kind:refId] tags in the Kimi answer
// and substitutes a small monospace pill linked to the underlying
// record.

type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'citation'; citation: AiAskCitation };

function splitWithCitations(text: string, citations: AiAskCitation[]): Segment[] {
  const byTag = new Map<string, AiAskCitation>();
  for (const c of citations) byTag.set(`${c.kind}:${c.refId}`, c);
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
    segments.push(
      cite
        ? { kind: 'citation', citation: cite }
        : { kind: 'citation', citation: { kind: match[1], refId: match[2], label: tag } },
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: 'text', text: text.slice(lastIndex) });
  }
  return segments;
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

function ToolStep({ step, done }: { step: FridayStep; done: boolean }) {
  return (
    <div className={'friday-step' + (done ? ' done' : ' running')}>
      <span className="friday-step-dot" />
      <span className="friday-step-name">{step.name}</span>
      <span className="friday-step-args">{step.args}</span>
      {!done && <span className="friday-step-spinner" />}
      {done && <IconCheck size={10} />}
    </div>
  );
}

export function FridayMessage({
  m,
  onNavigate,
  onFollowup,
}: {
  m: Message;
  onNavigate: (mod: string) => void;
  onFollowup: (q: string) => void;
}) {
  const role = useCurrentRole();
  if (m.role === 'user') {
    return <div className="friday-msg friday-msg-user">{m.body}</div>;
  }
  const visibleCards = m.cards.filter((c) =>
    canSeeFridayCard(role, c.type, c.type === 'action' ? c.module : undefined),
  );
  return (
    <div className="friday-msg friday-msg-ai">
      <div className="friday-msg-header">
        <span className="friday-ai-badge">
          <IconSparkle size={10} /> Friday
        </span>
        {m.scope && (
          <span className="chip" style={{ fontSize: 10 }}>
            scope · {m.scope}
          </span>
        )}
      </div>
      {m.steps.length > 0 && (
        <div className="friday-steps">
          {m.steps.map((s, i) => (
            <ToolStep key={i} step={s} done={i < m.stepsDone} />
          ))}
        </div>
      )}
      {m.ready && (
        <>
          {m.text && (
            m.realAi ? (
              <div className="friday-msg-text" style={{ whiteSpace: 'pre-wrap' }}>
                {splitWithCitations(m.text, m.citations ?? []).map((seg, i) =>
                  seg.kind === 'text' ? (
                    <span key={i}>{seg.text}</span>
                  ) : (
                    <CitationPill key={i} citation={seg.citation} />
                  ),
                )}
                {(m.source || m.durationMs) && (
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                    {m.source ?? ''}
                    {m.durationMs ? ` · ${(m.durationMs / 1000).toFixed(1)}s` : ''}
                  </div>
                )}
              </div>
            ) : (
              <div className="friday-msg-text">{m.text}</div>
            )
          )}
          {visibleCards.map((c, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <FCard card={c} onNavigate={onNavigate} />
            </div>
          ))}
          {m.followups.length > 0 && (
            <div className="friday-followups">
              {m.followups.map((f, i) => (
                <button key={i} className="friday-followup" onClick={() => onFollowup(f)}>
                  {f}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  scope: string;
  onNavigate: (mod: string) => void;
  onExpand?: () => void;
}

export function FridayDrawer({ open, onClose, scope, onNavigate, onExpand }: Props) {
  const { msgs, submit } = useFridayChat(scope);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const currentUserId = useCurrentUserId();
  const greetName = TASK_USER_BY_ID[currentUserId]?.name.split(' ')[0] ?? 'there';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs]);

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) {
      submit(input.trim());
      setInput('');
    }
  };

  const handleNavigate = (mod: string) => {
    onNavigate(mod);
    onClose();
  };

  return (
    <>
      <div className={'fad-drawer-overlay' + (open ? ' open' : '')} onClick={onClose} />
      <aside className={'fad-drawer' + (open ? ' open' : '')} aria-hidden={!open}>
        <div className="fad-drawer-header">
          <IconSparkle />
          <div className="fad-drawer-title">Ask Friday</div>
          <span className="chip" style={{ marginLeft: 8 }}>
            scope · {scope}
          </span>
          <button
            className="fad-util-btn"
            style={{ marginLeft: 'auto' }}
            title="Fullscreen"
            onClick={onExpand}
          >
            <IconExpand />
          </button>
          <button className="fad-util-btn" onClick={onClose} title="Close">
            <IconClose />
          </button>
        </div>
        <div className="fad-drawer-body friday-body">
          {msgs.length === 0 && (
            <div className="friday-empty">
              <div className="friday-empty-title">Hi {greetName} — ask me anything.</div>
              <div className="friday-empty-sub">
                I&apos;ll pull from Inbox, Finance, Calendar, Operations, and the module you&apos;re
                viewing.
              </div>
              <div className="friday-prompt-grid">
                {FRIDAY_PROMPTS_HOME.slice(0, 2).map((g, i) => (
                  <div key={i}>
                    <div className="friday-prompt-cat">{g.cat}</div>
                    {g.prompts.map((p, j) => (
                      <button key={j} className="friday-prompt-btn" onClick={() => submit(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <FridayMessage key={i} m={m} onNavigate={handleNavigate} onFollowup={submit} />
          ))}
          <div ref={endRef} />
        </div>
        <form className="fad-drawer-input" onSubmit={onSubmit}>
          <input
            placeholder={`Ask about ${scope.toLowerCase()}, or anything else…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus={open}
          />
          <button type="submit" className="btn primary" title="Send">
            <IconSend size={14} />
          </button>
        </form>
      </aside>
    </>
  );
}
