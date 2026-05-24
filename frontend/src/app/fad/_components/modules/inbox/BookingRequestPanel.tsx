'use client';

// Portal v2 slice 2 — operator panel for a website booking_request
// thread. Mounted inside the inbox thread detail (above the message
// body) when the selected thread has a fad_portal_booking_requests
// row. Lazy-loads via useBookingRequest; renders nothing for non-
// booking-request threads.
//
// Actions:
//   - Pending review → "Set payment terms" (choice / currency / deadline)
//                      → flips to awaiting_payment
//                      OR "Decline" → flips to declined
//   - Awaiting payment → "Mark funds received" (paid_amount, optional
//                        reservation_id) → flips to confirmed
//                        OR "Edit terms" / "Decline" / "Back to review"
//   - Confirmed → read-only summary, "Back to review" escape hatch
//   - Declined → read-only summary, "Back to review" escape hatch
//
// Every mutation refetches the record so the panel state stays
// authoritative; the website portal sees the new state on its next
// resolve call.

import { useState } from 'react';
import {
  useBookingRequest,
  setPaymentTerms,
  markFundsReceived,
  declineBookingRequest,
  resetBookingRequestToReview,
  STATUS_LABEL,
  formatBookingMoney,
  type BookingRequestRecord,
  type PaymentChoice,
  type PaymentCurrency,
} from '../../../_data/bookingRequestClient';
import { fireToast } from '../../Toaster';

interface Props {
  threadId: string | null | undefined;
}

export function BookingRequestPanel({ threadId }: Props) {
  const { record, loading, error, refetch } = useBookingRequest(threadId);
  if (!threadId) return null;
  if (loading && !record) return null; // silent until first load
  if (!record) return null; // not a booking_request thread
  return <PanelInner record={record} onChanged={refetch} loadError={error} />;
}

function PanelInner({
  record,
  onChanged,
  loadError,
}: {
  record: BookingRequestRecord;
  onChanged: () => void;
  loadError: string | null;
}) {
  const [pane, setPane] = useState<'idle' | 'terms' | 'received' | 'decline'>('idle');
  const status = record.status;
  const isTerminal = status === 'confirmed' || status === 'declined';

  const partyText = (() => {
    const a = record.party_adults || 0;
    const c = record.party_children || 0;
    const i = record.party_infants || 0;
    if (!a && !c && !i) return null;
    const parts = [];
    if (a) parts.push(`${a} adult${a !== 1 ? 's' : ''}`);
    if (c) parts.push(`${c} child${c !== 1 ? 'ren' : ''}`);
    if (i) parts.push(`${i} infant${i !== 1 ? 's' : ''}`);
    return parts.join(', ');
  })();

  return (
    <div
      style={{
        margin: '8px 16px 0',
        padding: 12,
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-background-secondary)',
        fontSize: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <strong style={{ fontSize: 12 }}>Booking request</strong>
          <span className={'chip sm ' + statusToneClass(status)}>{STATUS_LABEL[status]}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {record.request_id}
          </span>
        </div>
        {record.converted_to_reservation_id && (
          <span className="chip sm info" title="Linked to fad_reservations row — portal resolves in reservation mode">
            Reservation linked
          </span>
        )}
      </div>

      {/* Trip summary */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, color: 'var(--color-text-secondary)' }}>
        {record.listing_title && (
          <span><strong>{record.listing_title}</strong>{record.listing_slug ? ` · ${record.listing_slug}` : ''}</span>
        )}
        {record.check_in && record.check_out && (
          <span>{record.check_in} → {record.check_out}{record.nights ? ` · ${record.nights}n` : ''}</span>
        )}
        {partyText && <span>{partyText}</span>}
        {record.quoted_total_amount_minor != null && (
          <span>
            Quoted: <strong>{formatBookingMoney(record.quoted_total_amount_minor, record.quoted_total_currency)}</strong>
          </span>
        )}
      </div>

      {/* Current terms summary (awaiting_payment + later) */}
      {(status === 'awaiting_payment' || status === 'confirmed') && (
        <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--color-background-primary)', borderRadius: 4, fontSize: 11 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {record.payment_choice && (
              <span>Terms: <strong>{record.payment_choice === 'deposit_50' ? '50% deposit' : 'Full payment'}</strong> · {record.payment_currency || '—'}</span>
            )}
            {record.confirmation_deadline && (
              <span>Deadline: {new Date(record.confirmation_deadline).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            )}
            {record.paid_amount_minor != null && (
              <span>Received: <strong>{formatBookingMoney(record.paid_amount_minor, record.payment_currency)}</strong></span>
            )}
          </div>
        </div>
      )}

      {/* Declined summary */}
      {status === 'declined' && record.declined_reason && (
        <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--color-background-primary)', borderRadius: 4, fontSize: 11, fontStyle: 'italic' }}>
          Declined · {record.declined_reason}
        </div>
      )}

      {loadError && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-danger)' }}>{loadError}</div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {status === 'pending_review' && pane === 'idle' && (
          <>
            <button className="btn primary sm" onClick={() => setPane('terms')}>Set payment terms</button>
            <button className="btn sm" onClick={() => setPane('decline')} style={{ color: 'var(--color-text-danger)' }}>Decline</button>
          </>
        )}
        {status === 'awaiting_payment' && pane === 'idle' && (
          <>
            <button className="btn primary sm" onClick={() => setPane('received')}>Mark funds received</button>
            <button className="btn ghost sm" onClick={() => setPane('terms')}>Edit terms</button>
            <button className="btn sm" onClick={() => setPane('decline')} style={{ color: 'var(--color-text-danger)' }}>Decline</button>
          </>
        )}
        {isTerminal && pane === 'idle' && (
          <button
            className="btn ghost sm"
            onClick={async () => {
              if (!confirm('Reset this booking request back to pending review? Existing reservation link (if any) is preserved.')) return;
              try {
                await resetBookingRequestToReview(record.thread_id);
                fireToast('Reset to pending review');
                onChanged();
              } catch (e) {
                fireToast((e as Error)?.message || 'Reset failed');
              }
            }}
          >
            Back to review
          </button>
        )}
      </div>

      {pane === 'terms' && (
        <PaymentTermsForm
          initial={{
            choice: record.payment_choice || 'deposit_50',
            currency: record.payment_currency || (record.quoted_total_currency || 'EUR'),
            deadline: record.confirmation_deadline,
          }}
          onCancel={() => setPane('idle')}
          onSubmit={async (values) => {
            try {
              await setPaymentTerms(record.thread_id, values);
              fireToast('Payment terms set · guest portal updated');
              setPane('idle');
              onChanged();
            } catch (e) {
              fireToast((e as Error)?.message || 'Save failed');
            }
          }}
        />
      )}
      {pane === 'received' && (
        <FundsReceivedForm
          suggestedAmount={suggestedAmount(record)}
          currency={record.payment_currency || record.quoted_total_currency || 'EUR'}
          onCancel={() => setPane('idle')}
          onSubmit={async (values) => {
            try {
              await markFundsReceived(record.thread_id, values);
              fireToast('Funds recorded · status confirmed');
              setPane('idle');
              onChanged();
            } catch (e) {
              fireToast((e as Error)?.message || 'Mark received failed');
            }
          }}
        />
      )}
      {pane === 'decline' && (
        <DeclineForm
          onCancel={() => setPane('idle')}
          onSubmit={async (reason) => {
            try {
              await declineBookingRequest(record.thread_id, reason);
              fireToast('Booking request declined');
              setPane('idle');
              onChanged();
            } catch (e) {
              fireToast((e as Error)?.message || 'Decline failed');
            }
          }}
        />
      )}
    </div>
  );
}

function suggestedAmount(record: BookingRequestRecord): number {
  if (!record.quoted_total_amount_minor) return 0;
  const total = record.quoted_total_amount_minor / 100;
  if (record.payment_choice === 'deposit_50') return Math.round(total * 50) / 100;
  return Math.round(total * 100) / 100;
}

function statusToneClass(status: BookingRequestRecord['status']): string {
  if (status === 'confirmed') return 'success';
  if (status === 'awaiting_payment') return 'warn';
  if (status === 'declined') return 'danger';
  return '';
}

function PaymentTermsForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: { choice: PaymentChoice; currency: PaymentCurrency; deadline: string | null };
  onCancel: () => void;
  onSubmit: (values: { paymentChoice: PaymentChoice; paymentCurrency: PaymentCurrency; confirmationDeadline?: string }) => Promise<void>;
}) {
  const [choice, setChoice] = useState<PaymentChoice>(initial.choice);
  const [currency, setCurrency] = useState<PaymentCurrency>(initial.currency);
  // Default deadline = 5 days from now (matches Friday's usual terms).
  const defaultDeadline = (() => {
    if (initial.deadline) return initial.deadline.slice(0, 16);
    const d = new Date(Date.now() + 5 * 86400000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  })();
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ marginTop: 10, padding: 10, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 4, background: 'var(--color-background-primary)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Payment choice
          <select value={choice} onChange={(e) => setChoice(e.target.value as PaymentChoice)} disabled={busy} style={inputStyle}>
            <option value="deposit_50">50% deposit</option>
            <option value="full">Full payment</option>
          </select>
        </label>
        <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value as PaymentCurrency)} disabled={busy} style={inputStyle}>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="MUR">MUR</option>
          </select>
        </label>
      </div>
      <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block' }}>
        Confirmation deadline (guest sees countdown)
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          disabled={busy}
          style={inputStyle}
        />
      </label>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn ghost sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          className="btn primary sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              paymentChoice: choice,
              paymentCurrency: currency,
              confirmationDeadline: deadline ? new Date(deadline).toISOString() : undefined,
            });
            setBusy(false);
          }}
        >
          {busy ? 'Saving…' : 'Set terms · notify guest'}
        </button>
      </div>
    </div>
  );
}

function FundsReceivedForm({
  suggestedAmount,
  currency,
  onCancel,
  onSubmit,
}: {
  suggestedAmount: number;
  currency: PaymentCurrency;
  onCancel: () => void;
  onSubmit: (values: { paidAmount: number; reservationId?: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState<number>(suggestedAmount);
  const [reservationId, setReservationId] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ marginTop: 10, padding: 10, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 4, background: 'var(--color-background-primary)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Amount received ({currency})
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value || '0'))}
            disabled={busy}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Reservation UUID (optional)
          <input
            type="text"
            value={reservationId}
            onChange={(e) => setReservationId(e.target.value)}
            placeholder="fad_reservations.id — triggers kind-switch"
            disabled={busy}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
        </label>
      </div>
      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '4px 0 0' }}>
        If reservation UUID is set, the guest&apos;s portal will switch from booking-request mode to full reservation mode at the same URL on the next refresh.
      </p>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn ghost sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          className="btn primary sm"
          disabled={busy || !amount || amount <= 0}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              paidAmount: amount,
              reservationId: reservationId.trim() || undefined,
            });
            setBusy(false);
          }}
        >
          {busy ? 'Saving…' : 'Mark received · confirm'}
        </button>
      </div>
    </div>
  );
}

function DeclineForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ marginTop: 10, padding: 10, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 4, background: 'var(--color-background-primary)' }}>
      <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        Reason (visible to guest)
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. dates unavailable; suggest alternative villa"
          disabled={busy}
          style={inputStyle}
        />
      </label>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn ghost sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          className="btn sm"
          disabled={busy}
          style={{ color: 'var(--color-text-danger)' }}
          onClick={async () => {
            setBusy(true);
            await onSubmit(reason.trim() || undefined);
            setBusy(false);
          }}
        >
          {busy ? 'Saving…' : 'Decline request'}
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '6px 8px',
  marginTop: 4,
  fontSize: 12,
  borderRadius: 4,
  border: '0.5px solid var(--color-border-tertiary)',
  background: 'var(--color-background-secondary)',
  color: 'var(--color-text-primary)',
};
