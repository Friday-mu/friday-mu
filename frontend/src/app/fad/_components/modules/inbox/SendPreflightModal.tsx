'use client';

// Send preflight modal — final review surface before a message goes to
// the guest. Renders when the operator clicks Approve & Send from
// FridayConsult's embedded DraftCard. Confirm in modal → InboxModule
// kicks off the existing 5-second undo banner → send fires.
//
// What it shows:
//   - Channel selector (radio list of availableChannels; defaults to
//     recommended). Required choice when the recommended channel isn't
//     the inbound channel (e.g., WhatsApp window closed, fall back to
//     email). Operator can override.
//   - Body preview (the working draft, read-only). For non-English
//     guests, GMS translates at send-time; for v1 we show only the
//     English body — translated preview is a Phase 2.1 enhancement
//     once the consult endpoint exposes pre-send translations.
//   - Confidence pill (if Friday authored the draft).
//   - Pending teachings count + "Review in chat" link (closes modal,
//     parent scrolls FridayConsult to the teach card). For v1 we don't
//     re-render the full TeachingCard UI inside the modal — operator
//     reviews in chat first then sends.
//
// Why a modal not inline: the existing inline 5s undo banner answers
// "did I just typo?" but not "am I sending via the right channel?" or
// "did I commit the teachables this session produced?". The modal is
// the preflight check; the undo is the typo safety. Different concerns.

import { useEffect, useState } from 'react';
import type { InboxDraft } from '../../../_data/fixtures';
import { confidenceTier } from '../../../_data/draftsClient';
import { IconCheck, IconClose, IconSend, IconSparkle } from '../../icons';

export interface SendPreflightModalProps {
  /** The active GMS draft (if any) — drives the confidence pill +
   *  the "AI draft" vs "manual reply" header. */
  currentDraft: InboxDraft | null;
  /** Confidence from the most recent consult turn — supersedes
   *  currentDraft.confidence when present. */
  liveConfidence: number | null;
  /** The body that will be sent. Operator already had a chance to
   *  edit it in the DraftCard. Modal renders it read-only. */
  bodyToSend: string;
  /** Translated body to surface alongside the English (if backend
   *  has surfaced one). For v1, usually undefined. */
  bodyTranslated?: string;
  /** Guest's recipient label for the header — "Lisa Chen on WhatsApp"
   *  feels more concrete than "Send a message". */
  recipientLabel: string;
  /** Channel options pulled from the conversation detail bundle's
   *  available_channels. If empty, defaults to a single channel
   *  picker showing the recommended option only. */
  availableChannels: string[];
  /** Channel pre-selected when the modal opens — GMS's recommended
   *  pick (usually mirrors the inbound channel unless WA window
   *  expired). */
  defaultChannel: string;
  /** Count of teaching proposals in the current consult session that
   *  haven't been confirmed/dismissed yet. Modal shows a banner
   *  prompting review before send. */
  pendingTeachingCount?: number;
  /** WhatsApp 24-hour window state — surfaced as a warning chip when
   *  channel is WhatsApp + window is closed. */
  whatsappWindow?: { open: boolean; expiresInMinutes?: number; expiresAt?: string };
  /** Operator clicked Send. Modal closes; parent starts the 5s undo. */
  onConfirm: (opts: { channel: string }) => void;
  /** Operator clicked Cancel or dismissed. Modal closes, no send. */
  onCancel: () => void;
  /** Operator clicked "Review in chat" — close modal, focus chat. */
  onReviewTeachings?: () => void;
}

export function SendPreflightModal({
  currentDraft,
  liveConfidence,
  bodyToSend,
  bodyTranslated,
  recipientLabel,
  availableChannels,
  defaultChannel,
  pendingTeachingCount = 0,
  whatsappWindow,
  onConfirm,
  onCancel,
  onReviewTeachings,
}: SendPreflightModalProps) {
  const [channel, setChannel] = useState<string>(defaultChannel);
  const [whatsappState, setWhatsappState] = useState<{ open: boolean; minutes: number }>({
    open: !!whatsappWindow?.open,
    minutes: whatsappWindow?.expiresInMinutes ?? 0,
  });

  useEffect(() => {
    const update = () => {
      if (!whatsappWindow) return;
      if (!whatsappWindow.open) {
        setWhatsappState({ open: false, minutes: 0 });
        return;
      }
      if (!whatsappWindow.expiresAt) {
        setWhatsappState({ open: true, minutes: whatsappWindow.expiresInMinutes ?? 0 });
        return;
      }
      const minutes = Math.max(0, Math.round((new Date(whatsappWindow.expiresAt).getTime() - Date.now()) / 60_000));
      setWhatsappState({ open: minutes > 0, minutes });
    };
    update();
    const interval = globalThis.setInterval(update, 30_000);
    return () => globalThis.clearInterval(interval);
  }, [whatsappWindow?.expiresAt, whatsappWindow?.expiresInMinutes, whatsappWindow?.open]);

  const effectiveConfidence: number | null =
    typeof liveConfidence === 'number'
      ? liveConfidence
      : typeof currentDraft?.confidence === 'number'
        ? currentDraft.confidence
        : null;

  const tier = confidenceTier(effectiveConfidence ?? undefined);
  const confColor: Record<'high' | 'mid' | 'low', string> = {
    high: 'var(--color-text-success)',
    mid: 'var(--color-text-warning)',
    low: 'var(--color-text-danger)',
  };

  const isWaChannel = channel === 'whatsapp';
  const waWindowClosed = isWaChannel && whatsappWindow && !whatsappState.open;
  const canConfirm = bodyToSend.trim().length > 0 && !waWindowClosed;

  // Channels to render — backend list if available; otherwise just the
  // default (gives a single-radio degenerate case).
  const channelOptions = availableChannels.length > 0
    ? Array.from(new Set([defaultChannel, ...availableChannels]))
    : [defaultChannel];

  return (
    <div
      className="fad-modal-overlay"
      style={{ zIndex: 10000, padding: 16 }}
      onClick={onCancel}
    >
      <div
        className="fad-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 560,
          width: '100%',
          background: 'var(--color-background-primary)',
          borderRadius: 'var(--radius-lg)',
          border: '0.5px solid var(--color-border-secondary)',
          boxShadow: '0 24px 64px rgba(15, 24, 54, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <IconSend size={14} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Send to {recipientLabel}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              {currentDraft ? 'AI draft — review before sending' : 'Manual reply — review before sending'}
            </div>
          </div>
          {effectiveConfidence !== null && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                background: confColor[tier],
                color: '#fff',
              }}
              title="Friday's confidence in this draft"
            >
              {Math.round(effectiveConfidence * 100)}%
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              padding: 4,
            }}
            title="Cancel (Esc)"
            aria-label="Cancel"
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '14px 18px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Channel selector */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: 'var(--color-text-tertiary)',
                marginBottom: 6,
              }}
            >
              Send via
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {channelOptions.map((c) => {
                const selected = c === channel;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: selected ? 600 : 400,
                      color: selected ? '#fff' : 'var(--color-text-primary)',
                      background: selected ? 'var(--color-brand-accent)' : 'var(--color-background-secondary)',
                      border: `0.5px solid ${selected ? 'var(--color-brand-accent)' : 'var(--color-border-tertiary)'}`,
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            {waWindowClosed && (
              <div
                style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  fontSize: 11,
                  color: 'var(--color-text-danger)',
                  background: 'var(--color-background-danger-soft, rgba(220, 38, 38, 0.08))',
                  border: '0.5px solid var(--color-border-danger, rgba(220, 38, 38, 0.3))',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                ⚠ WhatsApp 24-hour reply window is closed — message will only deliver via template.
                Consider switching channel.
              </div>
            )}
          </div>

          {/* Body preview */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: 'var(--color-text-tertiary)',
                marginBottom: 6,
              }}
            >
              Message
            </div>
            <div
              style={{
                padding: 12,
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                color: 'var(--color-text-primary)',
                background: 'var(--color-background-secondary)',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--radius-sm)',
                maxHeight: '30vh',
                overflowY: 'auto',
              }}
            >
              {bodyToSend}
            </div>
            {bodyTranslated && bodyTranslated !== bodyToSend && (
              <>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-tertiary)',
                    marginTop: 8,
                    marginBottom: 4,
                  }}
                >
                  Will be sent in guest&apos;s language:
                </div>
                <div
                  style={{
                    padding: 12,
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    color: 'var(--color-text-primary)',
                    background: 'var(--color-background-secondary)',
                    border: '0.5px dashed var(--color-border-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    maxHeight: '20vh',
                    overflowY: 'auto',
                  }}
                >
                  {bodyTranslated}
                </div>
              </>
            )}
          </div>

          {/* Pending teachings indicator */}
          {pendingTeachingCount > 0 && (
            <div
              style={{
                padding: '10px 12px',
                background: 'var(--color-background-accent-soft, rgba(56, 132, 255, 0.06))',
                border: '0.5px solid var(--color-border-accent, rgba(56, 132, 255, 0.3))',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <IconSparkle size={14} />
              <div style={{ flex: 1, fontSize: 12 }}>
                <strong>{pendingTeachingCount}</strong>{' '}
                pending {pendingTeachingCount === 1 ? 'teachable moment' : 'teachable moments'} from this session
                {' — '}commit before sending so Friday remembers for future drafts.
              </div>
              {onReviewTeachings && (
                <button
                  type="button"
                  onClick={onReviewTeachings}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-brand-accent)',
                    background: 'transparent',
                    border: '0.5px solid var(--color-brand-accent)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}
                >
                  Review in chat
                </button>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            background: 'var(--color-background-secondary)',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { if (canConfirm) onConfirm({ channel }); }}
            disabled={!canConfirm}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: 'var(--color-brand-accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.5,
            }}
          >
            <IconCheck size={12} /> {waWindowClosed ? 'Template required' : 'Confirm & send'}
          </button>
        </div>
      </div>
    </div>
  );
}
