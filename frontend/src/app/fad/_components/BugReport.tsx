'use client';

// Feedback FAB — captures bug reports, feature requests, and
// suggestions. Mounted globally on the FAD shell. POSTs to
// /api/feedback (backed by migration 029). The file is still called
// BugReport for backwards-compat with the existing FadApp import; the
// public surface is broader now.

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';
import { IconAI, IconCheck, IconClose, IconTool } from './icons';

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
  const el = document.querySelector('.fad-app') as HTMLElement | null;
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
      <button
        className={'bug-fab' + (capturing ? ' is-capturing' : '')}
        title={capturing ? 'Capturing…' : 'Send feedback — bug · feature · suggestion'}
        onClick={handleClick}
        aria-label="Send feedback"
        disabled={capturing}
      >
        <IconTool size={18} />
      </button>
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
interface ClarifyingQA {
  question: string;
  answer: string;
}

const ASK_FRIDAY_HELP: Record<FeedbackType, string> = {
  bug: 'Friday reads your bug and asks specific follow-ups (repro steps, what you expected, frequency).',
  feature: 'Friday reads your request and asks specific follow-ups (who benefits, what problem it solves, concrete use case).',
  suggestion: 'Friday reads your suggestion and asks specific follow-ups (current behaviour, friction, suggested change).',
};

// Type-aware copy. Keeps the modal feeling tailored without three
// near-duplicate components.
const TYPE_META: Record<FeedbackType, {
  label: string;
  title: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  submitButton: string;
  successHeading: string;
  successSub: string;
}> = {
  bug: {
    label: 'Bug',
    title: 'Report a bug',
    descriptionLabel: 'What happened?',
    descriptionPlaceholder:
      'Describe the issue in your own words — steps, what you expected, what happened instead. Friday will rephrase into a structured spec.',
    submitButton: 'File bug',
    successHeading: 'Bug filed',
    successSub: "Friday saved it to the feedback inbox — we'll triage and follow up.",
  },
  feature: {
    label: 'Feature request',
    title: 'Request a feature',
    descriptionLabel: 'What would you like to see?',
    descriptionPlaceholder:
      "Describe the feature, who it's for, and why it matters. Concrete examples help.",
    submitButton: 'Submit request',
    successHeading: 'Feature request filed',
    successSub: "Friday saved it to the feedback inbox — we'll review when we plan the next sprint.",
  },
  suggestion: {
    label: 'Suggestion',
    title: 'Share a suggestion',
    descriptionLabel: "What's on your mind?",
    descriptionPlaceholder:
      'Anything that could be better — UX papercut, wording, a workflow nudge. No detail too small.',
    submitButton: 'Submit suggestion',
    successHeading: 'Suggestion filed',
    successSub: 'Friday saved it to the feedback inbox — thank you.',
  },
};

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
  const [description, setDescription] = useState('');
  const [asking, setAsking] = useState(false);
  // Once Friday has proposed follow-ups, they live here. Answers default
  // to '' — submission appends only the ones the user actually filled in.
  const [qas, setQas] = useState<ClarifyingQA[]>([]);
  const [askError, setAskError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const trimmedDescription = description.trim();
  const canAskFriday = trimmedDescription.length >= 4 && !asking;
  // Submit is always available as long as there's a description. The
  // follow-up questions are 100% optional — the user can ignore them
  // and just submit raw text. This is the simplicity we lost with the
  // mandatory-rephrase flow; we get the structure back via Kimi at
  // triage time in the inbox, not at capture time.
  const canSubmit = trimmedDescription.length > 0 && !submitting;

  const askFriday = async () => {
    if (!canAskFriday) return;
    setAsking(true);
    setAskError(null);
    try {
      const routeUrl =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : null;
      const data = await apiFetch('/api/feedback/clarifying-questions', {
        method: 'POST',
        body: JSON.stringify({
          type,
          description: trimmedDescription,
          module_label: currentModuleLabel ?? null,
          route_url: routeUrl,
        }),
      }) as { questions: string[] };
      const list = Array.isArray(data?.questions) ? data.questions : [];
      if (list.length === 0) {
        setQas([]);
        setAskError('Friday says your description is already complete — submit when ready.');
      } else {
        setQas(list.map((q) => ({ question: q, answer: '' })));
      }
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Failed to fetch questions');
    } finally {
      setAsking(false);
    }
  };

  const setAnswer = (idx: number, value: string) => {
    setQas((prev) => prev.map((q, i) => (i === idx ? { ...q, answer: value } : q)));
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Title: first sentence of description, capped at 80 chars. Keeps
      // the inbox row scannable without making the user invent one.
      const title = deriveTitle(trimmedDescription, currentModuleLabel);
      // Build the final description: raw text + any Q/A pairs the user
      // bothered to answer. Unanswered questions are dropped entirely
      // (no point persisting "Q: ... / A: ").
      const answered = qas.filter((q) => q.answer.trim().length > 0);
      const fullDescription = answered.length === 0
        ? trimmedDescription
        : [
            trimmedDescription,
            '',
            '---',
            '**Friday\'s follow-up questions:**',
            ...answered.flatMap((q) => [`**Q:** ${q.question}`, `**A:** ${q.answer.trim()}`, '']),
          ].join('\n').trim();
      const payload: Record<string, unknown> = {
        type,
        title,
        description: fullDescription,
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
      <div className="fad-modal-overlay" onClick={onClose}>
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
    <div className="fad-modal-overlay" onClick={onClose}>
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
          {/* Type tabs — clear any pending follow-ups on switch since
              the question set is type-specific. */}
          <div role="tablist" aria-label="Feedback type" className="fad-feedback-tabs">
            {(['bug', 'feature', 'suggestion'] as FeedbackType[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={type === t}
                onClick={() => {
                  if (t === type) return;
                  setType(t);
                  setQas([]);
                  setAskError(null);
                }}
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
          <div className="fad-field">
            <label>{meta.descriptionLabel}</label>
            <textarea
              rows={4}
              placeholder={meta.descriptionPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {/* Optional: Ask Friday for follow-up questions. Submission is
              never gated on this — it's a "tell us a bit more if you can"
              prompt, not a wall. */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={(e) => { e.preventDefault(); askFriday(); }}
              disabled={!canAskFriday}
              style={{ opacity: !canAskFriday ? 0.5 : 1 }}
            >
              <IconAI size={12} />{' '}
              {asking
                ? 'Friday is thinking…'
                : qas.length > 0
                  ? 'Ask Friday again'
                  : 'Ask Friday for follow-ups'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {ASK_FRIDAY_HELP[type]}
            </span>
          </div>
          {askError && (
            <div
              role="status"
              style={{
                marginTop: 8,
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-bg-info)',
                color: 'var(--color-text-info)',
                fontSize: 12,
              }}
            >
              {askError}
            </div>
          )}
          {qas.length > 0 && (
            <div className="bug-spec" style={{ marginTop: 12 }}>
              <div className="bug-spec-head">
                <IconAI size={10} /> Friday asks — answer what you can (optional)
              </div>
              {qas.map((q, i) => (
                <div key={i} className="fad-field" style={{ marginBottom: 10 }}>
                  <label style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {q.question}
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Skip if you don't have an answer"
                    value={q.answer}
                    onChange={(e) => setAnswer(i, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
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
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={submit}
            disabled={!canSubmit}
            style={{ opacity: !canSubmit ? 0.5 : 1 }}
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
