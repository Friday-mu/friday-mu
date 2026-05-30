'use client';

// Portal v2 slice 2 — operator panel for a website booking_request
// thread. Mounted inside the inbox thread detail (above the message
// body) when the selected thread has a fad_portal_booking_requests
// row. Lazy-loads via useBookingRequest; renders nothing for non-
// booking-request threads.
//
// Actions:
//   - Awaiting proof → resend/remind, upload proof received elsewhere,
//                      mark proof received / verifying funds, decline.
//   - Proof received → bank verification, then mark funds received
//                      (paid_amount, optional reservation_id) or queue
//                      an explicit Guesty reservation create.
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
  markProofReceived,
  uploadProofReceivedElsewhere,
  markFundsReceived,
  queueGuestyReservationCreate,
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
  onReminderDraft?: () => void;
}

export function BookingRequestPanel({ threadId, onReminderDraft }: Props) {
  const { record, loading, error, refetch } = useBookingRequest(threadId);
  if (!threadId) return null;
  if (loading && !record) return null; // silent until first load
  if (!record) return null; // not a booking_request thread
  return <PanelInner record={record} onChanged={refetch} loadError={error} onReminderDraft={onReminderDraft} />;
}

function PanelInner({
  record,
  onChanged,
  loadError,
  onReminderDraft,
}: {
  record: BookingRequestRecord;
  onChanged: () => void;
  loadError: string | null;
  onReminderDraft?: () => void;
}) {
  const [pane, setPane] = useState<'idle' | 'terms' | 'proof' | 'received' | 'decline'>('idle');
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

      {/* Current payment summary */}
      {(status === 'awaiting_payment' || status === 'proof_received' || status === 'confirmed') && (
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

      {(record.proof_received_at || record.proof_viewer_url || record.proof_url || record.proof_file_name) && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--color-background-primary)', borderRadius: 4, fontSize: 11, display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <strong>Proof received · verify bank funds</strong>
            {record.proof_received_at && <span>{new Date(record.proof_received_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
            {record.proof_source && <span className="chip sm">{record.proof_source}</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, color: 'var(--color-text-secondary)' }}>
            {record.proof_file_name && <span>{record.proof_file_name}</span>}
            {record.proof_file_size != null && <span>{Math.round(record.proof_file_size / 1024).toLocaleString()} KB</span>}
            {(record.proof_viewer_url || record.proof_url) && (
              <a href={record.proof_viewer_url || record.proof_url || '#'} target="_blank" rel="noreferrer">
                Open proof
              </a>
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
        {(status === 'pending_review' || status === 'awaiting_payment') && pane === 'idle' && (
          <>
            <button className="btn primary sm" onClick={() => setPane('proof')}>Upload proof received elsewhere</button>
            {onReminderDraft && (
              <button className="btn secondary sm" onClick={onReminderDraft}>Draft proof reminder</button>
            )}
            <button
              className="btn secondary sm"
              onClick={async () => {
                try {
                  await markProofReceived(record.thread_id);
                  fireToast('Proof marked received · verify bank funds');
                  onChanged();
                } catch (e) {
                  fireToast((e as Error)?.message || 'Mark proof failed');
                }
              }}
            >
              Mark proof received
            </button>
            <button className="btn ghost sm" onClick={() => setPane('terms')}>Edit payment tracking</button>
            <button className="btn sm" onClick={() => setPane('decline')} style={{ color: 'var(--color-text-danger)' }}>Decline</button>
          </>
        )}
        {status === 'proof_received' && pane === 'idle' && (
          <>
            <button className="btn primary sm" onClick={() => setPane('received')}>Funds visible in bank</button>
            <button
              className="btn secondary sm"
              onClick={async () => {
                try {
                  await queueGuestyReservationCreate(record.thread_id);
                  fireToast('Guesty reservation create queued');
                  onChanged();
                } catch (e) {
                  fireToast((e as Error)?.message || 'Guesty queue failed');
                }
              }}
              title="Explicit staff action only. Proof upload alone never creates a reservation."
            >
              Create Guesty reservation
            </button>
            <button className="btn ghost sm" onClick={() => setPane('terms')}>Edit terms</button>
            <button className="btn ghost sm" onClick={() => setPane('proof')}>Replace proof</button>
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
      {pane === 'proof' && (
        <ProofUploadForm
          onCancel={() => setPane('idle')}
          onSubmit={async (values) => {
            try {
              await uploadProofReceivedElsewhere(record.thread_id, values);
              fireToast('Proof attached · verify bank funds');
              setPane('idle');
              onChanged();
            } catch (e) {
              fireToast((e as Error)?.message || 'Proof attach failed');
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
  if (status === 'awaiting_payment' || status === 'proof_received') return 'warn';
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
        Verification deadline / reminder timestamp
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
          {busy ? 'Saving…' : 'Save payment tracking'}
        </button>
      </div>
    </div>
  );
}

function ProofUploadForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (values: { proofUrl?: string; proofViewerUrl?: string; fileName?: string; fileType?: string; fileSize?: number; notes?: string }) => Promise<void>;
}) {
  const [proofUrl, setProofUrl] = useState('');
  const [viewerUrl, setViewerUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ marginTop: 10, padding: 10, border: '0.5px solid var(--color-border-tertiary)', borderRadius: 4, background: 'var(--color-background-primary)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Proof URL
          <input
            type="url"
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
            placeholder="Bank app / email / storage URL"
            disabled={busy}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Viewer URL
          <input
            type="url"
            value={viewerUrl}
            onChange={(e) => setViewerUrl(e.target.value)}
            placeholder="Signed viewer URL if available"
            disabled={busy}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          File name
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} disabled={busy} style={inputStyle} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          File type
          <input value={fileType} onChange={(e) => setFileType(e.target.value)} placeholder="image/png, application/pdf" disabled={busy} style={inputStyle} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          File size bytes
          <input type="number" min={0} value={fileSize} onChange={(e) => setFileSize(e.target.value)} disabled={busy} style={inputStyle} />
        </label>
      </div>
      <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block' }}>
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Where the proof came from. Do not mark funds received until bank funds are visible."
          disabled={busy}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn ghost sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          className="btn primary sm"
          disabled={busy || !(proofUrl.trim() || viewerUrl.trim() || fileName.trim() || notes.trim())}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              proofUrl: proofUrl.trim() || undefined,
              proofViewerUrl: viewerUrl.trim() || proofUrl.trim() || undefined,
              fileName: fileName.trim() || undefined,
              fileType: fileType.trim() || undefined,
              fileSize: fileSize ? Number(fileSize) : undefined,
              notes: notes.trim() || undefined,
            });
            setBusy(false);
          }}
        >
          {busy ? 'Saving…' : 'Attach proof · verify funds'}
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
        Only use this after the money is visible in the bank. If reservation UUID is set, the guest&apos;s portal will switch from booking-request mode to full reservation mode at the same URL on the next refresh.
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
          {busy ? 'Saving…' : 'Funds received · confirm'}
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
