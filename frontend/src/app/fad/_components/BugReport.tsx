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

export function BugReportFab({ currentModuleLabel }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="bug-fab"
        title="Send feedback — bug · feature · suggestion"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
      >
        <IconTool size={18} />
      </button>
      {open && (
        <BugReportModal
          currentModuleLabel={currentModuleLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface FridaySpec {
  title: string;
  steps: string[];
  expected: string;
  actual: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
}

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
  onClose,
}: {
  currentModuleLabel?: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<FeedbackType>('bug');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rephrasing, setRephrasing] = useState(false);
  const [spec, setSpec] = useState<FridaySpec | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const el = document.querySelector('.fad-app') as HTMLElement | null;
        if (!el) {
          setCapturing(false);
          return;
        }
        const canvas = await html2canvas(el, {
          backgroundColor: null,
          scale: 0.5,
          logging: false,
          useCORS: true,
        });
        if (!cancelled) {
          setScreenshot(canvas.toDataURL('image/jpeg', 0.7));
          setCapturing(false);
        }
      } catch {
        if (!cancelled) setCapturing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rephrase = () => {
    if (!description.trim()) return;
    setRephrasing(true);
    setSpec(null);
    setTimeout(() => {
      setSpec(fakeRephrase(description, title, currentModuleLabel));
      setRephrasing(false);
    }, 900);
  };

  const submit = async () => {
    if (submitting || !description.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        type,
        title: title.trim() || (spec?.title ?? null),
        description: description.trim(),
        route_url:
          typeof window !== 'undefined'
            ? window.location.pathname + window.location.search
            : null,
        module_label: currentModuleLabel ?? null,
      };
      if (screenshot) payload.screenshot_data_url = screenshot;
      // Only attach severity when the user generated a spec (bug flow).
      if (type === 'bug' && spec) payload.severity = spec.severity.toLowerCase();

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
          <button className="fad-util-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="fad-modal-body">
          {/* Type tabs — keep typing flow short by clearing the AI spec
              when switching, since the rephrase flow is bug-specific. */}
          <div role="tablist" aria-label="Feedback type" className="fad-feedback-tabs">
            {(['bug', 'feature', 'suggestion'] as FeedbackType[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={type === t}
                onClick={() => {
                  if (t === type) return;
                  setType(t);
                  if (t !== 'bug') setSpec(null);
                }}
                className={'fad-feedback-tab' + (type === t ? ' is-active' : '')}
                type="button"
              >
                {TYPE_META[t].label}
              </button>
            ))}
          </div>

          <div className="bug-screenshot-frame">
            {capturing && (
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
            )}
            {!capturing && !screenshot && (
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
            <label>Short title (optional)</label>
            <input
              placeholder={
                type === 'bug'
                  ? 'e.g. Calendar popover clips on mobile'
                  : type === 'feature'
                  ? 'e.g. Bulk-import doc URLs in one paste'
                  : 'e.g. Move CIA banner above stage strip'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
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
          {/* Rephrase is bug-specific: the FridaySpec shape (steps/expected/
              actual/severity) only makes sense for bugs. Feature requests
              and suggestions go in as free-text descriptions. */}
          {type === 'bug' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn ghost sm"
                onClick={rephrase}
                disabled={!description.trim() || rephrasing}
                style={{ opacity: !description.trim() || rephrasing ? 0.5 : 1 }}
              >
                <IconAI size={12} /> {rephrasing ? 'Rephrasing…' : 'Rephrase with Friday'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                Friday structures your report into Steps · Expected · Actual · Severity before filing.
              </span>
            </div>
          )}
          {type === 'bug' && spec && <FridaySpecCard spec={spec} />}
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
          <button className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={submit}
            disabled={!description.trim() || submitting}
            style={{ opacity: !description.trim() || submitting ? 0.5 : 1 }}
          >
            {submitting ? 'Submitting…' : type === 'bug' && spec ? 'File bug with spec' : meta.submitButton}
          </button>
        </div>
      </div>
    </div>
  );
}

function FridaySpecCard({ spec }: { spec: FridaySpec }) {
  return (
    <div className="bug-spec">
      <div className="bug-spec-head">
        <IconAI size={10} /> Friday structured this
      </div>
      <div className="bug-spec-field">
        <b>Title:</b> {spec.title}
      </div>
      <div className="bug-spec-field">
        <b>Steps to reproduce:</b>
        <ol style={{ margin: '4px 0 0 18px', padding: 0 }}>
          {spec.steps.map((s, i) => (
            <li key={i} style={{ marginBottom: 2 }}>
              {s}
            </li>
          ))}
        </ol>
      </div>
      <div className="bug-spec-field">
        <b>Expected:</b> {spec.expected}
      </div>
      <div className="bug-spec-field">
        <b>Actual:</b> {spec.actual}
      </div>
      <div className="bug-spec-field">
        <b>Severity:</b>{' '}
        <span
          className={
            'chip ' +
            (spec.severity === 'Critical' || spec.severity === 'High' ? 'warn' : 'info')
          }
        >
          {spec.severity}
        </span>
      </div>
    </div>
  );
}

function fakeRephrase(description: string, title: string, scope?: string): FridaySpec {
  const lc = description.toLowerCase();
  const inferSeverity = (): FridaySpec['severity'] => {
    if (/(crash|broken|lost data|can't|cannot|fails|error)/i.test(description)) return 'High';
    if (/(wrong|slow|unclear|missing)/i.test(description)) return 'Medium';
    return 'Low';
  };
  const sentences = description
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const steps = sentences.slice(0, 3).map((s, i) => {
    if (i === 0) return `Open ${scope || 'the affected view'}`;
    return s;
  });
  while (steps.length < 3) steps.push('Observe the behavior');
  const expected = /(should|expected|wanted)/i.test(description)
    ? sentences.find((s) => /(should|expected|wanted)/i.test(s)) ||
      'Feature should work as documented'
    : 'The action should complete without error, matching documented behavior.';
  const actual = /(but|instead|however|actually)/i.test(description)
    ? sentences.find((s) => /(but|instead|however|actually)/i.test(s)) ||
      description.slice(0, 100)
    : description.slice(0, 100);
  const derived = title?.trim() || (lc.includes('click') ? 'Click action fails' : 'Unexpected behavior');
  return {
    title: scope ? `[${scope}] ${derived}` : derived,
    steps,
    expected,
    actual,
    severity: inferSeverity(),
  };
}
