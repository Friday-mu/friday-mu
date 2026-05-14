'use client';

// Feedback FAB — captures bug reports, feature requests, and
// suggestions. Mounted globally on the FAD shell. POSTs to
// /api/feedback (backed by migration 029). The file is still called
// BugReport for backwards-compat with the existing FadApp import; the
// public surface is broader now.

import { useState } from 'react';
import { apiFetch } from '../../../components/types';
import { IconAI, IconCheck, IconClose, IconTool } from './icons';

type FeedbackType = 'bug' | 'feature' | 'suggestion';

interface Props {
  currentModuleLabel?: string;
}

// Capture the underlying page BEFORE the modal mounts. Doing it inside
// the modal's useEffect meant html2canvas saw the modal overlay over
// the content — every screenshot was a giant dimmed rectangle with
// the bug form on top. By moving capture into the FAB onClick, the
// modal opens with a screenshot of the *previous* viewport state.
//
// `.bug-fab` is excluded via ignoreElements so the FAB itself doesn't
// show in the bottom-right corner of the capture.
async function captureViewport(): Promise<string | null> {
  try {
    const html2canvas = (await import('html2canvas')).default;
    const el = document.querySelector('.fad-app') as HTMLElement | null;
    if (!el) return null;

    // Wait for in-flight font loads so glyphs aren't mid-swap during
    // capture (otherwise headings render in the fallback font).
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    // JPEG encoding cannot represent transparency — any pixel left
    // transparent by html2canvas gets filled BLACK by the JPEG encoder.
    // On the first capture html2canvas's style-resolution cache is cold
    // and some nested elements come back without their resolved
    // background, producing the "module looks dark" symptom users see.
    // Reading .fad-app's actual background and passing it explicitly
    // makes the canvas opaque from the start, so any unpainted regions
    // fall back to the page's real background color.
    const computedBg = window.getComputedStyle(el).backgroundColor;
    const isTransparent = !computedBg
      || computedBg === 'rgba(0, 0, 0, 0)'
      || computedBg === 'transparent';
    const backgroundColor = isTransparent ? '#ffffff' : computedBg;

    const canvas = await html2canvas(el, {
      backgroundColor,
      scale: 0.5,
      logging: false,
      useCORS: true,
      ignoreElements: (node) => node.classList?.contains('bug-fab') ?? false,
    });
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

export function BugReportFab({ currentModuleLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);

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

// Each feedback type gets its own structured shape — bugs care
// about reproduction + severity, features want a user-story shape,
// suggestions are about the delta from current behavior.
type FridaySpec =
  | {
      kind: 'bug';
      title: string;
      steps: string[];
      expected: string;
      actual: string;
      severity: 'Low' | 'Medium' | 'High' | 'Critical';
    }
  | {
      kind: 'feature';
      title: string;
      userStory: string;
      acceptanceCriteria: string[];
      priority: 'Nice to have' | 'Important' | 'Critical';
    }
  | {
      kind: 'suggestion';
      title: string;
      currentBehavior: string;
      suggestedChange: string;
      whyItMatters: string;
    };

const REPHRASE_HELP: Record<FeedbackType, string> = {
  bug: 'Friday structures your report into Steps · Expected · Actual · Severity before filing.',
  feature: 'Friday structures your request into User story · Acceptance criteria · Priority.',
  suggestion: 'Friday structures your suggestion into Current behavior · Suggested change · Why it matters.',
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rephrasing, setRephrasing] = useState(false);
  const [spec, setSpec] = useState<FridaySpec | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const rephrase = () => {
    if (!description.trim()) return;
    setRephrasing(true);
    setSpec(null);
    setTimeout(() => {
      setSpec(fakeRephrase(type, description, title, currentModuleLabel));
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
      // Severity only applies to bugs. Feature/suggestion specs use
      // priority / no-severity respectively — backend stores severity=null.
      if (spec && spec.kind === 'bug') payload.severity = spec.severity.toLowerCase();

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
          {/* Type tabs — clear the AI spec on switch since each type
              produces a structurally different output (steps vs. user
              story vs. before/after). */}
          <div role="tablist" aria-label="Feedback type" className="fad-feedback-tabs">
            {(['bug', 'feature', 'suggestion'] as FeedbackType[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={type === t}
                onClick={() => {
                  if (t === type) return;
                  setType(t);
                  setSpec(null);
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
          {/* Rephrase is available for all three types — the structured
              shape adapts (bug → steps/expected/actual/severity, feature
              → user story/AC/priority, suggestion → before/after/why). */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn ghost sm"
              onClick={rephrase}
              disabled={!description.trim() || rephrasing}
              style={{ opacity: !description.trim() || rephrasing ? 0.5 : 1 }}
            >
              <IconAI size={12} /> {rephrasing ? 'Rephrasing…' : 'Rephrase with Friday'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {REPHRASE_HELP[type]}
            </span>
          </div>
          {spec && <FridaySpecCard spec={spec} />}
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
            {submitting ? 'Submitting…' : spec ? `${meta.submitButton} with spec` : meta.submitButton}
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
      {spec.kind === 'bug' && (
        <>
          <div className="bug-spec-field">
            <b>Steps to reproduce:</b>
            <ol style={{ margin: '4px 0 0 18px', padding: 0 }}>
              {spec.steps.map((s, i) => (
                <li key={i} style={{ marginBottom: 2 }}>{s}</li>
              ))}
            </ol>
          </div>
          <div className="bug-spec-field"><b>Expected:</b> {spec.expected}</div>
          <div className="bug-spec-field"><b>Actual:</b> {spec.actual}</div>
          <div className="bug-spec-field">
            <b>Severity:</b>{' '}
            <span
              className={'chip ' + (spec.severity === 'Critical' || spec.severity === 'High' ? 'warn' : 'info')}
            >
              {spec.severity}
            </span>
          </div>
        </>
      )}
      {spec.kind === 'feature' && (
        <>
          <div className="bug-spec-field"><b>User story:</b> {spec.userStory}</div>
          <div className="bug-spec-field">
            <b>Acceptance criteria:</b>
            <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
              {spec.acceptanceCriteria.map((s, i) => (
                <li key={i} style={{ marginBottom: 2 }}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="bug-spec-field">
            <b>Priority:</b>{' '}
            <span className={'chip ' + (spec.priority === 'Critical' ? 'warn' : 'info')}>
              {spec.priority}
            </span>
          </div>
        </>
      )}
      {spec.kind === 'suggestion' && (
        <>
          <div className="bug-spec-field"><b>Current behavior:</b> {spec.currentBehavior}</div>
          <div className="bug-spec-field"><b>Suggested change:</b> {spec.suggestedChange}</div>
          <div className="bug-spec-field"><b>Why it matters:</b> {spec.whyItMatters}</div>
        </>
      )}
    </div>
  );
}

// Local heuristic — matches the original bug rephraser's style. When
// the real Friday API is wired up the prompt will produce richer
// output; this keeps the UX feeling responsive without a network call.
function fakeRephrase(
  type: FeedbackType,
  description: string,
  title: string,
  scope?: string,
): FridaySpec {
  const sentences = description
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const derivedTitle = (() => {
    const t = title?.trim();
    if (t) return scope ? `[${scope}] ${t}` : t;
    const fallback =
      type === 'bug' ? 'Unexpected behavior'
        : type === 'feature' ? 'New capability requested'
          : 'Improvement to existing flow';
    return scope ? `[${scope}] ${fallback}` : fallback;
  })();

  if (type === 'bug') {
    const inferSeverity = (): 'Low' | 'Medium' | 'High' | 'Critical' => {
      if (/(crash|broken|lost data|can't|cannot|fails|error)/i.test(description)) return 'High';
      if (/(wrong|slow|unclear|missing)/i.test(description)) return 'Medium';
      return 'Low';
    };
    const steps = sentences.slice(0, 3).map((s, i) => i === 0 ? `Open ${scope || 'the affected view'}` : s);
    while (steps.length < 3) steps.push('Observe the behavior');
    const expected = /(should|expected|wanted)/i.test(description)
      ? sentences.find((s) => /(should|expected|wanted)/i.test(s)) || 'Feature should work as documented'
      : 'The action should complete without error, matching documented behavior.';
    const actual = /(but|instead|however|actually)/i.test(description)
      ? sentences.find((s) => /(but|instead|however|actually)/i.test(s)) || description.slice(0, 100)
      : description.slice(0, 100);
    return { kind: 'bug', title: derivedTitle, steps, expected, actual, severity: inferSeverity() };
  }

  if (type === 'feature') {
    const inferPriority = (): 'Nice to have' | 'Important' | 'Critical' => {
      if (/(blocker|must|critical|can't ship)/i.test(description)) return 'Critical';
      if (/(needed|important|should|painful)/i.test(description)) return 'Important';
      return 'Nice to have';
    };
    // Try to extract "as a X, I want Y, so that Z" if user wrote one;
    // otherwise scaffold from scope + first sentence.
    const userStoryMatch = description.match(/as an? [^,.\n]+,? i (?:want|need)[^.\n]+(?:so that[^.\n]+)?/i);
    const userStory = userStoryMatch?.[0]
      ?? `As a Friday team member, I want ${(sentences[0] || description).slice(0, 140)}${scope ? `, while working in ${scope}` : ''}.`;
    const acRest = sentences.slice(1).filter((s) => s.length > 5);
    const acceptanceCriteria = acRest.length
      ? acRest.slice(0, 4)
      : [
          'The new capability is reachable from the current view.',
          'It works on desktop and mobile breakpoints.',
          'Existing flows continue to work unchanged.',
        ];
    return { kind: 'feature', title: derivedTitle, userStory, acceptanceCriteria, priority: inferPriority() };
  }

  // suggestion
  const cleaned = description.trim();
  // Heuristic split: "X but / instead / should be Y" → before/after.
  const splitMatch = cleaned.match(/^(.{8,}?)\s+(?:but|instead|should be|could be|rather than)\s+(.+)$/i);
  const currentBehavior = splitMatch?.[1]?.trim()
    ?? (sentences[0] || cleaned.slice(0, 140));
  const suggestedChange = splitMatch?.[2]?.trim()
    ?? (sentences[1] || cleaned.slice(0, 140));
  const whyItMatters = sentences.find((s) => /(because|so that|helps|saves|easier|faster|clearer)/i.test(s))
    ?? 'Reduces friction in a common flow.';
  return { kind: 'suggestion', title: derivedTitle, currentBehavior, suggestedChange, whyItMatters };
}
