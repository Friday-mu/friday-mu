'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { FridayCard, FridayStep } from '../_data/friday';
import { FRIDAY_PROMPTS_HOME } from '../_data/fridayPrompts';
import { askFriday, executeAskFridayAction, type AskFridayAction } from '../_data/fridayClient';
import { FCard } from './FridayCards';
import { IconArrow, IconCheck, IconClose, IconExpand, IconSend, IconSparkle } from './icons';
import { canSeeFridayCard, useCurrentRole, useCurrentUserId } from './usePermissions';
import { TASK_USER_BY_ID } from '../_data/tasks';

interface AIMessage {
  role: 'ai';
  id: string;
  scope: string;
  steps: FridayStep[];
  stepsDone: number;
  ready: boolean;
  text: string;
  cards: FridayCard[];
  followups: string[];
  actions: Array<AskFridayAction & {
    status?: 'idle' | 'running' | 'done' | 'failed';
    resultSummary?: string;
    error?: string;
  }>;
  confidence?: 'high' | 'medium' | 'low';
  sourcesUsed?: string[];
  error?: string;
}
type UserMessage = { role: 'user'; body: string };
type Message = UserMessage | AIMessage;

export function useFridayChat(scope: string) {
  const [msgs, setMsgs] = useState<Message[]>([]);

  const submit = (q: string) => {
    if (!q.trim()) return;
    const history = msgs.slice(-8).map((m) => ({
      role: m.role === 'ai' ? 'assistant' as const : 'user' as const,
      content: m.role === 'ai' ? m.text : m.body,
    })).filter((m) => m.content.trim());
    const user: UserMessage = { role: 'user', body: q };
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ai: AIMessage = {
      role: 'ai',
      id,
      scope,
      steps: [
        { type: 'tool', name: 'read.fad-context', args: scope, ms: 0 },
        { type: 'tool', name: 'reason.staff-answer', args: 'answer + action chips', ms: 0 },
      ],
      stepsDone: 0,
      ready: false,
      text: '',
      cards: [],
      followups: [],
      actions: [],
    };
    setMsgs((m) => [...m, user, ai]);

    setTimeout(() => {
      setMsgs((m) => {
        return m.map((entry) => entry.role === 'ai' && entry.id === id
          ? { ...entry, stepsDone: 1 }
          : entry);
      });
    }, 180);

    askFriday({ question: q.trim(), scope, history })
      .then((reply) => {
        setMsgs((m) => m.map((entry) => entry.role === 'ai' && entry.id === id
          ? {
              ...entry,
              stepsDone: entry.steps.length,
              ready: true,
              text: reply.answer,
              followups: reply.followups || [],
              actions: (reply.actions || []).map((action) => ({ ...action, status: 'idle' as const })),
              confidence: reply.confidence,
              sourcesUsed: reply.sourcesUsed || reply.contextSummary?.requestedModules || [],
            }
          : entry));
      })
      .catch((err) => {
        setMsgs((m) => m.map((entry) => entry.role === 'ai' && entry.id === id
          ? {
              ...entry,
              stepsDone: entry.steps.length,
              ready: true,
              text: 'Friday could not read the live FAD context for this request. No action was taken.',
              followups: [],
              actions: [],
              error: err instanceof Error ? err.message : 'Ask Friday failed',
            }
          : entry));
      });
  };

  const executeAction = async (messageId: string, actionId: string) => {
    const target = msgs
      .filter((m): m is AIMessage => m.role === 'ai')
      .find((m) => m.id === messageId)
      ?.actions.find((a) => a.id === actionId);
    if (!target || target.status === 'running' || target.status === 'done') return;

    setMsgs((m) => m.map((entry) => entry.role === 'ai' && entry.id === messageId
      ? {
          ...entry,
          actions: entry.actions.map((action) => action.id === actionId
            ? { ...action, status: 'running', error: undefined }
            : action),
        }
      : entry));

    try {
      const result = await executeAskFridayAction(target);
      setMsgs((m) => m.map((entry) => entry.role === 'ai' && entry.id === messageId
        ? {
            ...entry,
            actions: entry.actions.map((action) => action.id === actionId
              ? { ...action, status: 'done', resultSummary: result.summary || 'Done' }
              : action),
          }
        : entry));
    } catch (err) {
      setMsgs((m) => m.map((entry) => entry.role === 'ai' && entry.id === messageId
        ? {
            ...entry,
            actions: entry.actions.map((action) => action.id === actionId
              ? {
                  ...action,
                  status: 'failed',
                  error: err instanceof Error ? err.message : 'Action failed',
                }
              : action),
          }
        : entry));
    }
  };

  return { msgs, submit, executeAction };
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
  onExecuteAction,
}: {
  m: Message;
  onNavigate: (mod: string) => void;
  onFollowup: (q: string) => void;
  onExecuteAction: (messageId: string, actionId: string) => void;
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
          {(m.confidence || m.sourcesUsed?.length || m.error) && (
            <div className="friday-context-row">
              {m.confidence && <span className="chip">confidence · {m.confidence}</span>}
              {m.sourcesUsed?.slice(0, 4).map((s) => (
                <span key={s} className="chip">{s}</span>
              ))}
              {m.error && <span className="chip warn">live read failed</span>}
            </div>
          )}
          {m.text && (
            <div className="friday-msg-text">
              <ReactMarkdown>{m.text}</ReactMarkdown>
            </div>
          )}
          {visibleCards.map((c, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <FCard card={c} onNavigate={onNavigate} />
            </div>
          ))}
          {m.actions.length > 0 && (
            <div className="friday-actions">
              {m.actions.map((action) => (
                <div key={action.id} className="fcard fcard-action">
                  <span className={'dot ' + (action.risk === 'approval' ? 'amber' : action.risk === 'safe' ? 'accent' : 'neutral')} style={{ marginTop: 6 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fcard-title">{action.label}</div>
                    {action.summary && <div className="fcard-body">{action.summary}</div>}
                    {action.resultSummary && <div className="fcard-footer">{action.resultSummary}</div>}
                    {action.error && <div className="fcard-footer" style={{ color: 'var(--color-text-danger)' }}>{action.error}</div>}
                  </div>
                  <button
                    className={action.risk === 'approval' ? 'btn sm' : 'btn primary sm'}
                    disabled={action.status === 'running' || action.status === 'done'}
                    onClick={() => {
                      if (action.type === 'navigate' && action.module) {
                        onNavigate(action.module);
                        return;
                      }
                      onExecuteAction(m.id, action.id);
                    }}
                  >
                    {action.status === 'running'
                      ? 'Working...'
                      : action.status === 'done'
                        ? 'Done'
                        : action.risk === 'approval'
                          ? 'Request approval'
                          : action.label}
                    <IconArrow size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
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
  const { msgs, submit, executeAction } = useFridayChat(scope);
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
                I&apos;ll read live Inbox, Operations, HR, Reviews, Design, Reservations, and
                Properties context, then propose safe internal actions or approval-gated next steps.
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
            <FridayMessage
              key={i}
              m={m}
              onNavigate={handleNavigate}
              onFollowup={submit}
              onExecuteAction={executeAction}
            />
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
