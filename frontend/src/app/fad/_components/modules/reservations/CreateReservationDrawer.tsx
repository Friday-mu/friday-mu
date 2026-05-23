'use client';

import { useMemo, useState } from 'react';
import {
  CHANNEL_LABEL,
  CLEANING_ARRANGEMENT_LABEL,
  SPECIAL_REQUEST_LABEL,
  formatMoney,
  type Reservation,
  type ReservationChannel,
  type CleaningArrangement,
  type SpecialRequestCategory,
} from '../../../_data/reservations';
import { createReservation } from '../../../_data/reservationsClient';
import { TASK_PROPERTIES } from '../../../_data/tasks';
import { fireToast } from '../../Toaster';
import { IconClose } from '../../icons';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (reservation: Reservation) => void;
}

type Step = 'draft' | 'confirm';

// Manual-create channels only; airbnb/booking/vrbo come via Guesty pull.
const MANUAL_CHANNELS: ReservationChannel[] = ['direct', 'email', 'owner'];

const DEFAULT_DRAFT = {
  channel: 'direct' as ReservationChannel,
  propertyCode: '',
  confirmationCode: '',
  guestName: '',
  adults: 2,
  children: 0,
  infants: 0,
  checkIn: '',
  checkOut: '',
  totalAmount: 0,
  currency: 'EUR' as Reservation['currency'],
  touristTax: 0,
  cleaningArrangement: 'friday_cleans' as CleaningArrangement,
  specialRequestCategories: [] as SpecialRequestCategory[],
  specialRequestNotes: '',
  notes: '',
  extensionOf: '',
};

function nights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function generateId(channel: ReservationChannel): string {
  const random = Math.random().toString(36).slice(2, 8);
  if (channel === 'owner') return `rsv-owner-${random}`;
  return `rsv-manual-${random}`;
}

function generateCode(channel: ReservationChannel): string {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  if (channel === 'owner') return `OWNER-${random}`;
  if (channel === 'direct') return `FR-DIR-${1000 + Math.floor(Math.random() * 999)}`;
  if (channel === 'email') return `FR-MAN-${1000 + Math.floor(Math.random() * 999)}`;
  return `MAN-${random}`;
}

export function CreateReservationDrawer({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>('draft');
  const [draft, setDraft] = useState(DEFAULT_DRAFT);

  const properties = useMemo(() => TASK_PROPERTIES.map((p) => p.code).sort(), []);
  const computedNights = nights(draft.checkIn, draft.checkOut);
  const isOwnerStay = draft.channel === 'owner';

  const validations = useMemo(() => {
    const errors: string[] = [];
    if (!draft.propertyCode) errors.push('Property required');
    if (!draft.guestName.trim()) errors.push('Guest name required');
    if (!draft.checkIn) errors.push('Check-in required');
    if (!draft.checkOut) errors.push('Check-out required');
    if (draft.checkIn && draft.checkOut && computedNights < 1) errors.push('Check-out must be after check-in');
    if (!isOwnerStay && draft.totalAmount <= 0) errors.push('Total amount required (guest stays)');
    if (draft.adults < 1) errors.push('At least 1 adult required');
    return errors;
  }, [draft, computedNights, isOwnerStay]);

  const canProceed = validations.length === 0;

  const proceedToConfirm = () => {
    if (!canProceed) {
      fireToast(`Cannot proceed: ${validations.length} validation error${validations.length === 1 ? '' : 's'}`);
      return;
    }
    // Auto-generate confirmation code if not provided.
    if (!draft.confirmationCode) {
      setDraft({ ...draft, confirmationCode: generateCode(draft.channel) });
    }
    setStep('confirm');
  };

  const [submitting, setSubmitting] = useState(false);

  const confirmCreate = async () => {
    if (submitting) return;
    setSubmitting(true);
    const confirmationCode = draft.confirmationCode || generateCode(draft.channel);
    try {
      const created = await createReservation({
        step: 'confirm',
        status: 'confirmed',
        channel: draft.channel,
        sourceKind: draft.channel === 'owner' ? 'manual' : (draft.extensionOf ? 'bdc_extension' : 'manual'),
        confirmationCode,
        cleaningArrangement: isOwnerStay ? draft.cleaningArrangement : undefined,
        specialRequests: (draft.specialRequestCategories.length > 0 || draft.specialRequestNotes)
          ? { categories: draft.specialRequestCategories, notes: draft.specialRequestNotes }
          : undefined,
        internalNotes: draft.notes || undefined,
        extensionOfReservationId: draft.extensionOf || undefined,
      });
      // Build a Reservation-shaped object for the parent's onCreated callback.
      // The backend overlay row is the source of truth now; this is just so the
      // detail drawer can render immediately without round-tripping the list.
      const newRsv: Reservation = {
        id: created.id,
        confirmationCode: created.confirmation_code || confirmationCode,
        propertyCode: draft.propertyCode,
        guestName: draft.guestName.trim(),
        checkIn: draft.checkIn.includes(':') ? `${draft.checkIn}:00` : draft.checkIn,
        checkOut: draft.checkOut.includes(':') ? `${draft.checkOut}:00` : draft.checkOut,
        nights: computedNights,
        channel: draft.channel,
        partySize: {
          adults: draft.adults,
          children: draft.children,
          ...(draft.infants > 0 ? { infants: draft.infants } : {}),
        },
        status: 'confirmed',
        totalAmount: isOwnerStay ? 0 : draft.totalAmount,
        currency: draft.currency,
        touristTax: isOwnerStay ? 0 : draft.touristTax,
        payoutStatus: isOwnerStay ? 'captured' : 'pending',
        balanceDue: isOwnerStay ? 0 : draft.totalAmount,
        ...(isOwnerStay ? { cleaningArrangement: draft.cleaningArrangement } : {}),
        ...(draft.specialRequestCategories.length > 0 || draft.specialRequestNotes
          ? {
              specialRequests: {
                categories: draft.specialRequestCategories,
                notes: draft.specialRequestNotes,
              },
            }
          : {}),
        ...(draft.notes ? { notes: draft.notes } : {}),
        ...(draft.extensionOf ? { extensionOf: draft.extensionOf } : {}),
        createdAt: created.synced_at || new Date().toISOString(),
      };
      onCreated(newRsv);
      fireToast(
        isOwnerStay
          ? `Owner stay confirmed · ${newRsv.confirmationCode} · ${newRsv.propertyCode}`
          : `Reservation confirmed · ${newRsv.confirmationCode} · owner notification queued (Phase 2 fires real comms)`,
      );
      setDraft(DEFAULT_DRAFT);
      setStep('draft');
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create reservation';
      fireToast(`Create failed · ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setDraft(DEFAULT_DRAFT);
    setStep('draft');
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div onClick={handleClose} style={overlayStyle} />
      <aside className="task-detail-pane open" style={{ width: 560, maxWidth: '100vw' }}>
        <div className="task-detail-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 500 }}>
                {step === 'draft' ? 'New reservation · draft' : 'Confirm reservation'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                {step === 'draft'
                  ? 'Manual override path. Airbnb/Booking come via Guesty pull.'
                  : 'Review carefully — owner SMS+email fires within 1hr of confirm.'}
              </div>
            </div>
            <button className="fad-util-btn" onClick={handleClose} title="Close">
              <IconClose size={14} />
            </button>
          </div>
        </div>

        <div className="task-detail-body">
          {step === 'draft' && (
            <DraftStep
              draft={draft}
              setDraft={setDraft}
              properties={properties}
              isOwnerStay={isOwnerStay}
              computedNights={computedNights}
              validations={validations}
            />
          )}
          {step === 'confirm' && (
            <ConfirmStep draft={draft} computedNights={computedNights} isOwnerStay={isOwnerStay} />
          )}
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            background: 'var(--color-background-primary)',
          }}
        >
          {step === 'draft' && (
            <>
              <button className="btn ghost sm" onClick={handleClose}>Discard</button>
              <button
                className="btn primary sm"
                onClick={proceedToConfirm}
                disabled={!canProceed}
              >
                Review →
              </button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button className="btn ghost sm" onClick={() => setStep('draft')} disabled={submitting}>← Back to draft</button>
              <button
                className="btn primary sm"
                onClick={confirmCreate}
                disabled={submitting}
                style={submitting ? { opacity: 0.6, cursor: 'wait' } : undefined}
              >
                {submitting ? 'Confirming…' : 'Confirm reservation'}
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function DraftStep({
  draft,
  setDraft,
  properties,
  isOwnerStay,
  computedNights,
  validations,
}: {
  draft: typeof DEFAULT_DRAFT;
  setDraft: (d: typeof DEFAULT_DRAFT) => void;
  properties: string[];
  isOwnerStay: boolean;
  computedNights: number;
  validations: string[];
}) {
  const set = <K extends keyof typeof draft>(k: K, v: typeof draft[K]) => setDraft({ ...draft, [k]: v });
  const toggleCategory = (c: SpecialRequestCategory) => {
    const has = draft.specialRequestCategories.includes(c);
    set(
      'specialRequestCategories',
      has ? draft.specialRequestCategories.filter((x) => x !== c) : [...draft.specialRequestCategories, c],
    );
  };

  return (
    <>
      <div className="task-detail-section">
        <h5>Booking</h5>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Channel">
            <select value={draft.channel} onChange={(e) => set('channel', e.target.value as ReservationChannel)} style={inputStyle}>
              {MANUAL_CHANNELS.map((c) => (
                <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Property">
            <select value={draft.propertyCode} onChange={(e) => set('propertyCode', e.target.value)} style={inputStyle}>
              <option value="">— select property —</option>
              {properties.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Confirmation code" hint="Auto-generates if blank">
            <input
              type="text"
              value={draft.confirmationCode}
              onChange={(e) => set('confirmationCode', e.target.value)}
              placeholder="e.g. FR-DIR-1099"
              style={inputStyle}
            />
          </Field>
          <Field label="Extension of" hint="Link to source reservation (BDC extension)">
            <input
              type="text"
              value={draft.extensionOf}
              onChange={(e) => set('extensionOf', e.target.value)}
              placeholder="rsv-… (optional)"
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      <div className="task-detail-section">
        <h5>Guest</h5>
        <Field label="Guest name">
          <input
            type="text"
            value={draft.guestName}
            onChange={(e) => set('guestName', e.target.value)}
            placeholder={isOwnerStay ? 'Owner — Marie Lambert' : 'Full name'}
            style={inputStyle}
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
          <Field label="Adults">
            <input type="number" min={1} value={draft.adults} onChange={(e) => set('adults', parseInt(e.target.value || '0', 10))} style={inputStyle} />
          </Field>
          <Field label="Children">
            <input type="number" min={0} value={draft.children} onChange={(e) => set('children', parseInt(e.target.value || '0', 10))} style={inputStyle} />
          </Field>
          <Field label="Infants">
            <input type="number" min={0} value={draft.infants} onChange={(e) => set('infants', parseInt(e.target.value || '0', 10))} style={inputStyle} />
          </Field>
        </div>
      </div>

      <div className="task-detail-section">
        <h5>Dates</h5>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Check-in">
            <input type="datetime-local" value={draft.checkIn} onChange={(e) => set('checkIn', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Check-out">
            <input type="datetime-local" value={draft.checkOut} onChange={(e) => set('checkOut', e.target.value)} style={inputStyle} />
          </Field>
        </div>
        {computedNights > 0 && (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
            {computedNights} night{computedNights === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {!isOwnerStay && (
        <div className="task-detail-section">
          <h5>Pricing</h5>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Total amount">
              <input type="number" min={0} value={draft.totalAmount} onChange={(e) => set('totalAmount', parseInt(e.target.value || '0', 10))} style={inputStyle} />
            </Field>
            <Field label="Currency">
              <select value={draft.currency} onChange={(e) => set('currency', e.target.value as Reservation['currency'])} style={inputStyle}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="MUR">MUR</option>
              </select>
            </Field>
            <Field label="Tourist tax">
              <input type="number" min={0} value={draft.touristTax} onChange={(e) => set('touristTax', parseInt(e.target.value || '0', 10))} style={inputStyle} />
            </Field>
          </div>
        </div>
      )}

      {isOwnerStay && (
        <div className="task-detail-section">
          <h5>Owner stay · cleaning</h5>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['friday_cleans', 'owner_cleans'] as CleaningArrangement[]).map((a) => (
              <button
                key={a}
                className={'btn sm' + (draft.cleaningArrangement === a ? ' active' : ' ghost')}
                onClick={() => set('cleaningArrangement', a)}
              >
                {CLEANING_ARRANGEMENT_LABEL[a]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="task-detail-section">
        <h5>Special requests</h5>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {(['crib', 'high_chair', 'late_checkout', 'dietary', 'mobility', 'transport', 'other'] as SpecialRequestCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              className={'btn sm' + (draft.specialRequestCategories.includes(c) ? ' active' : ' ghost')}
              onClick={() => toggleCategory(c)}
            >
              {SPECIAL_REQUEST_LABEL[c]}
            </button>
          ))}
        </div>
        <textarea
          value={draft.specialRequestNotes}
          onChange={(e) => set('specialRequestNotes', e.target.value)}
          placeholder="Notes (allergies, mobility detail, transport time, …)"
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
        />
      </div>

      <div className="task-detail-section">
        <h5>Internal notes</h5>
        <textarea
          value={draft.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Anything the team needs to know that isn't a special request"
          style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }}
        />
      </div>

      {validations.length > 0 && (
        <div
          style={{
            margin: '0 0 12px',
            padding: 10,
            border: '0.5px solid var(--color-text-warning)',
            borderRadius: 6,
            background: 'var(--color-bg-warning)',
            fontSize: 12,
            color: 'var(--color-text-warning)',
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Fix before review:</div>
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.5 }}>
            {validations.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

function ConfirmStep({
  draft,
  computedNights,
  isOwnerStay,
}: {
  draft: typeof DEFAULT_DRAFT;
  computedNights: number;
  isOwnerStay: boolean;
}) {
  return (
    <>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          border: '0.5px solid var(--color-text-warning)',
          borderRadius: 6,
          background: 'var(--color-bg-warning)',
          fontSize: 12,
          color: 'var(--color-text-warning)',
          lineHeight: 1.55,
        }}
      >
        <strong>Owner notification fires within ~1hr of confirm.</strong> If anything below is wrong, go back to the draft now —
        cancelling+recreating after confirm double-notifies the owner.
      </div>

      <div className="task-detail-section">
        <h5>Summary</h5>
        <SummaryRow label="Channel" value={CHANNEL_LABEL[draft.channel]} />
        <SummaryRow label="Property" value={draft.propertyCode} />
        <SummaryRow label="Confirmation" value={draft.confirmationCode || '(auto-generated)'} />
        {draft.extensionOf && <SummaryRow label="Extension of" value={draft.extensionOf} />}
        <SummaryRow label="Guest" value={draft.guestName} />
        <SummaryRow
          label="Party"
          value={`${draft.adults}A${draft.children ? `+${draft.children}C` : ''}${draft.infants ? `+${draft.infants}I` : ''}`}
        />
        <SummaryRow label="Check-in" value={draft.checkIn.replace('T', ' ')} />
        <SummaryRow label="Check-out" value={draft.checkOut.replace('T', ' ')} />
        <SummaryRow label="Nights" value={String(computedNights)} />
      </div>

      {!isOwnerStay && (
        <div className="task-detail-section">
          <h5>Pricing</h5>
          <SummaryRow label="Total" value={formatMoney(draft.totalAmount, draft.currency)} bold />
          <SummaryRow label="Tourist tax" value={formatMoney(draft.touristTax, draft.currency)} muted />
          <SummaryRow label="Balance due on confirm" value={formatMoney(draft.totalAmount, draft.currency)} muted />
        </div>
      )}

      {isOwnerStay && (
        <div className="task-detail-section">
          <h5>Owner stay · cleaning</h5>
          <SummaryRow label="Arrangement" value={CLEANING_ARRANGEMENT_LABEL[draft.cleaningArrangement]} />
        </div>
      )}

      {(draft.specialRequestCategories.length > 0 || draft.specialRequestNotes) && (
        <div className="task-detail-section">
          <h5>Special requests</h5>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {draft.specialRequestCategories.map((c) => (
              <span key={c} className="chip sm">{SPECIAL_REQUEST_LABEL[c]}</span>
            ))}
          </div>
          {draft.specialRequestNotes && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              {draft.specialRequestNotes}
            </div>
          )}
        </div>
      )}

      {draft.notes && (
        <div className="task-detail-section">
          <h5>Internal notes</h5>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{draft.notes}</div>
        </div>
      )}
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
        {label}
        {hint && <span style={{ marginLeft: 6, color: 'var(--color-text-tertiary)', opacity: 0.7 }}>· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '4px 0', fontSize: 13 }}>
      <span style={{ flex: 1, color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span
        className="mono"
        style={{
          fontWeight: bold ? 500 : 400,
          color: muted ? 'var(--color-text-tertiary)' : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: 6,
  background: 'var(--color-background-primary)',
  color: 'inherit',
  fontSize: 13,
  fontFamily: 'inherit',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: '48px 0 0 0',
  background: 'rgba(15, 24, 54, 0.12)',
  zIndex: 44,
};
