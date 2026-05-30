'use client';

// DraftPanel — the marquee surface for the FAD inbox.
//
// Pinned above the compose box when the active conversation has a
// draft in state {draft_ready, under_review, send_queued, send_failed}.
// Ports the workflow from the OLD GMS UI's DraftPanel — confidence pill,
// body preview, action row (Approve / Revise / Edit / Reject / Ask Friday).
//
// Side effects (API calls, 5s undo, SendConfirmModal) live in the parent
// (InboxModule). This component is a controlled view + intent emitter:
// it raises callbacks the parent wires to draftsClient + state machine.
// The parent also drives `revising` (poll/wait state) and `error`
// (last action error to surface inline).

import { useEffect, useRef, useState } from 'react';
import type { InboxDraft } from '../../../_data/fixtures';
import { confidenceTier } from '../../../_data/draftsClient';
import {
  IconSparkle,
  IconCheck,
  IconClose,
  IconRefresh,
  IconSend,
} from '../../icons';

export interface DraftPanelProps {
  draft: InboxDraft;
  /** Parent-owned async state — disables actions while busy. */
  busy?: boolean;
  /** Set while a revise request is in flight and we're waiting for the
   *  next draft. Renders the "Friday is revising…" spinner state. */
  revising?: boolean;
  /** Last action error (approval / revision / rejection). Surfaced inline. */
  error?: string | null;

  onApprove: (opts: { draftBody?: string; learnMode?: 'learn' }) => void;
  onRevise: (instruction: string, mode: 'standard' | 'teach') => void;
  onReject: (reason?: string) => void;
  onOpenConsult: () => void;

  /** A rewrite suggestion produced by Friday Consult's [DRAFT_UPDATE]
   *  protocol. When set, the panel switches into edit mode pre-filled
   *  with this body. The parent should call `onPendingRewriteConsumed`
   *  immediately after passing it so we don't re-enter edit on every
   *  re-render. */
  pendingRewrite?: string | null;
  onPendingRewriteConsumed?: () => void;
}

type Mode = 'view' | 'edit' | 'revise' | 'reject';

export function DraftPanel({
  draft,
  busy = false,
  revising = false,
  error,
  onApprove,
  onRevise,
  onReject,
  onOpenConsult,
  pendingRewrite,
  onPendingRewriteConsumed,
}: DraftPanelProps) {
  const [mode, setMode] = useState<Mode>('view');
  const [editBody, setEditBody] = useState(draft.body);
  const [reviseInstruction, setReviseInstruction] = useState('');
  const [reviseMode, setReviseMode] = useState<'standard' | 'teach'>('standard');
  const [rejectReason, setRejectReason] = useState('');
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const reviseRef = useRef<HTMLInputElement | null>(null);

  // Reset internal state when the draft swaps (e.g., after a revise
  // landed a new draft id). Keep the user's input around within a single
  // draft session — but a different draft.id means it's a fresh review.
  useEffect(() => {
    setMode('view');
    setEditBody(draft.body);
    setReviseInstruction('');
    setRejectReason('');
  }, [draft.id]);

  // Focus the active editor when entering a sub-mode.
  useEffect(() => {
    if (mode === 'edit') editRef.current?.focus();
    if (mode === 'revise') reviseRef.current?.focus();
  }, [mode]);

  // Friday Consult emitted a draft rewrite — switch into edit mode with
  // the rewritten body pre-filled, then notify parent so it doesn't
  // re-fire on every render.
  useEffect(() => {
    if (pendingRewrite && pendingRewrite.length > 0) {
      setEditBody(pendingRewrite);
      setMode('edit');
      onPendingRewriteConsumed?.();
    }
  }, [pendingRewrite, onPendingRewriteConsumed]);

  const tier = confidenceTier(draft.confidence);
  const confLabel = typeof draft.confidence === 'number'
    ? `${Math.round(draft.confidence * 100)}%`
    : '—';
  const confColor: Record<'high' | 'mid' | 'low', string> = {
    high: 'var(--color-text-success)',
    mid: 'var(--color-text-warning)',
    low: 'var(--color-text-danger)',
  };

  const hasTranslation = draft.bodyTranslated && draft.bodyTranslated !== draft.body;

  // ─── Revising spinner (mid-revise wait state) ───
  if (revising) {
    return (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4 }}>
          <SpinnerDot />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Friday is revising the draft…
          </span>
        </div>
      </Card>
    );
  }

  // ─── Header (always rendered) ───
  const header = (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
        }}>
          AI Draft
        </span>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 'var(--radius-sm)',
          background: confColor[tier],
          color: '#fff',
        }}>
          {confLabel}
        </span>
        {typeof draft.revisionNumber === 'number' && draft.revisionNumber > 1 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            rev {draft.revisionNumber}
          </span>
        )}
        {draft.state === 'send_failed' && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-danger)' }}>
            Send failed
          </span>
        )}
        {draft.state === 'send_queued' && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-warning)' }}>
            Queued
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpenConsult}
        title="Ask Friday about this draft"
        style={ghostBtn()}
      >
        <IconSparkle size={12} /> Ask Friday
      </button>
    </div>
  );

  // ─── Edit mode ───
  if (mode === 'edit') {
    return (
      <Card>
        {header}
        <textarea
          ref={editRef}
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          rows={8}
          style={{
            width: '100%',
            minHeight: 120,
            maxHeight: 360,
            padding: 10,
            fontSize: 13,
            fontFamily: 'inherit',
            color: 'var(--color-text-primary)',
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-sm)',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
          disabled={busy}
        />
        {error && <ErrorLine text={error} />}
        <ActionRow>
          <button
            type="button"
            disabled={busy || editBody.trim().length === 0}
            onClick={() => onApprove({ draftBody: editBody })}
            style={primaryBtn()}
          >
            <IconSend size={12} /> Approve &amp; send
          </button>
          <button type="button" onClick={() => { setMode('view'); setEditBody(draft.body); }} style={ghostBtn()}>
            <IconClose size={12} /> Cancel
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onOpenConsult} style={ghostBtn()}>
            <IconSparkle size={12} /> Ask Friday
          </button>
        </ActionRow>
      </Card>
    );
  }

  // ─── Revise mode ───
  if (mode === 'revise') {
    return (
      <Card>
        {header}
        <BodyPreview body={draft.body} translated={hasTranslation ? draft.bodyTranslated : undefined} />
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            ref={reviseRef}
            value={reviseInstruction}
            onChange={(e) => setReviseInstruction(e.target.value)}
            placeholder="Revision instruction — e.g., shorter, add check-in time, more formal…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && reviseInstruction.trim()) onRevise(reviseInstruction.trim(), reviseMode);
              if (e.key === 'Escape') { setMode('view'); setReviseInstruction(''); }
            }}
            style={inputStyle()}
            disabled={busy}
          />
        </div>
        {error && <ErrorLine text={error} />}
        <ActionRow>
          <button
            type="button"
            disabled={busy || reviseInstruction.trim().length === 0}
            onClick={() => onRevise(reviseInstruction.trim(), reviseMode)}
            style={primaryBtn()}
          >
            <IconRefresh size={12} /> Revise
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-secondary)' }}>
            <input
              type="checkbox"
              checked={reviseMode === 'teach'}
              onChange={(e) => setReviseMode(e.target.checked ? 'teach' : 'standard')}
              style={{ margin: 0 }}
            />
            Teach Friday (save as rule)
          </label>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => { setMode('view'); setReviseInstruction(''); }} style={ghostBtn()}>
            <IconClose size={12} /> Cancel
          </button>
        </ActionRow>
      </Card>
    );
  }

  // ─── Reject mode ───
  if (mode === 'reject') {
    return (
      <Card>
        {header}
        <BodyPreview body={draft.body} translated={hasTranslation ? draft.bodyTranslated : undefined} />
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Why is this draft wrong? (Friday learns from this — leave empty to dismiss silently.)"
          rows={2}
          style={{
            width: '100%',
            marginTop: 8,
            padding: 8,
            fontSize: 12,
            fontFamily: 'inherit',
            color: 'var(--color-text-primary)',
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-sm)',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
          disabled={busy}
        />
        {error && <ErrorLine text={error} />}
        <ActionRow>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReject(rejectReason.trim() || undefined)}
            style={primaryBtn('danger')}
          >
            <IconClose size={12} /> {rejectReason.trim() ? 'Reject with feedback' : 'Dismiss'}
          </button>
          <button type="button" onClick={() => { setMode('view'); setRejectReason(''); }} style={ghostBtn()}>
            Cancel
          </button>
        </ActionRow>
      </Card>
    );
  }

  // ─── Default view ───
  return (
    <Card>
      {header}
      <BodyPreview body={draft.body} translated={hasTranslation ? draft.bodyTranslated : undefined} />
      {error && <ErrorLine text={error} />}
      <ActionRow>
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove({})}
          style={primaryBtn()}
        >
          <IconCheck size={12} /> Approve &amp; send
        </button>
        <button type="button" disabled={busy} onClick={() => setMode('revise')} style={ghostBtn()}>
          <IconRefresh size={12} /> Revise
        </button>
        <button type="button" disabled={busy} onClick={() => setMode('edit')} style={ghostBtn()}>
          Edit
        </button>
      </ActionRow>
    </Card>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: 12,
      marginBottom: 8,
      background: 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.06))',
      border: '0.5px solid var(--color-border-accent, rgba(56, 132, 255, 0.25))',
      borderRadius: 'var(--radius-md)',
    }}>
      {children}
    </div>
  );
}

function BodyPreview({ body, translated }: { body: string; translated?: string }) {
  return (
    <div style={{
      maxHeight: '22vh',
      overflowY: 'auto',
      padding: 10,
      fontSize: 13,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
      color: 'var(--color-text-primary)',
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-tertiary)',
      borderRadius: 'var(--radius-sm)',
    }}>
      {body}
      {translated && (
        <>
          <hr style={{ border: 0, borderTop: '0.5px dashed var(--color-border-tertiary)', margin: '8px 0' }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
            Will be sent in guest&apos;s language:
          </div>
          {translated}
        </>
      )}
    </div>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
    }}>
      {children}
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div style={{
      marginTop: 8,
      padding: '6px 8px',
      fontSize: 12,
      color: 'var(--color-text-danger)',
      background: 'var(--color-background-danger-soft, rgba(220, 38, 38, 0.08))',
      border: '0.5px solid var(--color-border-danger, rgba(220, 38, 38, 0.3))',
      borderRadius: 'var(--radius-sm)',
    }}>
      {text}
    </div>
  );
}

function SpinnerDot() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        border: '1.5px solid var(--color-border-secondary)',
        borderTopColor: 'var(--color-brand-accent)',
        animation: 'friday-spin 0.9s linear infinite',
      }}
    />
  );
}

// ─── Style helpers ─────────────────────────────────────────────────────

function primaryBtn(variant: 'default' | 'danger' = 'default'): React.CSSProperties {
  const bg = variant === 'danger' ? 'var(--color-text-danger)' : 'var(--color-brand-accent)';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    background: bg,
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  };
}

function ghostBtn(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 8px',
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    background: 'transparent',
    border: '0.5px solid var(--color-border-secondary)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  };
}

function inputStyle(): React.CSSProperties {
  return {
    flex: 1,
    padding: '7px 10px',
    fontSize: 12,
    color: 'var(--color-text-primary)',
    background: 'var(--color-background-primary)',
    border: '0.5px solid var(--color-border-secondary)',
    borderRadius: 'var(--radius-sm)',
  };
}
