'use client';

// Feedback FAB — captures bug reports, feature requests, and
// suggestions. Mounted globally on the FAD shell. POSTs to
// /api/feedback (backed by migration 029). The file is still called
// BugReport for backwards-compat with the existing FadApp import; the
// public surface is broader now.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../components/types';
import { IconAI, IconCheck, IconClose, IconTool } from './icons';
import { useDictation } from './useDictation';

function IconMic({ size = 14, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={active ? 'currentColor' : 'none'} />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

type FeedbackType = 'bug' | 'feature' | 'suggestion';

interface Props {
  currentModuleLabel?: string;
}

// ── Screenshot capture ────────────────────────────────────────────────
//
// We tried html2canvas first. It walks the DOM and re-implements
// rendering pixel-by-pixel, which is inherently flaky with modern CSS
// (custom properties, color-mix, gradients, oklch — FAD uses all of
// these). Symptom: random "darker module" patches that came and went
// based on style-cache warmth, even after layers of font/image/rAF
// waits.
//
// We now use `html-to-image` (already in package.json). Different
// approach: serialize the DOM → inline-SVG with foreignObject → let
// the browser render the SVG into a canvas natively. Far more faithful
// to actual CSS because we delegate rendering to the browser instead
// of reimplementing it.
//
// html2canvas is kept as a fallback for the rare case `html-to-image`
// errors — better a slightly-flaky screenshot than no screenshot.
//
// Reliability layers preserved on top:
//   1. Pre-warm the dynamic import on FAB mount (no cold first click).
//   2. Wait for fonts + in-flight images + 2 rAF ticks before capturing.
//   3. Pass explicit backgroundColor so any un-painted pixel falls back
//      to the page bg, not JPEG-black.

let captureModulePromise: Promise<typeof import('html-to-image')> | null = null;
let html2canvasModulePromise: Promise<typeof import('html2canvas')> | null = null;

function prewarmHtml2canvas(): void {
  // Keep the original name — the BugReportFab useEffect calls it on
  // mount. Now warms BOTH the primary and fallback libs.
  const start = () => {
    if (!captureModulePromise) {
      captureModulePromise = import('html-to-image').catch(() => {
        captureModulePromise = null;
        throw new Error('html-to-image chunk failed to load');
      }) as Promise<typeof import('html-to-image')>;
    }
    if (!html2canvasModulePromise) {
      html2canvasModulePromise = import('html2canvas').catch(() => {
        html2canvasModulePromise = null;
        throw new Error('html2canvas chunk failed to load');
      }) as Promise<typeof import('html2canvas')>;
    }
  };
  const ric = (window as typeof window & { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') ric(start, { timeout: 2000 });
  else setTimeout(start, 200);
}

async function waitForImages(root: HTMLElement, timeoutMs = 1500): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
  const pending = imgs.filter((img) => !img.complete || img.naturalWidth === 0);
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          }),
      ),
    ),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function resolveBackgroundColor(el: HTMLElement): string {
  const computedBg = window.getComputedStyle(el).backgroundColor;
  const isTransparent =
    !computedBg || computedBg === 'rgba(0, 0, 0, 0)' || computedBg === 'transparent';
  return isTransparent ? '#ffffff' : computedBg;
}

async function settlePaint(el: HTMLElement): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  await waitForImages(el, 1500);
  await nextFrame();
  await nextFrame();
}

async function captureWithHtmlToImage(el: HTMLElement, backgroundColor: string): Promise<string> {
  if (!captureModulePromise) {
    captureModulePromise = import('html-to-image') as Promise<typeof import('html-to-image')>;
  }
  const { toJpeg } = await captureModulePromise;
  return toJpeg(el, {
    quality: 0.7,
    pixelRatio: 0.5,
    backgroundColor,
    cacheBust: true,
    // filter returns FALSE to drop a node. Skip the FAB so it doesn't
    // appear in its own corner, and skip <script>/<style> children
    // (no-op for capture, smaller serialized SVG).
    filter: (node: HTMLElement) => {
      if (!node.classList) return true;
      if (node.classList.contains('bug-fab')) return false;
      const tag = node.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return false;
      return true;
    },
  });
}

async function captureWithHtml2canvas(el: HTMLElement, backgroundColor: string): Promise<string> {
  if (!html2canvasModulePromise) {
    html2canvasModulePromise = import('html2canvas') as Promise<typeof import('html2canvas')>;
  }
  const mod = await html2canvasModulePromise;
  const canvas = await mod.default(el, {
    backgroundColor,
    scale: 0.5,
    logging: false,
    useCORS: true,
    ignoreElements: (node) => node.classList?.contains('bug-fab') ?? false,
  });
  return canvas.toDataURL('image/jpeg', 0.7);
}

async function captureViewport(): Promise<string | null> {
  // Prefer `.fad-app` (the shell on /fad/*) so we get the actual app
  // surface with its background. On routes outside the FAD shell —
  // /design-docs/[doc] in particular, which is where Mathias filed
  // bugs from — `.fad-app` isn't in the DOM. Fall back to document
  // body so the FAB still produces a screenshot.
  const el =
    (document.querySelector('.fad-app') as HTMLElement | null) ??
    (document.body as HTMLElement | null);
  if (!el) return null;
  await settlePaint(el);
  const backgroundColor = resolveBackgroundColor(el);
  // Primary path: html-to-image (better modern-CSS fidelity).
  try {
    return await captureWithHtmlToImage(el, backgroundColor);
  } catch (err) {
    console.warn('[feedback] html-to-image failed, falling back to html2canvas:', err);
  }
  // Fallback: html2canvas (legacy renderer).
  try {
    return await captureWithHtml2canvas(el, backgroundColor);
  } catch (err) {
    console.warn('[feedback] html2canvas fallback also failed:', err);
    return null;
  }
}

export function BugReportFab({ currentModuleLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  // Kick off the html2canvas dynamic import in the background as soon as
  // the FAB mounts. By the time the user clicks, the module is parsed
  // and the first capture is no slower than the second — eliminates the
  // "first click looks dark" timing failure mode.
  useEffect(() => {
    prewarmHtml2canvas();
  }, []);

  const handleClick = async () => {
    if (capturing || open) return;
    setCapturing(true);
    const shot = await captureViewport();
    setScreenshot(shot);
    setCapturing(false);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setScreenshot(null);
  };

  return (
    <>
      {/* Hide the FAB while our own modal is open. The FAB sits at
          z-index 110 (above every other dialog so the team can report
          bugs that occur inside modals); if we left it mounted while
          our own bug-report dialog is open it would float on top of
          itself, which looks awful. Unmounting is cleaner than
          visibility:hidden since the dialog is the focus anyway. */}
      {!open && (
        <button
          className={'bug-fab' + (capturing ? ' is-capturing' : '')}
          title={capturing ? 'Capturing…' : 'Send feedback — bug · feature · suggestion'}
          onClick={handleClick}
          aria-label="Send feedback"
          disabled={capturing}
        >
          <IconTool size={18} />
        </button>
      )}
      {open && (
        <BugReportModal
          currentModuleLabel={currentModuleLabel}
          initialScreenshot={screenshot}
          onClose={handleClose}
        />
      )}
    </>
  );
}

// Friday's optional "fill-the-gaps" pass. Instead of asking the user
// to pre-structure their report (which they won't), they brain-dump in
// one field. Friday reads what they wrote + page context and proposes
// 2–4 short, specific follow-ups. The user can answer some, all, or
// none and submit either way.
// One message in the chat transcript. `role: 'friday'` is rendered on
// the left with the AI bubble; 'user' on the right. The transcript is
// posted in full to /api/feedback/chat on each turn — Kimi is stateless
// on our side, so the frontend owns the conversation state.
interface ChatMessage {
  role: 'user' | 'friday';
  text: string;
}

// Type-aware copy. Keeps the modal feeling tailored without three
// near-duplicate components.
const TYPE_META: Record<FeedbackType, {
  label: string;
  title: string;
  initialPlaceholder: string;
  replyPlaceholder: string;
  submitButton: string;
  successHeading: string;
  successSub: string;
}> = {
  bug: {
    label: 'Bug',
    title: 'Report a bug',
    initialPlaceholder: 'Tell Friday what happened — what you tried to do and what went wrong.',
    replyPlaceholder: 'Reply to Friday…',
    submitButton: 'File bug',
    successHeading: 'Bug filed',
    successSub: "Friday saved it to the feedback inbox — we'll triage and follow up.",
  },
  feature: {
    label: 'Feature request',
    title: 'Request a feature',
    initialPlaceholder: 'Tell Friday what you\'d like — what should the app do that it doesn\'t?',
    replyPlaceholder: 'Reply to Friday…',
    submitButton: 'Submit request',
    successHeading: 'Feature request filed',
    successSub: "Friday saved it to the feedback inbox — we'll review when we plan the next sprint.",
  },
  suggestion: {
    label: 'Suggestion',
    title: 'Share a suggestion',
    initialPlaceholder: "What's on your mind? Anything that could be better — Friday will ask follow-ups.",
    replyPlaceholder: 'Reply to Friday…',
    submitButton: 'Submit suggestion',
    successHeading: 'Suggestion filed',
    successSub: 'Friday saved it to the feedback inbox — thank you.',
  },
};

// Cap to avoid runaway conversations. Friend is told via prompt to wrap
// up by turn 3; this is a hard ceiling so cost / payload stays bounded.
const MAX_TURNS_USER = 6;

function BugReportModal({
  currentModuleLabel,
  initialScreenshot,
  onClose,
}: {
  currentModuleLabel?: string;
  initialScreenshot: string | null;
  onClose: () => void;
}) {
  const [type, setType] = useState<FeedbackType>('bug');
  // Screenshot is captured upstream in BugReportFab before this modal
  // mounts (so the modal itself isn't in the capture). The modal just
  // displays it.
  const screenshot = initialScreenshot;
  // The chat transcript. First message is always from the user (their
  // initial description); from there Friday replies, user can reply
  // back, etc. Posted in full to /api/feedback/chat on each turn.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false); // Friday is replying
  const [chatError, setChatError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  // Auto-scroll the chat to the bottom on new messages / thinking state.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  // Dictation — server-side STT. onTranscript fires once when the
  // recording finishes uploading and is transcribed, so we just append
  // to whatever text the user has already typed.
  const dictation = useDictation({
    onTranscript: (text) => {
      setInput((cur) => {
        const trimmed = cur.replace(/\s+$/, '');
        const sep = trimmed.length > 0 ? ' ' : '';
        return trimmed + sep + text;
      });
    },
  });

  const handleMicClick = () => {
    dictation.toggle();
  };

  const trimmedInput = input.trim();
  const userMsgCount = messages.filter((m) => m.role === 'user').length;
  const fridayMsgCount = messages.filter((m) => m.role === 'friday').length;
  // Submit is unlocked once the user has sent at least 1 message AND
  // Friday has replied at least once. After that, submit is always
  // available — the user can keep chatting OR submit immediately.
  const hasMinimumExchange = userMsgCount >= 1 && fridayMsgCount >= 1;
  const canSubmit = hasMinimumExchange && !submitting;
  // Lock further user messages once we hit the cap. They can still
  // submit at any point.
  const reachedTurnCap = userMsgCount >= MAX_TURNS_USER;
  const canSend = trimmedInput.length > 0 && !thinking && !reachedTurnCap;

  const send = async () => {
    if (!canSend) return;
    // Stop any in-flight dictation so a late transcript doesn't land in
    // the cleared input after we've sent the message.
    if (dictation.state === 'recording' || dictation.state === 'transcribing') {
      dictation.toggle();
    }
    const userMsg: ChatMessage = { role: 'user', text: trimmedInput };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setThinking(true);
    setChatError(null);
    try {
      const routeUrl =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : null;
      const data = await apiFetch('/api/feedback/chat', {
        method: 'POST',
        body: JSON.stringify({
          type,
          transcript: nextMessages,
          module_label: currentModuleLabel ?? null,
          route_url: routeUrl,
        }),
      }) as { reply: string };
      const reply = (data?.reply || '').trim();
      if (reply.length > 0) {
        setMessages((prev) => [...prev, { role: 'friday', text: reply }]);
      } else {
        setChatError('Friday went quiet. You can keep typing or just submit.');
      }
    } catch (err) {
      setChatError(err instanceof Error
        ? err.message
        : 'Friday had trouble responding — you can keep typing or just submit.');
    } finally {
      setThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter sends. Plain Enter allows newlines (chat-style
    // multi-line composition).
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canSend) send();
    }
  };

  // Switching feedback type mid-conversation resets the chat — the
  // structure of useful questions differs across bug / feature /
  // suggestion, so reusing a transcript would confuse Kimi.
  const switchType = (t: FeedbackType) => {
    if (t === type) return;
    if (dictation.state === 'recording' || dictation.state === 'transcribing') {
      dictation.toggle();
    }
    setType(t);
    setMessages([]);
    setInput('');
    setChatError(null);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const firstUserMsg = messages.find((m) => m.role === 'user')?.text ?? '';
      const title = deriveTitle(firstUserMsg, currentModuleLabel);
      // Serialise the chat as the persisted description. Each turn is
      // labelled so the inbox view stays scannable.
      const description = messages
        .map((m) => (m.role === 'user' ? `**You:** ${m.text}` : `**Friday:** ${m.text}`))
        .join('\n\n');
      const payload: Record<string, unknown> = {
        type,
        title,
        description,
        route_url:
          typeof window !== 'undefined'
            ? window.location.pathname + window.location.search
            : null,
        module_label: currentModuleLabel ?? null,
      };
      if (screenshot) payload.screenshot_data_url = screenshot;

      await apiFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setSubmitted(true);
      setTimeout(onClose, 1400);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed — please retry');
      setSubmitting(false);
    }
  };

  const meta = TYPE_META[type];

  if (submitted) {
    return (
      <div className="fad-modal-overlay" style={{ zIndex: 10000 }} onClick={onClose}>
        <div className="fad-modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
          <div className="fad-modal-body" style={{ textAlign: 'center', padding: 40 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                background: 'var(--color-bg-success)',
                color: 'var(--color-text-success)',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 16px',
              }}
            >
              <IconCheck size={24} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
              {meta.successHeading}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              {meta.successSub}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fad-modal-overlay" style={{ zIndex: 10000 }} onClick={onClose}>
      <div className="fad-modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="fad-modal-head">
          <IconTool size={16} />
          <div className="fad-modal-title">{meta.title}</div>
          {currentModuleLabel && (
            <span className="chip" style={{ marginLeft: 8 }}>
              on {currentModuleLabel}
            </span>
          )}
          <button type="button" className="fad-util-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="fad-modal-body">
          {/* Type tabs — switching mid-chat clears the transcript
              since the structure of useful questions differs. */}
          <div role="tablist" aria-label="Feedback type" className="fad-feedback-tabs">
            {(['bug', 'feature', 'suggestion'] as FeedbackType[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={type === t}
                onClick={() => switchType(t)}
                className={'fad-feedback-tab' + (type === t ? ' is-active' : '')}
                type="button"
              >
                {TYPE_META[t].label}
              </button>
            ))}
          </div>

          <div className="bug-screenshot-frame">
            {!screenshot && (
              <div
                style={{
                  height: 200,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                Screenshot unavailable · proceed without
              </div>
            )}
            {screenshot && (
              <>
                <span className="bug-screenshot-meta">{currentModuleLabel || 'current view'}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshot} alt="Page screenshot" />
              </>
            )}
          </div>

          {/* Chat transcript. Empty state explains the flow. */}
          <div
            ref={transcriptRef}
            className="bug-chat-transcript"
            data-feedback-chat-transcript
          >
            {messages.length === 0 && (
              <div className="bug-chat-empty">
                <IconAI size={14} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>
                    Tell Friday what's going on
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    Just braindump. Friday will ask one or two follow-ups, then you can file the report.
                  </div>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} text={m.text} />
            ))}
            {thinking && (
              <div className="bug-chat-thinking" aria-live="polite">
                <IconAI size={10} />
                <span>Friday is thinking…</span>
              </div>
            )}
            {chatError && (
              <div
                role="status"
                style={{
                  margin: '6px 0',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-bg-warning)',
                  color: 'var(--color-text-warning)',
                  fontSize: 12,
                }}
              >
                {chatError}
              </div>
            )}
          </div>

          {/* Input area. Cmd/Ctrl+Enter sends; plain Enter newlines. */}
          <div className="bug-chat-input">
            <textarea
              rows={messages.length === 0 ? 4 : 2}
              placeholder={messages.length === 0 ? TYPE_META[type].initialPlaceholder : TYPE_META[type].replyPlaceholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={thinking || reachedTurnCap}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {dictation.supported && (
                  <button
                    type="button"
                    onClick={handleMicClick}
                    disabled={thinking || reachedTurnCap || dictation.state === 'transcribing'}
                    aria-pressed={dictation.state === 'recording'}
                    title={
                      dictation.state === 'recording'
                        ? 'Stop dictation'
                        : dictation.state === 'transcribing'
                          ? 'Transcribing…'
                          : 'Dictate (voice → text)'
                    }
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      border: '1px solid var(--color-border)',
                      background:
                        dictation.state === 'recording'
                          ? 'var(--color-bg-danger)'
                          : dictation.state === 'transcribing' || dictation.state === 'requesting-mic'
                            ? 'var(--color-bg-info, var(--color-bg-subtle))'
                            : 'var(--color-bg-subtle)',
                      color:
                        dictation.state === 'recording'
                          ? 'var(--color-text-danger)'
                          : dictation.state === 'transcribing' || dictation.state === 'requesting-mic'
                            ? 'var(--color-text-info, var(--color-text-tertiary))'
                            : 'var(--color-text-tertiary)',
                      cursor:
                        thinking || reachedTurnCap || dictation.state === 'transcribing'
                          ? 'not-allowed'
                          : 'pointer',
                      opacity: thinking || reachedTurnCap ? 0.4 : 1,
                      animation:
                        dictation.state === 'recording' || dictation.state === 'requesting-mic'
                          ? 'fad-mic-pulse 1.4s ease-in-out infinite'
                          : undefined,
                      flexShrink: 0,
                    }}
                  >
                    <IconMic size={13} active={dictation.state === 'recording'} />
                  </button>
                )}
                <span
                  style={{
                    fontSize: 10,
                    color: dictation.lastError ? 'var(--color-text-danger)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {dictation.lastError === 'not-allowed'
                    ? 'Mic blocked — click the lock icon in your browser to allow.'
                    : dictation.lastError === 'audio-capture'
                      ? 'No microphone detected on this device.'
                      : dictation.lastError === 'mic-init-failed'
                        ? "Couldn't access the microphone — try again or check OS settings."
                        : dictation.lastError === 'recorder-error'
                          ? 'Recorder crashed — click mic to try again.'
                          : dictation.lastError === 'not-configured'
                            ? 'Transcription service not configured on the server.'
                            : dictation.lastError === 'unauthorized'
                              ? 'Sign in again to use dictation.'
                              : dictation.lastError === 'rate-limited'
                                ? 'Dictation rate limit hit — try again in a minute.'
                                : dictation.lastError === 'network'
                                  ? 'Network error reaching the transcription service — try again.'
                                  : dictation.lastError === 'transcribe-failed'
                                    ? 'Transcription failed — try again.'
                                    : dictation.lastError === 'no-speech'
                                      ? "Didn't catch that — click mic and try again."
                                      : dictation.lastError === 'unsupported'
                                        ? "This browser doesn't support voice recording."
                                        : dictation.lastError
                                          ? `Dictation error: ${dictation.lastError}`
                                          : dictation.state === 'requesting-mic'
                                            ? 'Waiting for microphone permission…'
                                            : dictation.state === 'recording'
                                              ? `Recording${dictation.recordingMs > 1000 ? ` · ${Math.floor(dictation.recordingMs / 1000)}s` : '…'} · click mic to stop`
                                              : dictation.state === 'transcribing'
                                                ? 'Transcribing…'
                                                : reachedTurnCap
                                                  ? "Friday's heard enough — submit when ready."
                                                  : 'Cmd/Ctrl+Enter to send.'}
                </span>
              </div>
              <button
                type="button"
                className="btn primary sm"
                onClick={send}
                disabled={!canSend}
                style={{ opacity: !canSend ? 0.5 : 1 }}
              >
                {thinking ? 'Sending…' : messages.length === 0 ? 'Send to Friday' : 'Reply'}
              </button>
            </div>
          </div>

          {submitError && (
            <div
              role="alert"
              style={{
                marginTop: 12,
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-bg-danger)',
                color: 'var(--color-text-danger)',
                fontSize: 12,
              }}
            >
              {submitError}
            </div>
          )}
        </div>
        <div className="fad-modal-foot">
          {!canSubmit && !submitting && (
            <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
              {messages.length === 0
                ? 'Send your first message to Friday'
                : 'Waiting for Friday\'s reply…'}
            </span>
          )}
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={submit}
            disabled={!canSubmit}
            style={{ opacity: !canSubmit ? 0.5 : 1 }}
            title={
              messages.length === 0
                ? 'Send your first message to Friday before filing'
                : !hasMinimumExchange
                  ? 'Waiting for Friday\'s reply'
                  : undefined
            }
          >
            {submitting ? 'Submitting…' : meta.submitButton}
          </button>
        </div>
      </div>
    </div>
  );
}

// Concise title for the inbox row. First sentence (or first line),
// capped at 80 chars, prefixed with the module label when available.
function deriveTitle(description: string, scope?: string): string {
  const firstSegment = description.split(/[.\n]/).map((s) => s.trim()).find(Boolean) || description.trim();
  const truncated = firstSegment.length > 80 ? firstSegment.slice(0, 77) + '…' : firstSegment;
  const safe = truncated.length >= 4 ? truncated : 'Untitled report';
  return scope ? `[${scope}] ${safe}` : safe;
}

function ChatBubble({ role, text }: { role: 'user' | 'friday'; text: string }) {
  const isUser = role === 'user';
  return (
    <div className={'bug-chat-bubble ' + (isUser ? 'is-user' : 'is-friday')}>
      <div className="bug-chat-bubble-role">
        {isUser ? 'You' : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <IconAI size={10} /> Friday
          </span>
        )}
      </div>
      <div className="bug-chat-bubble-text">{text}</div>
    </div>
  );
}
