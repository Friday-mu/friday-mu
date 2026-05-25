'use client';

// Feedback FAB — captures bug reports, feature requests, and
// suggestions. Mounted globally on the FAD shell. POSTs to
// /api/feedback (backed by migration 029). The file is still called
// BugReport for backwards-compat with the existing FadApp import; the
// public surface is broader now.
//
// 2026-05-23 — agentic upgrades ported from Friday-mu/friday-website
// (catalog: agentic-feedback-fab @ commit 7d09887). Brings full-CSS-
// viewport capture (pixelRatio: 1, was 0.5), capture/chat sequence
// counters for stale-response protection, expandable screenshot
// preview, rich diagnostics payload, body scroll lock + Esc-to-close,
// portal-rendered modal, soft chat fallback, relaxed submit gate, and
// hardened lifecycle. The screenshot-aware chat upgrade is deferred:
// FAD's backend /api/feedback/chat doesn't accept screenshot input
// yet — separate slice with paired backend deploy.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../../../components/types';
import { IconAI, IconCheck, IconClose, IconTool } from './icons';
import { useDictation } from './useDictation';
import { useDoubleTapModifier } from './useDoubleTapModifier';

// Wraps a promise so it rejects after `ms` if the underlying capture
// hangs. html-to-image / html2canvas occasionally stall behind a slow
// font fetch or a misbehaving stylesheet; without a cap the FAB sits
// in "capturing…" forever and the user assumes it's broken.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]);
}

interface FeedbackDiagnostics {
  capturedAt: string;
  viewport: { width: number; height: number; scrollX: number; scrollY: number; devicePixelRatio: number };
  screen: { width: number; height: number; availableWidth: number; availableHeight: number };
  browser: {
    userAgent: string;
    platform: string;
    language: string;
    languages: string[];
    timezone: string;
    online: boolean;
    cookieEnabled: boolean;
    colorScheme: 'dark' | 'light';
  };
  screenshot: { attached: boolean; bytesApprox: number };
}

// Snapshot of viewport + browser + screen state captured at submission
// time. Server stores this in `description` so agentic debugging has
// device + dimension context without needing to ask the user.
function buildDiagnostics(screenshot: string | null): FeedbackDiagnostics {
  return {
    capturedAt: new Date().toISOString(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX || window.pageXOffset || 0,
      scrollY: window.scrollY || window.pageYOffset || 0,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
    screen: {
      width: window.screen?.width ?? 0,
      height: window.screen?.height ?? 0,
      availableWidth: window.screen?.availWidth ?? 0,
      availableHeight: window.screen?.availHeight ?? 0,
    },
    browser: {
      userAgent: navigator.userAgent.slice(0, 240),
      platform: navigator.platform || '',
      language: navigator.language || '',
      languages: Array.from(navigator.languages || []).slice(0, 6),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      online: navigator.onLine,
      cookieEnabled: navigator.cookieEnabled,
      colorScheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    },
    screenshot: {
      attached: Boolean(screenshot),
      bytesApprox: screenshot ? Math.round((screenshot.length * 3) / 4) : 0,
    },
  };
}

// Pick the platform-appropriate modifier symbol to surface in tooltips
// and hints. Mac shows ⌘ (Cmd); everyone else shows "Ctrl". Detection is
// best-effort — userAgentData.platform is preferred when available
// (Chromium), with a navigator.platform fallback for older browsers.
function getModifierSymbol(): string {
  if (typeof navigator === 'undefined') return '⌘';
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl';
}

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
  // Race document.fonts.ready against a 1.5 s ceiling. The promise can
  // hang indefinitely behind a slow / dead font CDN (Google Fonts,
  // Next.js font optimization races) — without the race the FAB sits
  // stuck on "Capturing screenshot…" forever. Ported from the
  // website's captureViewport pattern.
  await Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise<void>((r) => window.setTimeout(r, 1500)),
  ]).catch(() => {});
  await waitForImages(el, 1500);
  await nextFrame();
  await nextFrame();
}

async function captureWithHtmlToImage(el: HTMLElement, backgroundColor: string): Promise<string> {
  if (!captureModulePromise) {
    captureModulePromise = import('html-to-image') as Promise<typeof import('html-to-image')>;
  }
  const { toJpeg } = await captureModulePromise;
  // pixelRatio: 1 (was 0.5) — captures at full CSS viewport size so
  // mobile + desktop screenshots are readable enough for an agentic
  // debugger to spot UI state. Filesize trade is acceptable for the
  // 5MB submit ceiling (backend MAX_SCREENSHOT_BYTES).
  //
  // skipFonts: true — html-to-image walks every stylesheet looking for
  // @font-face rules, which throws CORS on cross-origin sheets. The
  // captured render still uses the browser's font cache; we just skip
  // the embed-into-SVG step.
  return withTimeout(
    toJpeg(el, {
      quality: 0.7,
      pixelRatio: 1,
      backgroundColor,
      cacheBust: true,
      skipFonts: true,
      // filter returns FALSE to drop a node. Skip the FAB so it doesn't
      // appear in its own corner, and skip <script>/<style> children
      // (no-op for capture, smaller serialized SVG).
      filter: (node: HTMLElement) => {
        if (!node.classList) return true;
        if (node.classList.contains('bug-fab')) return false;
        if (node.classList.contains('feedback-modal-backdrop')) return false;
        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return false;
        if (tag === 'IFRAME') return false;
        return true;
      },
    }),
    7_500,
    'html-to-image',
  );
}

async function captureWithHtml2canvas(el: HTMLElement, backgroundColor: string): Promise<string> {
  if (!html2canvasModulePromise) {
    html2canvasModulePromise = import('html2canvas') as Promise<typeof import('html2canvas')>;
  }
  const mod = await html2canvasModulePromise;
  // scale: 1 (was 0.5) — match html-to-image's upgraded pixelRatio so
  // fallback captures are equally readable.
  const canvas = await withTimeout(
    mod.default(el, {
      backgroundColor,
      scale: 1,
      logging: false,
      useCORS: true,
      ignoreElements: (node) =>
        Boolean(
          node.classList?.contains('bug-fab') ||
            node.classList?.contains('feedback-modal-backdrop'),
        ),
    }),
    8_500,
    'html2canvas',
  );
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
  // True while the screenshot capture is in flight but the modal is
  // already open. Lets the modal show a "Capturing screenshot…"
  // placeholder instead of jumping straight to the unavailable state.
  const [screenshotPending, setScreenshotPending] = useState(false);
  // Set when the modal is opened via the ⌘⌘ / Ctrl-Ctrl shortcut so the
  // child modal knows to auto-start dictation as soon as it mounts.
  const [shouldAutoStartDictation, setShouldAutoStartDictation] = useState(false);
  // Bumped on every ⌘⌘ tap that arrives while the modal is already
  // open. The child modal watches this to toggle dictation from
  // outside (the dictation hook lives in the modal, not here, so we
  // signal via a counter rather than calling toggle directly).
  const [dictationToggleSeq, setDictationToggleSeq] = useState(0);
  // Incremented every time a new capture starts (or the modal closes).
  // The async capture promise checks this counter before applying its
  // result — if the user closed + reopened before the screenshot landed,
  // the stale promise drops its result instead of poisoning the new
  // session. Matches the website's captureSeqRef pattern.
  const captureSeqRef = useRef(0);

  // Kick off the html2canvas dynamic import in the background as soon as
  // the FAB mounts. By the time the user clicks, the module is parsed
  // and the first capture is no slower than the second — eliminates the
  // "first click looks dark" timing failure mode.
  useEffect(() => {
    prewarmHtml2canvas();
  }, []);

  const handleClick = useCallback(async () => {
    if (capturing || open) return;
    const captureSeq = captureSeqRef.current + 1;
    captureSeqRef.current = captureSeq;
    setCapturing(true);
    setScreenshot(null);
    // Capture BEFORE the modal opens. FAD's capture targets `.fad-app`
    // (not document.body like the website pattern does), and the modal
    // is rendered inside `.fad-app`. Opening first would put the
    // position-fixed overlay inside the captured tree and html-to-image
    // hangs trying to walk it. Capture first, then open with the shot
    // already in hand. (Website can open-then-capture because it
    // targets body and the modal is excluded via the filter — different
    // tree, different trade-off.)
    let shot: string | null = null;
    try {
      shot = await captureViewport();
    } catch (err) {
      console.warn('[feedback] capture failed:', err);
    }
    if (captureSeqRef.current !== captureSeq) return; // user moved on
    setScreenshot(shot);
    setCapturing(false);
    setOpen(true);

    // Hard failsafe: if something stalls below the internal timeouts
    // (shouldn't happen with withTimeout in each capture path, but
    // defence in depth), release the capturing state after 15s so the
    // FAB doesn't sit stuck if the user re-triggers.
    window.setTimeout(() => {
      if (captureSeqRef.current !== captureSeq) return;
      setCapturing(false);
    }, 15_000);
  }, [capturing, open]);

  const handleClose = useCallback(() => {
    // Bump the capture seq so any in-flight screenshot from the
    // closing session can't land in the next open.
    captureSeqRef.current += 1;
    setOpen(false);
    setScreenshot(null);
    setScreenshotPending(false);
    setCapturing(false);
    // Reset shortcut-driven flags so the next plain-click open doesn't
    // inherit a stale auto-start signal from the previous session.
    setShouldAutoStartDictation(false);
    setDictationToggleSeq(0);
  }, []);

  // ⌘⌘ / Ctrl-Ctrl: open the modal AND start dictation in one move
  // from anywhere in FAD. If the modal is already open, the tap just
  // toggles dictation (start/stop).
  const handleShortcut = useCallback(() => {
    if (open) {
      setDictationToggleSeq((s) => s + 1);
    } else if (!capturing) {
      setShouldAutoStartDictation(true);
      void handleClick();
    }
  }, [open, capturing, handleClick]);

  useDoubleTapModifier({ keys: ['Meta', 'Control'], onDoubleTap: handleShortcut });

  const modSym = getModifierSymbol();

  // Render via portal to document.body so the FAB escapes any module-
  // level stacking context (transform, filter, position+z, isolation
  // ancestors). Without this, certain side panels and overlays were
  // landing visually above the FAB even though the FAB has the higher
  // z-index, because their ancestor stacking context outranked the
  // FAB's. Portalling means the FAB sits as a direct child of <body>
  // and competes for stacking only against other body-level positioned
  // elements — combined with z-index:100000 (fad.css) it is now
  // unambiguously on top of every FAD surface. Skips render server-
  // side / during the brief pre-mount window.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {/* Hide the FAB while our own modal is open. The FAB sits at
          z-index 100000 (above every other dialog so the team can
          report bugs from any surface); if we left it mounted while
          our own bug-report dialog is open it would float on top of
          itself, which looks awful. Unmounting is cleaner than
          visibility:hidden since the dialog is the focus anyway. */}
      {!open && (
        <button
          className={'bug-fab' + (capturing ? ' is-capturing' : '')}
          data-qa="feedback-fab"
          title={capturing ? 'Capturing…' : `Send feedback — bug · feature · suggestion  ·  ${modSym}${modSym} for voice`}
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
          screenshotPending={screenshotPending}
          onClose={handleClose}
          autoStartDictation={shouldAutoStartDictation}
          dictationToggleSeq={dictationToggleSeq}
        />
      )}
    </>,
    document.body,
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

// Cap to avoid runaway conversations. Friday is told via prompt to wrap
// up by turn 3; this is a hard ceiling so cost / payload stays bounded.
// Bumped 6 → 8 to give users a bit more room to add context after the
// AI follow-up (matches website's FeedbackModal cap).
const MAX_TURNS_USER = 8;

function BugReportModal({
  currentModuleLabel,
  initialScreenshot,
  screenshotPending = false,
  onClose,
  autoStartDictation = false,
  dictationToggleSeq = 0,
}: {
  currentModuleLabel?: string;
  initialScreenshot: string | null;
  /** True while the upstream capture is still in flight. Shows a pending placeholder until the screenshot lands or capture fails. */
  screenshotPending?: boolean;
  onClose: () => void;
  /** True when the modal was opened via the ⌘⌘ shortcut — start dictation on mount. */
  autoStartDictation?: boolean;
  /** Sequence counter from the parent; each increment is a ⌘⌘ tap while the modal was already open. */
  dictationToggleSeq?: number;
}) {
  const [type, setType] = useState<FeedbackType>('bug');
  // Screenshot is captured upstream in BugReportFab before this modal
  // mounts (so the modal itself isn't in the capture). The modal just
  // displays it.
  const screenshot = initialScreenshot;
  // Click-to-expand the screenshot thumbnail. Default collapsed so the
  // modal stays compact; user can tap to see the full capture before
  // submitting. Matches the website's screenshot preview UX.
  const [screenshotExpanded, setScreenshotExpanded] = useState(false);
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
  // Bumped on every chat send + on type switch + on close. The async
  // chat fetch checks this counter before applying its reply — if the
  // user switched type or closed the modal before the reply landed, we
  // drop the stale response instead of injecting it into the new
  // transcript. Same pattern as captureSeqRef on the FAB.
  const chatSeqRef = useRef(0);
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

  // Auto-start dictation when the modal was opened via the ⌘⌘ shortcut.
  // Tiny delay so the modal has time to paint and the mic-permission
  // prompt doesn't feel slammed-open simultaneously with the dialog.
  // We intentionally fire-once-on-mount; the parent resets the
  // autoStartDictation flag on close so each session starts clean.
  useEffect(() => {
    if (!autoStartDictation) return;
    const t = window.setTimeout(() => {
      dictation.toggle();
    }, 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to ⌘⌘ taps that land while the modal is already open. Parent
  // bumps the seq counter on each tap; we toggle on every change. The
  // initial-value capture avoids a phantom toggle on first mount when
  // the modal was opened via the shortcut (autoStartDictation handles
  // that path).
  const lastSeqRef = useRef(dictationToggleSeq);
  useEffect(() => {
    if (dictationToggleSeq === lastSeqRef.current) return;
    lastSeqRef.current = dictationToggleSeq;
    dictation.toggle();
  }, [dictationToggleSeq, dictation]);

  // Esc-to-close + body scroll lock while the modal is mounted. Lock
  // is restored on unmount even if a parent state path forgets to call
  // onClose. Disabled during submitting so the user can't accidentally
  // dismiss while the POST is in flight. Stops any in-flight dictation
  // first so a late transcript can't poison the next modal session.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || submitting) return;
      if (dictation.state === 'recording' || dictation.state === 'transcribing') {
        dictation.toggle();
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [submitting, onClose, dictation]);

  const trimmedInput = input.trim();
  const userMsgCount = messages.filter((m) => m.role === 'user').length;
  // 2026-05-23 — relaxed from "1 user + 1 Friday reply required" to
  // "1 user message is enough". Testers got stuck waiting for Friday
  // to reply before they could submit; the AI follow-up still runs in
  // parallel and they're welcome to answer it for richer context, but
  // it's no longer a hard gate. Mirrors website's FEEDBACK-2026-05-17
  // #4 relaxation.
  const hasMinimumExchange = userMsgCount >= 1;
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
    // Bump chat seq before the request so a delayed response from the
    // previous turn (or a previous type) can't land on top of this
    // one. We check chatSeqRef.current === chatSeq before applying the
    // reply.
    const chatSeq = chatSeqRef.current + 1;
    chatSeqRef.current = chatSeq;
    setMessages(nextMessages);
    setInput('');
    setThinking(true);
    setChatError(null);
    try {
      const routeUrl =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : null;
      // Only send the screenshot + diagnostics on the FIRST turn. Sending
      // a 500KB–2MB base64 blob on every chat reply (a) bloats the upload
      // each turn for no Gemini-side carry-over benefit (vision context
      // isn't preserved between requests), (b) doubles the round-trip
      // latency on slow connections — the modal felt "super slow" once
      // we doubled the capture resolution AND switched to vision per-turn.
      // The first turn primes the model with the visual; later turns are
      // text follow-ups, which is faster + cheaper + sufficient.
      const isFirstTurn = messages.length === 0;
      const body: Record<string, unknown> = {
        type,
        transcript: nextMessages,
        module_label: currentModuleLabel ?? null,
        route_url: routeUrl,
      };
      if (isFirstTurn) {
        body.screenshot_data_url = screenshot;
        body.diagnostics = buildDiagnostics(screenshot);
      }
      const data = await apiFetch('/api/feedback/chat', {
        method: 'POST',
        body: JSON.stringify(body),
      }) as { reply: string };
      if (chatSeqRef.current !== chatSeq) return; // stale — user moved on
      const reply = (data?.reply || '').trim();
      if (reply.length > 0) {
        setMessages((prev) => [...prev, { role: 'friday', text: reply }]);
      } else {
        setChatError('Friday went quiet. You can keep typing or just submit.');
      }
    } catch (err) {
      if (chatSeqRef.current !== chatSeq) return; // stale error too
      // Soft fallback: render the failure as a Friday assistant turn
      // instead of a red error chip. The user can still submit — the
      // transcript captures what was discussed and the fallback turn
      // makes it clear the AI was unreachable rather than ignoring
      // them. Mirrors the website's soft-fallback UX.
      console.warn('[feedback] chat failed:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'friday',
          text: "I'm not able to fetch a follow-up right now. Add anything else you want the team to know, then hit submit.",
        },
      ]);
    } finally {
      if (chatSeqRef.current === chatSeq) setThinking(false);
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
  // suggestion, so reusing a transcript would confuse Kimi. Bump
  // chatSeqRef so any in-flight reply from the previous type is
  // dropped instead of landing in the fresh transcript.
  const switchType = (t: FeedbackType) => {
    if (t === type) return;
    if (dictation.state === 'recording' || dictation.state === 'transcribing') {
      dictation.toggle();
    }
    chatSeqRef.current += 1;
    setType(t);
    setMessages([]);
    setInput('');
    setChatError(null);
    setThinking(false);
  };

  const submit = async () => {
    if (!canSubmit) return;
    // Stop any in-flight dictation + drop any pending chat reply so a
    // late landing doesn't race the submit confirmation.
    if (dictation.state === 'recording' || dictation.state === 'transcribing') {
      dictation.toggle();
    }
    chatSeqRef.current += 1;
    setThinking(false);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const firstUserMsg = messages.find((m) => m.role === 'user')?.text ?? '';
      const title = deriveTitle(firstUserMsg, currentModuleLabel);
      const diagnostics = buildDiagnostics(screenshot);
      // Serialise the chat plus diagnostics as the persisted
      // description. Each turn is labelled so the inbox view stays
      // scannable; diagnostics live in a fenced block at the bottom
      // so an agentic debugger can lift viewport / browser / timezone
      // context without parsing the prose.
      const description = renderFeedbackReport({
        type,
        moduleLabel: currentModuleLabel ?? null,
        messages,
        diagnostics,
      });
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
      <div className="fad-modal-overlay feedback-modal-backdrop" style={{ zIndex: 10000 }} onClick={onClose}>
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
    <div className="fad-modal-overlay feedback-modal-backdrop" style={{ zIndex: 10000 }} onClick={onClose}>
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

          {/* Screenshot preview — collapsed thumb until clicked, full
              when expanded. The user can SEE what they're sending
              instead of trusting an "attached" label. Pending state
              shows while the upstream capture is still in flight so
              there's no flash to the "unavailable" copy before the
              capture lands. */}
          <div className={'bug-screenshot-frame' + (screenshotExpanded ? ' is-expanded' : '')}>
            {screenshot ? (
              <button
                type="button"
                onClick={() => setScreenshotExpanded((v) => !v)}
                aria-label={screenshotExpanded ? 'Collapse screenshot preview' : 'Expand screenshot preview'}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span className="bug-screenshot-meta">{currentModuleLabel || 'current view'}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={screenshot}
                  alt="Page screenshot"
                  style={{
                    display: 'block',
                    width: '100%',
                    maxHeight: screenshotExpanded ? '70vh' : 200,
                    objectFit: screenshotExpanded ? 'contain' : 'cover',
                    objectPosition: 'top',
                  }}
                />
              </button>
            ) : screenshotPending ? (
              <div
                style={{
                  height: 200,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                Capturing screenshot…
              </div>
            ) : (
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
                        ? `Stop dictation (or ${getModifierSymbol()}${getModifierSymbol()})`
                        : dictation.state === 'transcribing'
                          ? 'Transcribing…'
                          : `Dictate — voice to text (${getModifierSymbol()}${getModifierSymbol()})`
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
                                                  : `${getModifierSymbol()}${getModifierSymbol()} to dictate · ${getModifierSymbol()}+Enter to send`}
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

// Render the full feedback packet for the inbox. Markdown body so the
// existing inbox renderer (Slack webhook + email HTML) keeps working;
// diagnostics go into a fenced JSON block at the end so an agentic
// debugger or human triager can lift viewport / browser / timezone
// context without scraping prose. Mirrors the website's
// renderFeedbackReport but kept compatible with FAD's backend that
// expects plain markdown in `description`.
function renderFeedbackReport(args: {
  type: FeedbackType;
  moduleLabel: string | null;
  messages: ChatMessage[];
  diagnostics: FeedbackDiagnostics;
}): string {
  const transcript = args.messages.length === 0
    ? '(no messages)'
    : args.messages
        .map((m) => (m.role === 'user' ? `**You:** ${m.text}` : `**Friday:** ${m.text}`))
        .join('\n\n');
  const d = args.diagnostics;
  const diagLines = [
    `- Captured: ${d.capturedAt}`,
    `- Viewport: ${d.viewport.width}×${d.viewport.height} (scroll ${d.viewport.scrollX},${d.viewport.scrollY}, DPR ${d.viewport.devicePixelRatio})`,
    `- Screen: ${d.screen.width}×${d.screen.height} (available ${d.screen.availableWidth}×${d.screen.availableHeight})`,
    `- Browser: ${d.browser.platform || '(unknown)'} · ${d.browser.language || '(no lang)'} · ${d.browser.timezone || '(no tz)'} · ${d.browser.online ? 'online' : 'offline'} · ${d.browser.colorScheme} mode`,
    `- User agent: ${d.browser.userAgent}`,
    `- Screenshot: ${d.screenshot.attached ? `attached (~${Math.round(d.screenshot.bytesApprox / 1024)} KB)` : 'not attached'}`,
  ].join('\n');
  return [
    `**Type:** ${args.type}`,
    args.moduleLabel ? `**Module:** ${args.moduleLabel}` : null,
    '',
    '**Transcript**',
    transcript,
    '',
    '**Safe diagnostics**',
    diagLines,
  ].filter((v) => v !== null).join('\n');
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
