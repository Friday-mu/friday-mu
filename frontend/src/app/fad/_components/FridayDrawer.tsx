'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { FridayCard, FridayStep } from '../_data/friday';
import { FRIDAY_PROMPTS_HOME } from '../_data/fridayPrompts';
import { askFriday, executeAskFridayAction, type AskFridayAction } from '../_data/fridayClient';
import { FCard } from './FridayCards';
import { IconArrow, IconCheck, IconClose, IconExpand, IconMic, IconSend, IconSparkle, IconStop } from './icons';
import { canSeeFridayCard, useCurrentRole, useCurrentUserId } from './usePermissions';
import { TASK_USER_BY_ID } from '../_data/tasks';
import { useDictation } from './useDictation';

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
  stopped?: boolean;
}
type UserMessage = { role: 'user'; id: string; body: string };
type Message = UserMessage | AIMessage;

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildHistory(msgs: Message[]) {
  return msgs.slice(-10).map((m) => ({
    role: m.role === 'ai' ? 'assistant' as const : 'user' as const,
    content: m.role === 'ai' ? m.text : m.body,
  })).filter((m) => m.content.trim());
}

function isActionConfirmation(text: string) {
  const q = text.trim().toLowerCase().replace(/[.!?]+$/g, '');
  return /^(ok|okay|yes|yep|yeah|go ahead|do it|please do it|execute|run it|create it|send it|post it|confirm|approved|approve it|make it happen|let's do it|lets do it)$/.test(q);
}

function latestExecutableAction(msgs: Message[]) {
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m.role !== 'ai' || !m.ready) continue;
    const candidates = m.actions.filter((action) =>
      action.type !== 'navigate' &&
      action.status !== 'running' &&
      action.status !== 'done' &&
      (action.risk === 'safe' || action.risk === 'approval'),
    );
    if (candidates.length === 1) return { messageId: m.id, action: candidates[0] };
    return null;
  }
  return null;
}

function appendTranscript(current: string, transcript: string) {
  const clean = transcript.trim();
  if (!clean) return current;
  if (!current.trim()) return clean;
  return `${current.trimEnd()} ${clean}`;
}

function formatMs(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

export function useFridayChat(scope: string) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);
  const activeRequestRef = useRef<{ id: string; controller: AbortController } | null>(null);
  const queuedPromptRef = useRef<string | null>(null);
  const isThinking = msgs.some((m) => m.role === 'ai' && !m.ready);

  const queuePrompt = (q: string) => {
    queuedPromptRef.current = q;
    setQueuedPrompt(q);
  };

  const flushQueued = () => {
    const next = queuedPromptRef.current;
    if (!next) return;
    queuedPromptRef.current = null;
    setQueuedPrompt(null);
    window.setTimeout(() => submit(next), 0);
  };

  const submit = (q: string) => {
    const question = q.trim();
    if (!question) return;

    if (activeRequestRef.current) {
      queuePrompt(question);
      return;
    }

    const directAction = isActionConfirmation(question) ? latestExecutableAction(msgs) : null;
    if (directAction) {
      const user: UserMessage = { role: 'user', id: makeId('user'), body: question };
      setMsgs((m) => [...m, user]);
      void runAction(directAction.messageId, directAction.action);
      return;
    }

    const history = buildHistory(msgs);
    const user: UserMessage = { role: 'user', id: makeId('user'), body: question };
    const id = makeId('ai');
    const ai: AIMessage = {
      role: 'ai',
      id,
      scope,
      steps: [
        { type: 'tool', name: 'read.live-context', args: scope, ms: 0 },
        { type: 'tool', name: 'select.safe-tools', args: 'actions + ownership', ms: 0 },
        { type: 'tool', name: 'compose.operator-answer', args: 'answer + action cards', ms: 0 },
      ],
      stepsDone: 0,
      ready: false,
      text: '',
      cards: [],
      followups: [],
      actions: [],
    };
    setMsgs((m) => [...m, user, ai]);

    const controller = new AbortController();
    activeRequestRef.current = { id, controller };

    setTimeout(() => {
      setMsgs((m) => {
        return m.map((entry) => entry.role === 'ai' && entry.id === id
          ? { ...entry, stepsDone: 1 }
          : entry);
      });
    }, 180);

    setTimeout(() => {
      setMsgs((m) => {
        return m.map((entry) => entry.role === 'ai' && entry.id === id && !entry.ready
          ? { ...entry, stepsDone: Math.max(entry.stepsDone, 2) }
          : entry);
      });
    }, 900);

    void (async () => {
      try {
        const reply = await askFriday({ question, scope, history, signal: controller.signal });
        if (activeRequestRef.current?.id !== id) return;
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
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        if (activeRequestRef.current?.id !== id) return;
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
      } finally {
        if (activeRequestRef.current?.id === id) activeRequestRef.current = null;
        flushQueued();
      }
    })();
  };

  const runAction = async (messageId: string, target: AIMessage['actions'][number] | undefined) => {
    if (!target || target.status === 'running' || target.status === 'done') return;

    setMsgs((m) => m.map((entry) => entry.role === 'ai' && entry.id === messageId
      ? {
          ...entry,
          actions: entry.actions.map((action) => action.id === target.id
            ? { ...action, status: 'running', error: undefined }
            : action),
        }
      : entry));

    try {
      const result = await executeAskFridayAction(target);
      setMsgs((m) => m.map((entry) => entry.role === 'ai' && entry.id === messageId
        ? {
            ...entry,
            actions: entry.actions.map((action) => action.id === target.id
              ? { ...action, status: 'done', resultSummary: result.summary || 'Done' }
              : action),
          }
        : entry));
    } catch (err) {
      setMsgs((m) => m.map((entry) => entry.role === 'ai' && entry.id === messageId
        ? {
            ...entry,
            actions: entry.actions.map((action) => action.id === target.id
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

  const executeAction = async (messageId: string, actionId: string) => {
    const target = msgs
      .filter((m): m is AIMessage => m.role === 'ai')
      .find((m) => m.id === messageId)
      ?.actions.find((a) => a.id === actionId);
    await runAction(messageId, target);
  };

  const stop = () => {
    const active = activeRequestRef.current;
    if (!active) return;
    active.controller.abort();
    activeRequestRef.current = null;
    setMsgs((m) => m.map((entry) => entry.role === 'ai' && entry.id === active.id
      ? {
          ...entry,
          ready: true,
          stopped: true,
          text: 'Stopped. This turn stays in the conversation, and no action was executed.',
          followups: [],
          actions: [],
        }
      : entry));
    flushQueued();
  };

  return { msgs, submit, executeAction, stop, isThinking, queuedPrompt };
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

export function FridayComposer({
  input,
  setInput,
  onSubmit,
  isThinking,
  queuedPrompt,
  onStop,
  scope,
  autoFocus,
}: {
  input: string;
  setInput: (value: string | ((current: string) => string)) => void;
  onSubmit: () => void;
  isThinking: boolean;
  queuedPrompt: string | null;
  onStop: () => void;
  scope: string;
  autoFocus?: boolean;
}) {
  const dictation = useDictation({
    onTranscript: (text) => setInput((current) => appendTranscript(current, text)),
  });
  const isRecording = dictation.state === 'recording';
  const isTranscribing = dictation.state === 'transcribing';
  const micLabel = isRecording
    ? `Recording ${formatMs(dictation.recordingMs)}`
    : isTranscribing
      ? 'Transcribing'
      : dictation.state === 'requesting-mic'
        ? 'Mic'
        : 'Dictate';
  const canSend = input.trim().length > 0;

  return (
    <div className="friday-composer">
      {queuedPrompt && (
        <div className="friday-queued">
          <span>Queued</span>
          <strong>{queuedPrompt}</strong>
        </div>
      )}
      <div className="friday-composer-box">
        <textarea
          placeholder={`Ask Friday about ${scope.toLowerCase()}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={2}
          autoFocus={autoFocus}
        />
        <div className="friday-composer-tools">
          <button
            type="button"
            className={'friday-mic-btn' + (isRecording ? ' recording' : '') + (isTranscribing ? ' transcribing' : '')}
            onClick={dictation.toggle}
            disabled={!dictation.supported && dictation.state !== 'unsupported'}
            title={dictation.supported ? 'Dictate to Ask Friday' : 'Dictation is not supported in this browser'}
          >
            <IconMic size={14} />
            <span>{micLabel}</span>
          </button>
          {isThinking && (
            <button type="button" className="friday-stop-btn" onClick={onStop} title="Stop this Ask Friday turn">
              <IconStop size={13} />
              Stop
            </button>
          )}
          <button
            type="button"
            className="btn primary friday-send-btn"
            disabled={!canSend}
            onClick={onSubmit}
            title={isThinking ? 'Queue this after the current answer' : 'Send with Command+Enter'}
          >
            <IconSend size={13} />
            {isThinking ? 'Queue' : 'Send'}
          </button>
        </div>
      </div>
      <div className="friday-composer-meta">
        <span>Return adds a new line</span>
        <span>⌘ Enter sends</span>
        {dictation.lastError && <span className="warn">Mic: {dictation.lastError}</span>}
      </div>
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
    return <div className="friday-msg friday-msg-user" data-message-id={m.id}>{m.body}</div>;
  }
  const visibleCards = m.cards.filter((c) =>
    canSeeFridayCard(role, c.type, c.type === 'action' ? c.module : undefined),
  );
  return (
    <div className={'friday-msg friday-msg-ai' + (m.stopped ? ' stopped' : '')}>
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
          {!m.ready && (
            <div className="friday-thinking-row">
              <span>Working live context into a staff-safe answer</span>
              <i />
            </div>
          )}
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
                <div key={action.id} className={'fcard fcard-action friday-action-card status-' + (action.status || 'idle')}>
                  <span className={'dot ' + (action.risk === 'approval' ? 'amber' : action.risk === 'safe' ? 'accent' : 'neutral')} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fcard-title">{action.label}</div>
                    <div className="friday-action-meta">
                      {action.type.replace(/_/g, ' ')}
                      {action.risk === 'approval' ? ' · approval gated' : action.risk === 'safe' ? ' · direct internal action' : ''}
                    </div>
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
  const { msgs, submit, executeAction, stop, isThinking, queuedPrompt } = useFridayChat(scope);
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
          <FridayComposer
            input={input}
            setInput={setInput}
            onSubmit={() => onSubmit()}
            isThinking={isThinking}
            queuedPrompt={queuedPrompt}
            onStop={stop}
            scope={scope}
            autoFocus={open}
          />
        </form>
      </aside>
    </>
  );
}
