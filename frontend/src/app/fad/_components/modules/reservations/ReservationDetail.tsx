'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGuestLookup } from '../../../_data/guestsClient';
import {
  RESERVATIONS,
  RESERVATION_BY_ID,
  CHANNEL_LABEL,
  STATUS_LABEL,
  PAYOUT_LABEL,
  CLEANING_ARRANGEMENT_LABEL,
  SPECIAL_REQUEST_LABEL,
  PAYMENT_METHOD_LABEL,
  GUEST_PROFILES,
  FOLIO_LINE_KIND_LABEL,
  formatMoney,
  formatStayWindow,
  notesForReservation,
  activityForReservation,
  type Reservation,
  type ReservationActivity,
  type PaymentMethod,
  type FolioLineKind,
} from '../../../_data/reservations';
import {
  useLiveReservations,
  cancelReservation,
  resolutionCenterUrl,
  resolutionCenterLabel,
  loadReservationActivity,
  loadFolioLines,
  addFolioLineApi,
  updateFolioLineApi,
  deleteFolioLineApi,
  loadPayments,
  recordPaymentApi,
  type ReservationActivityRecord,
  type FolioLineRecord,
  type PaymentRecord,
  type PaymentMethodApi,
} from '../../../_data/reservationsClient';
import { liveOnlyMode } from '../../../_data/demoMode';
import { INBOX_THREADS } from '../../../_data/fixtures';
import { TASKS, TASK_USER_BY_ID, TASK_USERS, type Task } from '../../../_data/tasks';
import { addReservationNote, updateReservationTimes } from '../../../_data/breezeway';
import { useCurrentRole, useCurrentUserId } from '../../usePermissions';
import { fireToast } from '../../Toaster';
import { IconClose } from '../../icons';
import { PropertyChip } from '../properties/PropertyQuickView';

interface Props {
  reservationId: string;
  onClose: () => void;
  /** Open the Operations CreateTaskDrawer pre-keyed to this reservation. */
  onCreateTask?: (rsv: Reservation) => void;
}

type SubTab = 'overview' | 'booking' | 'guests' | 'operations' | 'folio' | 'accounting' | 'payments' | 'activity';

const TAB_LABEL: Record<SubTab, string> = {
  overview: 'Overview',
  booking: 'Booking details',
  guests: 'Guests',
  operations: 'Operations',
  folio: 'Folio',
  accounting: 'Accounting',
  payments: 'Payments',
  activity: 'Activity Log',
};

// Role mapping per scoping pack §6 (Admin / Manager / Contributor / Owner portal)
type FinancialAccess = 'full' | 'guest_facing' | 'none';

function financialAccessFor(role: string): FinancialAccess {
  if (role === 'director') return 'full';
  if (role === 'commercial_marketing' || role === 'ops_manager') return 'guest_facing';
  return 'none';
}

function statusToneClass(s: Reservation['status']): string {
  switch (s) {
    case 'checked_in':
    case 'confirmed':
      return 'info';
    case 'hold':
    case 'cancelled':
      return 'warn';
    default:
      return '';
  }
}

export function ReservationDetail({ reservationId, onClose, onCreateTask }: Props) {
  const { reservations: liveReservations, loading: liveLoading } = useLiveReservations();
  const sourceReservations = liveReservations ?? (liveOnlyMode() ? [] : RESERVATIONS);
  // Lookup chain (broader matching unblocks T3.10):
  //   1. exact id match (FAD overlay UUID)
  //   2. guestyId match (live reservations expose .id == backend overlay
  //      UUID but Calendar / Inbox sometimes hold a Guesty _id from a
  //      raw payload; reservationsClient.transformReservation sets
  //      .id = r.id which IS the overlay UUID, but for safety match
  //      against both)
  //   3. confirmationCode match
  //   4. fixture fallback (only off liveOnlyMode)
  const r = useMemo(() => {
    const byId = sourceReservations.find((c) => c.id === reservationId);
    if (byId) return byId;
    const byCode = sourceReservations.find((c) => c.confirmationCode === reservationId);
    if (byCode) return byCode;
    if (!liveOnlyMode()) return RESERVATION_BY_ID[reservationId];
    return undefined;
  }, [reservationId, sourceReservations]);
  const role = useCurrentRole();
  const currentUserId = useCurrentUserId();
  const finAccess = financialAccessFor(role);
  const [tab, setTab] = useState<SubTab>('overview');
  // Bump on fixture mutation (note add, time adjust, cancel) so memoised
  // child views re-derive — same pattern Calendar uses for StayPopover writes.
  const [, setRev] = useState(0);
  const bumpRev = () => setRev((n) => n + 1);

  // Reset to overview when reservation changes (e.g. cross-link clicks).
  useEffect(() => {
    setTab('overview');
  }, [reservationId]);

  // Tabs to show — scoping pack §6: Contributor sees no financial section.
  const tabs: SubTab[] = useMemo(() => {
    const base: SubTab[] = ['overview', 'booking', 'guests', 'operations'];
    if (finAccess !== 'none') base.push('folio');
    if (finAccess === 'full') base.push('accounting', 'payments');
    base.push('activity');
    return base;
  }, [finAccess]);

  if (!r) {
    // While the live fetch is in-flight, show a loading state instead of
    // "not found" — otherwise users see the false-negative for the brief
    // moment between drawer open + data arrive.
    if (liveLoading && liveReservations == null) {
      return (
        <>
          <div onClick={onClose} style={overlayStyle} />
          <aside className="task-detail-pane open" style={paneStyle}>
            <div style={{ padding: 24 }}>
              <button className="fad-util-btn" onClick={onClose}>
                <IconClose size={14} />
              </button>
              <div style={{ marginTop: 16, fontSize: 14, color: 'var(--color-text-tertiary)' }}>
                Loading reservation…
              </div>
            </div>
          </aside>
        </>
      );
    }
    return (
      <>
        <div onClick={onClose} style={overlayStyle} />
        <aside className="task-detail-pane open" style={paneStyle}>
          <div style={{ padding: 24 }}>
            <button className="fad-util-btn" onClick={onClose}>
              <IconClose size={14} />
            </button>
            <div style={{ marginTop: 16, fontSize: 14, color: 'var(--color-text-secondary)' }}>
              Reservation not found.
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono-fad)' }}>
              id: {reservationId}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              The link may reference an older fixture id or a reservation that hasn't synced yet.
              Reservations in the cache: {sourceReservations.length}.
            </div>
          </div>
        </aside>
      </>
    );
  }

  return (
    <>
      <div onClick={onClose} style={overlayStyle} />
      <aside className="task-detail-pane open" style={paneStyle}>
        {/* Header */}
        <div className="task-detail-header" style={{ paddingBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                {r.confirmationCode} · <PropertyChip code={r.propertyCode} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>{r.guestName}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
                {formatStayWindow(r)}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className={'chip sm ' + statusToneClass(r.status)}>{STATUS_LABEL[r.status]}</span>
                <span className="chip sm">{CHANNEL_LABEL[r.channel]}</span>
                {r.balanceDue > 0 && (
                  <span className="chip sm warn">Balance · {formatMoney(r.balanceDue, r.currency)}</span>
                )}
                {r.extensionOf && <span className="chip sm">Extension</span>}
              </div>
            </div>
            <button className="fad-util-btn" onClick={onClose} title="Close">
              <IconClose size={14} />
            </button>
          </div>

          {/* Sub-tab nav */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              marginTop: 16,
              marginLeft: -20,
              marginRight: -20,
              paddingLeft: 20,
              paddingRight: 20,
              overflowX: 'auto',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
            }}
          >
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: '8px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  fontWeight: tab === t ? 500 : 400,
                  borderBottom: tab === t ? '2px solid var(--color-brand-accent)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="task-detail-body">
          {tab === 'overview' && (
            <OverviewTab
              r={r}
              currentUserId={currentUserId}
              bumpRev={bumpRev}
              onCreateTask={onCreateTask}
              onClose={onClose}
            />
          )}
          {tab === 'booking' && <BookingDetailsTab r={r} />}
          {tab === 'guests' && <GuestsTab r={r} reservations={sourceReservations} />}
          {tab === 'operations' && <OperationsTab r={r} />}
          {tab === 'folio' && <FolioTab r={r} access={finAccess} />}
          {tab === 'accounting' && <AccountingTab r={r} />}
          {tab === 'payments' && <PaymentsTab r={r} />}
          {tab === 'activity' && <ActivityTab r={r} />}
        </div>
      </aside>
    </>
  );
}

// ───────────────── Tabs ─────────────────

type Panel = 'none' | 'note' | 'times' | 'cancel';

function OverviewTab({
  r,
  currentUserId,
  bumpRev,
  onCreateTask,
  onClose,
}: {
  r: Reservation;
  currentUserId: string;
  bumpRev: () => void;
  onCreateTask?: (rsv: Reservation) => void;
  onClose: () => void;
}) {
  const notes = notesForReservation(r.id);
  const linkedThread = useMemo(() => INBOX_THREADS.find((t) => t.reservationId === r.id), [r.id]);

  const [panel, setPanel] = useState<Panel>('none');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteMentions, setNoteMentions] = useState<string[]>([]);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [checkInDraft, setCheckInDraft] = useState(r.checkIn.slice(0, 16));
  const [checkOutDraft, setCheckOutDraft] = useState(r.checkOut.slice(0, 16));
  const mentionCandidates = TASK_USERS.filter((u) => u.role !== 'external' && u.active && u.id !== currentUserId);

  const handleMessageGuest = () => {
    if (linkedThread) {
      window.location.assign(`/fad?m=inbox&t=${linkedThread.id}`);
    } else {
      fireToast(`No linked Inbox thread for ${r.guestName} — opening Inbox to start one.`);
      window.location.assign('/fad?m=inbox');
    }
  };

  const handleTriggerRefund = () => {
    fireToast(`Routing to Finance approvals for ${r.confirmationCode}. Within €200/30% cap → Finance flow; over cap → escalation chain.`);
    window.location.assign(`/fad?m=finance&sub=approvals`);
  };

  const handleLinkTask = () => {
    if (onCreateTask) {
      onCreateTask(r);
    } else {
      fireToast('Create-task drawer not wired in this surface.');
    }
  };

  const handleAirbnbResolution = () => {
    // Channel-aware deep link. Per-reservation deep-links land in Phase 3
    // once we capture channel-side IDs; for now we deep-link to the host
    // dashboard reservations list for the matching channel.
    const url = resolutionCenterUrl(r.channel);
    if (!url) {
      fireToast(`No external dashboard for channel · ${r.channel}`);
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  const insertMention = (userId: string) => {
    const u = TASK_USER_BY_ID[userId];
    if (!u) return;
    setNoteDraft(noteDraft + (noteDraft.endsWith(' ') || noteDraft.length === 0 ? '' : ' ') + `@${u.name} `);
    if (!noteMentions.includes(userId)) setNoteMentions([...noteMentions, userId]);
    setMentionPickerOpen(false);
  };

  const postNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    addReservationNote({ reservationId: r.id, authorId: currentUserId, body: text, mentions: noteMentions });
    setNoteDraft('');
    setNoteMentions([]);
    setPanel('none');
    fireToast(
      noteMentions.length > 0
        ? `Note added · ${noteMentions.length} teammate${noteMentions.length === 1 ? '' : 's'} notified`
        : 'Note added to reservation',
    );
    bumpRev();
  };

  const saveTimes = async () => {
    const inIso = checkInDraft.includes(':') ? checkInDraft + ':00' : checkInDraft;
    const outIso = checkOutDraft.includes(':') ? checkOutDraft + ':00' : checkOutDraft;
    if (inIso === r.checkIn && outIso === r.checkOut) {
      fireToast('No time changes to save');
      setPanel('none');
      return;
    }
    await updateReservationTimes({
      reservationId: r.id,
      checkIn: inIso !== r.checkIn ? inIso : undefined,
      checkOut: outIso !== r.checkOut ? outIso : undefined,
      actorId: currentUserId,
    });
    setPanel('none');
    fireToast('Reservation updated · Guesty sync task queued');
    bumpRev();
  };

  const confirmCancel = () => {
    // Optimistic: flip the local status + close the panel + toast
    // immediately. Background cancelReservation call reconciles with the
    // FAD-side state flip; on error we revert.
    // Phase 1 per scoping §10: FAD-side state flip + activity log. Owner
    // notification already fired from Guesty earlier; Phase 2 wires the
    // write-through cancel + comms.
    const originalStatus = r.status;
    r.status = 'cancelled';
    setPanel('none');
    bumpRev();
    fireToast(`${r.confirmationCode} cancelled · Phase 1: FAD-side only, ops must push to Guesty manually`);
    cancelReservation(r.id, 'Cancelled via FAD').catch((e) => {
      r.status = originalStatus;
      bumpRev();
      const msg = e instanceof Error ? e.message : 'cancel failed';
      fireToast(`Cancel failed · ${msg} · status restored`);
    });
  };

  return (
    <>
      <div className="task-detail-section">
        <h5>Stay</h5>
        <Grid2>
          <Field label="Check-in"><span className="mono">{r.checkIn.replace('T', ' ').slice(0, 16)}</span></Field>
          <Field label="Check-out"><span className="mono">{r.checkOut.replace('T', ' ').slice(0, 16)}</span></Field>
          <Field label="Nights"><span className="mono">{r.nights}</span></Field>
          <Field label="Guests">
            <span className="mono">
              {r.partySize.adults}A
              {r.partySize.children ? `+${r.partySize.children}C` : ''}
              {r.partySize.infants ? `+${r.partySize.infants}I` : ''}
            </span>
          </Field>
          {r.actualArrival && <Field label="Actual arrival"><span className="mono">{r.actualArrival.replace('T', ' ').slice(0, 16)}</span></Field>}
          {r.actualDeparture && <Field label="Actual departure"><span className="mono">{r.actualDeparture.replace('T', ' ').slice(0, 16)}</span></Field>}
        </Grid2>
      </div>
      <div className="task-detail-section">
        <h5>Status flags</h5>
        <Grid2>
          <Field label="Payment"><span className="mono">{PAYOUT_LABEL[r.payoutStatus]}</span></Field>
          <Field label="Balance due">
            <span className="mono" style={{ color: r.balanceDue > 0 ? 'var(--color-text-warning)' : undefined }}>
              {r.balanceDue > 0 ? formatMoney(r.balanceDue, r.currency) : 'Paid in full'}
            </span>
          </Field>
          <Field label="Access info">
            <span className="mono" style={{ color: r.accessInfoSentAt ? undefined : 'var(--color-text-warning)' }}>
              {r.accessInfoSentAt ? `Sent ${r.accessInfoSentAt.slice(5, 16)}` : 'Not sent'}
            </span>
          </Field>
          <Field label="Driver">
            <span className="mono">{r.driverAssigneeId ? TASK_USER_BY_ID[r.driverAssigneeId]?.name || r.driverAssigneeId : '—'}</span>
          </Field>
          <Field label="Review request">
            <span className="mono">{r.reviewRequestedAt ? r.reviewRequestedAt.slice(5, 16) : '—'}</span>
          </Field>
        </Grid2>
      </div>
      {r.notes && (
        <div className="task-detail-section">
          <h5>Notes</h5>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>{r.notes}</div>
        </div>
      )}
      {notes.length > 0 && panel !== 'note' && (
        <div className="task-detail-section">
          <h5>Internal notes · {notes.length}</h5>
          {notes.map((n) => (
            <div
              key={n.id}
              style={{
                padding: '8px 0',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 2 }}>
                {n.authorName}
                <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}> · {n.createdAt.slice(5, 16)}</span>
              </div>
              <div style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}

      {/* Inline note composer */}
      {panel === 'note' && (
        <div className="task-detail-section">
          <h5>Add internal note</h5>
          <div style={{ fontSize: 11, color: 'var(--color-text-warning)', marginBottom: 6 }}>
            🔒 Internal · only your team sees this
          </div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="What should the team know? @mention to notify."
            style={{
              width: '100%',
              minHeight: 80,
              padding: 8,
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 6,
              background: 'var(--color-background-primary)',
              color: 'inherit',
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <div style={{ position: 'relative', marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn ghost sm" onClick={() => setMentionPickerOpen((v) => !v)}>
              @ Mention
            </button>
            {noteMentions.map((id) => {
              const u = TASK_USER_BY_ID[id];
              return u ? (
                <span key={id} className="chip sm">
                  @{u.name}
                </span>
              ) : null;
            })}
            {mentionPickerOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)',
                  left: 0,
                  zIndex: 10,
                  background: 'var(--color-background-primary)',
                  border: '0.5px solid var(--color-border-secondary)',
                  borderRadius: 6,
                  padding: 4,
                  maxHeight: 200,
                  overflowY: 'auto',
                  minWidth: 200,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                }}
              >
                {mentionCandidates.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => insertMention(u.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '6px 10px',
                      background: 'transparent',
                      border: 0,
                      textAlign: 'left',
                      fontSize: 12,
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button
                className="btn ghost sm"
                onClick={() => {
                  setNoteDraft('');
                  setNoteMentions([]);
                  setPanel('none');
                }}
              >
                Cancel
              </button>
              <button className="btn primary sm" onClick={postNote} disabled={!noteDraft.trim()}>
                Post note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline time-adjust form */}
      {panel === 'times' && (
        <div className="task-detail-section">
          <h5>Adjust check-in / check-out</h5>
          <Grid2>
            <Field label="Check-in">
              <input
                type="datetime-local"
                value={checkInDraft}
                onChange={(e) => setCheckInDraft(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Check-out">
              <input
                type="datetime-local"
                value={checkOutDraft}
                onChange={(e) => setCheckOutDraft(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </Grid2>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            Saving creates a high-priority Guesty-sync task for the ops manager. Real Guesty write-through wires Phase 2.
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={() => setPanel('none')}>Cancel</button>
            <button className="btn primary sm" onClick={saveTimes}>Save changes</button>
          </div>
        </div>
      )}

      {/* Inline cancel-with-warning */}
      {panel === 'cancel' && (
        <div
          className="task-detail-section"
          style={{
            border: '0.5px solid var(--color-text-danger)',
            borderRadius: 8,
            padding: 14,
            background: 'var(--color-bg-danger)',
          }}
        >
          <h5 style={{ color: 'var(--color-text-danger)' }}>Cancel reservation?</h5>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55, marginBottom: 8 }}>
            <strong>Owner will see this cancellation.</strong> Guesty fires owner SMS+email within ~1hr of confirmed cancellation.
            Refund handling stays with Finance approvals (within cap → Mary; over cap → escalation chain).
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={() => setPanel('none')}>Keep reservation</button>
            <button
              className="btn sm"
              style={{ background: 'var(--color-text-danger)', color: 'white', border: 0 }}
              onClick={confirmCancel}
            >
              Confirm cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions row — hidden while a panel is open to keep the surface focused */}
      {panel === 'none' && (
        <div className="task-detail-section">
          <h5>Actions</h5>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button className="btn ghost sm" onClick={handleMessageGuest}>Message guest</button>
            {r.status !== 'cancelled' && r.status !== 'checked_out' && (
              <button className="btn ghost sm" onClick={() => setPanel('times')}>Modify dates/times</button>
            )}
            <button className="btn ghost sm" onClick={handleTriggerRefund}>Trigger refund</button>
            <button className="btn ghost sm" onClick={() => setPanel('note')}>+ Note</button>
            <button className="btn ghost sm" onClick={handleLinkTask}>+ Task</button>
            {r.channel === 'airbnb' && (
              <button className="btn ghost sm" onClick={handleAirbnbResolution}>
                Open Airbnb resolution centre ↗
              </button>
            )}
            {r.status !== 'cancelled' && r.status !== 'checked_out' && (
              <button
                className="btn ghost sm"
                style={{ marginLeft: 'auto', color: 'var(--color-text-danger)' }}
                onClick={() => setPanel('cancel')}
              >
                Cancel reservation
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function BookingDetailsTab({ r }: { r: Reservation }) {
  return (
    <>
      <div className="task-detail-section">
        <h5>Booking</h5>
        <Grid2>
          <Field label="Confirmation"><span className="mono">{r.confirmationCode}</span></Field>
          <Field label="Channel">{CHANNEL_LABEL[r.channel]}</Field>
          <Field label="Created"><span className="mono">{r.createdAt ? r.createdAt.slice(0, 10) : '—'}</span></Field>
          <Field label="Guesty calendar">
            <span className="mono">
              {r.calendarPricing?.syncedAt
                ? `${r.calendarPricing.nightsCached}/${r.nights} nights · ${r.calendarPricing.syncedAt.slice(0, 10)}`
                : 'Not synced'}
            </span>
          </Field>
          {r.calendarPricing?.totalAmount != null && (
            <Field label="Calendar rate">
              <span className="mono">
                {formatMoney(r.calendarPricing.totalAmount, r.calendarPricing.currency || r.currency)}
              </span>
            </Field>
          )}
          {r.calendarPricing?.minNightly != null && r.calendarPricing?.maxNightly != null && (
            <Field label="Nightly range">
              <span className="mono">
                {formatMoney(r.calendarPricing.minNightly, r.calendarPricing.currency || r.currency)}
                {' - '}
                {formatMoney(r.calendarPricing.maxNightly, r.calendarPricing.currency || r.currency)}
              </span>
            </Field>
          )}
          {r.extensionOf && (
            <Field label="Extension of"><span className="mono">{r.extensionOf}</span></Field>
          )}
        </Grid2>
      </div>
      <div className="task-detail-section">
        <h5>Party</h5>
        <Grid2>
          <Field label="Adults"><span className="mono">{r.partySize.adults}</span></Field>
          <Field label="Children"><span className="mono">{r.partySize.children}</span></Field>
          <Field label="Infants"><span className="mono">{r.partySize.infants ?? 0}</span></Field>
        </Grid2>
      </div>
      {r.specialRequests && (
        <div className="task-detail-section">
          <h5>Special requests</h5>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {r.specialRequests.categories.map((c) => (
              <span key={c} className="chip sm">{SPECIAL_REQUEST_LABEL[c]}</span>
            ))}
          </div>
          {r.specialRequests.notes && (
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
              {r.specialRequests.notes}
            </div>
          )}
        </div>
      )}
      {r.cleaningArrangement && (
        <div className="task-detail-section">
          <h5>Owner stay · cleaning</h5>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="chip sm">{CLEANING_ARRANGEMENT_LABEL[r.cleaningArrangement]}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {r.cleaningArrangement === 'friday_cleans'
                ? 'Friday handles SRL removal + standard clean + post-clean inspect. Cleaning fee billable to owner.'
                : 'Owner cleans. Friday verifies post-stay; if substandard, reclean billable.'}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Task templates fire when Operations module redesigns (parking-lot per decisions log §7).
          </div>
        </div>
      )}
    </>
  );
}

function GuestsTab({ r, reservations }: { r: Reservation; reservations: Reservation[] }) {
  const profile = GUEST_PROFILES[r.guestName];
  const guestEmail = r.guestEmail?.trim().toLowerCase();
  const guestName = r.guestName.trim().toLowerCase();

  // Live lookup against /api/guests (Phase 1, T3.11). Most OTA bookings
  // arrive with redacted email + phone, so name-bucket lookup is the
  // most useful path in practice — Guesty redacts these for Airbnb (by
  // policy) and often Booking. Falls through to fixture only if every
  // key misses.
  const live = useGuestLookup({
    email: guestEmail || null,
    phone: null,
    name: r.guestName || null,
  });

  const priorStays = useMemo(
    () =>
      reservations
        .filter((candidate) => candidate.id !== r.id)
        .filter((candidate) => {
          const candidateEmail = candidate.guestEmail?.trim().toLowerCase();
          if (guestEmail && candidateEmail) return candidateEmail === guestEmail;
          return candidate.guestName.trim().toLowerCase() === guestName;
        })
        .sort((a, b) => b.checkOut.localeCompare(a.checkOut)),
    [guestEmail, guestName, r.id, reservations],
  );

  // Live path: backend resolved an fad_guests record. Render from that
  // (canonical) and supplement with cross-reservation lookup for prior
  // stays (already richer than the fixture lookup since it joins on the
  // live guesty_reservations table).
  if (live.guest) {
    const g = live.guest;
    const linkedStays = live.reservations.filter(
      (rs) => (rs.confirmation_code || '') !== (r.confirmationCode || ''),
    );
    return (
      <>
        <div className="task-detail-section">
          <h5>Profile</h5>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{g.display_name}</div>
          <Grid2>
            <Field label="Email">
              {g.primary_email ? (
                <span style={{ fontSize: 12 }}>{g.primary_email}</span>
              ) : (
                <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
              )}
            </Field>
            <Field label="Phone">
              {g.primary_phone ? (
                <span style={{ fontSize: 12 }} className="mono">{g.primary_phone}</span>
              ) : (
                <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
              )}
            </Field>
            <Field label="Language">{g.language_pref ? g.language_pref.toUpperCase() : '—'}</Field>
            <Field label="Country">{g.country || '—'}</Field>
            <Field label="VIP tier">
              <span className={'chip sm ' + (g.vip_tier !== 'none' ? 'info' : '')}>
                {g.vip_tier === 'none' ? '—' : g.vip_tier.toUpperCase()}
              </span>
            </Field>
            <Field label="Lifetime stays">
              <span className="mono">{g.total_stays_count}</span>
            </Field>
          </Grid2>
        </div>

        {g.notes && (
          <div className="task-detail-section">
            <h5>Notes on guest</h5>
            <div style={{ fontSize: 13, lineHeight: 1.55 }}>{g.notes}</div>
          </div>
        )}

        <div className="task-detail-section">
          <h5>Prior stays · {linkedStays.length}</h5>
          {linkedStays.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              First confirmed stay with Friday.
            </div>
          )}
          {linkedStays.slice(0, 12).map((p, i) => (
            <div
              key={p.guesty_id || `prior-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.7fr 1fr 0.6fr 0.5fr',
                gap: 10,
                padding: '8px 0',
                borderBottom: i < Math.min(linkedStays.length, 12) - 1 ? '0.5px solid var(--color-border-tertiary)' : 0,
                fontSize: 12,
                alignItems: 'center',
              }}
            >
              <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>
                {(p.check_in_date || '').slice(0, 10)}
              </span>
              <span className="mono">{p.listing_nickname || p.listing_guesty_id?.slice(-6) || '—'}</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{p.channel || '—'}</span>
              <span className={'chip sm ' + (String(p.status).includes('cancel') ? 'warn' : '')}>{p.status || '—'}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
          Live · fad_guests · {g.total_stays_count} stays · €
          {((g.total_revenue_minor || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })} lifetime
        </div>
      </>
    );
  }

  // Backend doesn't have a record yet — fall through to fixture / stub.
  if (!profile) {
    return (
      <div className="task-detail-section">
        <StubPanel
          title={r.guestName}
          body={`No profile on file. ${r.partySize.adults} adults${r.partySize.children ? ` + ${r.partySize.children} children` : ''}${r.partySize.infants ? ` + ${r.partySize.infants} infants` : ''}.`}
          body2={live.loading ? 'Checking live registry…' : 'Profile populates from channel data on first stay. Guests module v0.1 (T3.11) lookups by email — this guest has no fad_guests row yet.'}
        />
      </div>
    );
  }

  return (
    <>
      <div className="task-detail-section">
        <h5>Profile</h5>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{r.guestName}</div>
        <Grid2>
          <Field label="Email">
            {profile.email ? <span style={{ fontSize: 12 }}>{profile.email}</span> : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
          </Field>
          <Field label="Phone">
            {profile.phone ? <span style={{ fontSize: 12 }} className="mono">{profile.phone}</span> : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
          </Field>
          <Field label="Language">{profile.language}</Field>
          <Field label="Primary channel">{CHANNEL_LABEL[profile.primaryChannel]}</Field>
          <Field label="Party (this stay)">
            <span className="mono">
              {r.partySize.adults}A
              {r.partySize.children ? `+${r.partySize.children}C` : ''}
              {r.partySize.infants ? `+${r.partySize.infants}I` : ''}
            </span>
          </Field>
          <Field label="Marketing consent">
            <span className={'chip sm ' + (profile.marketingConsent ? 'info' : '')}>
              {profile.marketingConsent ? 'Opted in' : 'Not opted in'}
            </span>
          </Field>
        </Grid2>
      </div>

      <div className="task-detail-section">
        <h5>Channel verification</h5>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {profile.airbnbVerified && <span className="chip sm info">Airbnb verified</span>}
          {profile.bookingVerified && <span className="chip sm info">Booking verified</span>}
          {!profile.airbnbVerified && !profile.bookingVerified && (
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No channel-side verification on file (direct or owner stay).
            </span>
          )}
        </div>
      </div>

      {profile.notes && (
        <div className="task-detail-section">
          <h5>Notes on guest</h5>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>{profile.notes}</div>
        </div>
      )}

      <div className="task-detail-section">
        <h5>Prior stays · {priorStays.length}</h5>
        {priorStays.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            First stay with Friday.
          </div>
        )}
        {priorStays.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => window.location.assign(`/fad?m=reservations&sub=overview&rsv=${p.id}`)}
            style={{
              display: 'grid',
              gridTemplateColumns: '0.7fr 1fr 0.6fr 0.5fr',
              gap: 10,
              padding: '8px 0',
              borderBottom: i < priorStays.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 0,
              background: 'transparent',
              border: 0,
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 12,
              alignItems: 'center',
              color: 'inherit',
            }}
          >
            <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>
              {p.checkIn.slice(0, 10)}
            </span>
            <span className="mono">{p.propertyCode}</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>{CHANNEL_LABEL[p.channel]}</span>
            <span className={'chip sm ' + (p.status === 'cancelled' ? 'warn' : '')}>{STATUS_LABEL[p.status]}</span>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
        Phase 1: profile lookup by guest name. Phase 2: Guests module normalises to a stable guest ID + full document store + consent log.
      </div>
    </>
  );
}

function OperationsTab({ r }: { r: Reservation }) {
  const linked = TASKS.filter((t) => t.reservationId === r.id);
  if (linked.length === 0) {
    return (
      <div className="task-detail-section">
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          No tasks linked to this reservation.
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          When Operations creates check-in / cleaning / inspection tasks tied to this reservation, they'll show here.
        </div>
      </div>
    );
  }
  return (
    <div className="task-detail-section">
      <h5>Linked tasks · {linked.length}</h5>
      {linked.map((t: Task, i) => (
        <div
          key={t.id}
          style={{
            padding: '10px 0',
            borderBottom: i < linked.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</span>
            <span className="chip sm">{t.status}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            <span className="mono">{t.id}</span> · {t.department}
            {t.subdepartment && ` · ${t.subdepartment}`} · due {t.dueDate}
            {t.assigneeIds.length > 0 && ` · ${t.assigneeIds.map((id) => TASK_USER_BY_ID[id]?.name).filter(Boolean).join(', ')}`}
          </div>
        </div>
      ))}
    </div>
  );
}

function FolioTab({ r, access }: { r: Reservation; access: FinancialAccess }) {
  const [customLines, setCustomLines] = useState<FolioLineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // T3.10 — folio lines persisted in fad_reservation_folio_lines
  // (mig 089). Lookup by reservation id OR guesty id (resolved server-side).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadFolioLines(r.id)
      .then((lines) => {
        if (cancelled) return;
        setCustomLines(lines);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message || 'Failed to load folio');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [r.id]);

  if (access === 'none') return null;

  // Prefer the live Guesty money breakdown (mig 085) over channel-fee
  // heuristics. Falls back to the old derivation when the API hasn't
  // surfaced a breakdown yet (older synced rows or manual reservations).
  const mb = r.moneyBreakdown;
  const hasBreakdown = mb && (mb.subTotal != null || mb.roomRevenue != null);
  const cleaningFee = hasBreakdown && mb!.cleaningFee != null ? Math.round(mb!.cleaningFee) : 0;
  const taxes = hasBreakdown && mb!.taxes != null ? Math.round(mb!.taxes) : r.touristTax;
  const roomRevenue = hasBreakdown && mb!.roomRevenue != null
    ? Math.round(mb!.roomRevenue)
    : Math.max(0, r.totalAmount - cleaningFee - taxes);
  const channelFee = hasBreakdown && mb!.hostServiceFee != null
    ? Math.round(mb!.hostServiceFee)
    : (() => {
        // Fallback heuristic when Guesty doesn't expose hostServiceFee
        const rate = r.channel === 'direct' || r.channel === 'email' || r.channel === 'owner'
          ? 0 : r.channel === 'booking' ? 0.15 : 0.18;
        return Math.round((r.totalAmount - taxes) * rate);
      })();
  // hostPayout = gross - channel fee - taxes (per Guesty's own definition).
  // Friday and owner split the net 70/30 (per scoping pack). Use the
  // breakdown when available, else derive.
  const netForSplit = hasBreakdown && mb!.hostPayout != null
    ? Math.round(mb!.hostPayout - cleaningFee) // cleaning is owner pass-through in our model
    : Math.max(0, r.totalAmount - channelFee - taxes - cleaningFee);
  const ownerSplit = Math.round(netForSplit * 0.7);
  const fridayMargin = netForSplit - ownerSplit;

  const guestFacingLines = customLines.filter((l) => l.guest_facing);
  const guestFacingExtraTotal = guestFacingLines.reduce(
    (sum, l) => sum + l.amount_minor / 100,
    0,
  );
  const adjustedTotal = r.totalAmount + guestFacingExtraTotal;

  const handleLineMutated = (updater: (prev: FolioLineRecord[]) => FolioLineRecord[]) => {
    setCustomLines(updater);
  };

  return (
    <>
      <div className="task-detail-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h5 style={{ margin: 0 }}>Folio · guest-facing</h5>
          {!addOpen && !loading && (
            <button
              className="btn ghost sm"
              onClick={() => setAddOpen(true)}
              style={{ padding: '4px 10px', fontSize: 11 }}
            >
              + Line item
            </button>
          )}
        </div>
        <Row label="Room rent" value={formatMoney(roomRevenue, r.currency)} />
        {cleaningFee > 0 && (
          <Row label="Cleaning fee" value={formatMoney(cleaningFee, r.currency)} muted />
        )}
        <Row label="Tourist tax (MRA)" value={formatMoney(taxes, r.currency)} muted />
        {loading && (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '6px 0' }}>
            Loading custom lines…
          </div>
        )}
        {loadError && (
          <div style={{ fontSize: 11, color: 'var(--color-text-danger)', padding: '6px 0' }}>
            Couldn&apos;t load custom folio lines · {loadError}
          </div>
        )}
        {!loading && !loadError && guestFacingLines.map((l) => (
          <FolioLineRow
            key={l.id}
            line={l}
            reservationId={r.id}
            onUpdated={(updated) => handleLineMutated((prev) =>
              prev.map((p) => p.id === updated.id ? updated : p))}
            onRemoved={() => handleLineMutated((prev) =>
              prev.filter((p) => p.id !== l.id))}
          />
        ))}
        {addOpen && (
          <FolioAddForm
            reservationId={r.id}
            currency={r.currency}
            onAdded={(line) => {
              setAddOpen(false);
              handleLineMutated((prev) => [...prev, line]);
            }}
            onCancel={() => setAddOpen(false)}
          />
        )}
        <Row
          label={guestFacingExtraTotal !== 0 ? 'Adjusted total' : 'Total'}
          value={formatMoney(adjustedTotal, r.currency)}
          bold
          borderTop
        />
      </div>
      {access === 'full' && (
        <div className="task-detail-section">
          <h5>Owner split · admin only</h5>
          <Row
            label={hasBreakdown ? 'Channel fee (Guesty)' : 'Channel fee (est.)'}
            value={`− ${formatMoney(channelFee, r.currency)}`}
            muted
          />
          <Row label="Net to owner (70%)" value={formatMoney(ownerSplit, r.currency)} />
          <Row label="Friday margin (30%)" value={formatMoney(fridayMargin, r.currency)} bold borderTop />
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {hasBreakdown
              ? 'Channel fee from Guesty money.hostServiceFee · 70/30 split per scoping pack §6.'
              : 'Phase 1 fallback: derived from totals + per-channel heuristic. Reservation lacks Guesty money breakdown.'}
          </div>
        </div>
      )}
      {access === 'guest_facing' && (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
          Manager view — guest-facing total only. Owner split + margin restricted to admin.
        </div>
      )}
    </>
  );
}

function FolioLineRow({
  line,
  reservationId,
  onUpdated,
  onRemoved,
}: {
  line: FolioLineRecord;
  reservationId: string;
  onUpdated: (updated: FolioLineRecord) => void;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(line.label);
  // Track the amount in major units in the UI; convert to minor on save.
  const [draftAmount, setDraftAmount] = useState(line.amount_minor / 100);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await updateFolioLineApi(reservationId, line.id, {
        label: draftLabel.trim() || line.label,
        amountMinor: Math.round(draftAmount * 100),
      });
      onUpdated(updated);
      setEditing(false);
      fireToast('Folio line updated');
    } catch (err) {
      fireToast('Failed to update · ' + ((err as Error)?.message || 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteFolioLineApi(reservationId, line.id);
      onRemoved();
      fireToast('Folio line removed');
    } catch (err) {
      fireToast('Failed to remove · ' + ((err as Error)?.message || 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  const amountMajor = line.amount_minor / 100;

  if (editing) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px auto auto',
          gap: 6,
          alignItems: 'center',
          padding: '6px 0',
        }}
      >
        <input
          type="text"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          style={inputStyle}
        />
        <input
          type="number"
          value={draftAmount}
          onChange={(e) => setDraftAmount(parseFloat(e.target.value || '0'))}
          style={{ ...inputStyle, textAlign: 'right' }}
        />
        <button className="btn primary sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="btn ghost sm" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', padding: '6px 0', alignItems: 'center', gap: 6 }}>
      <span style={{ flex: 1, fontSize: 13 }}>
        {line.label}
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>
          {FOLIO_LINE_KIND_LABEL[line.kind as FolioLineKind]}
        </span>
      </span>
      <span
        className="mono"
        style={{
          fontSize: 13,
          color: amountMajor < 0 ? 'var(--color-text-success)' : undefined,
        }}
      >
        {amountMajor < 0 ? '−' : '+'}
        {formatMoney(Math.abs(amountMajor), line.currency)}
      </span>
      <button
        className="btn ghost sm"
        style={{ padding: '2px 8px', fontSize: 11 }}
        onClick={() => {
          setDraftLabel(line.label);
          setDraftAmount(amountMajor);
          setEditing(true);
        }}
        disabled={busy}
      >
        Edit
      </button>
      <button
        className="btn ghost sm"
        style={{ padding: '2px 8px', fontSize: 11, color: 'var(--color-text-danger)' }}
        onClick={remove}
        disabled={busy}
      >
        Remove
      </button>
    </div>
  );
}

function FolioAddForm({
  reservationId,
  currency,
  onAdded,
  onCancel,
}: {
  reservationId: string;
  currency: 'MUR' | 'EUR' | 'USD';
  onAdded: (line: FolioLineRecord) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<FolioLineKind>('extra');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (busy) return;
    if (!label.trim()) {
      fireToast('Label required');
      return;
    }
    if (!Number.isFinite(amount) || amount === 0) {
      fireToast('Enter a non-zero amount');
      return;
    }
    setBusy(true);
    try {
      const line = await addFolioLineApi(reservationId, {
        kind,
        label: label.trim(),
        amountMinor: Math.round(amount * 100),
        currency,
        guestFacing: true,
        notes: notes.trim() || undefined,
      });
      fireToast(`Folio line added · ${formatMoney(Math.abs(amount), currency)}`);
      onAdded(line);
    } catch (err) {
      fireToast('Failed to add · ' + ((err as Error)?.message || 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        margin: '8px 0',
        padding: 10,
        background: 'var(--color-background-secondary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as FolioLineKind)} style={inputStyle}>
          <option value="extra">Extra</option>
          <option value="cleaning_fee">Cleaning fee</option>
          <option value="discount">Discount</option>
          <option value="manual_adjustment">Manual adjustment</option>
        </select>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(parseFloat(e.target.value || '0'))}
          placeholder="Amount (negative for discount)"
          style={inputStyle}
        />
      </div>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. Chef service Sat)"
        style={{ ...inputStyle, marginBottom: 6 }}
      />
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        style={inputStyle}
      />
      <div style={{ marginTop: 6, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn primary sm" onClick={handleAdd} disabled={busy}>
          {busy ? 'Saving…' : 'Add line'}
        </button>
      </div>
    </div>
  );
}

function AccountingTab({ r }: { r: Reservation }) {
  // T3.10 — derive a sketch of GL entries from reservation totals + status,
  // preferring the Guesty money breakdown (mig 085) over channel-fee
  // heuristics. Finance Phase 3 will replace this with real reads from
  // Owners ledger / AP / Cash / Advanced deposit.
  const mb = r.moneyBreakdown;
  const hasBreakdown = mb && (mb.subTotal != null || mb.roomRevenue != null);

  const cleaningFee = hasBreakdown && mb!.cleaningFee != null ? Math.round(mb!.cleaningFee) : 0;
  const taxes = hasBreakdown && mb!.taxes != null ? Math.round(mb!.taxes) : r.touristTax;
  const channelFeeRate = r.channel === 'direct' || r.channel === 'email' || r.channel === 'owner'
    ? 0 : r.channel === 'booking' ? 0.15 : 0.18;
  const channelFee = hasBreakdown && mb!.hostServiceFee != null
    ? Math.round(mb!.hostServiceFee)
    : Math.round((r.totalAmount - taxes) * channelFeeRate);
  const netForSplit = hasBreakdown && mb!.hostPayout != null
    ? Math.round(mb!.hostPayout - cleaningFee)
    : Math.max(0, r.totalAmount - channelFee - taxes - cleaningFee);
  const ownerSplit = Math.round(netForSplit * 0.7);
  const fridayMargin = netForSplit - ownerSplit;
  const isOwnerStay = r.channel === 'owner';

  type Entry = { account: string; debit?: number; credit?: number; note?: string };
  const entries: Entry[] = [];

  if (isOwnerStay) {
    entries.push({ account: 'Owners ledger — block', note: 'No revenue · owner stay' });
    if (r.cleaningArrangement === 'friday_cleans') {
      entries.push({ account: 'Owners ledger — cleaning fee billable', credit: 2000, note: 'Property-size scaled' });
    }
  } else if (r.status === 'cancelled') {
    entries.push({ account: 'Cash / channel payout', debit: r.totalAmount, note: 'Original receipt' });
    entries.push({ account: 'Channel · refund issued', credit: r.refundAmount || r.totalAmount, note: 'Refund per channel policy' });
    entries.push({ account: 'Friday revenue', debit: 0, note: 'Cancelled — no revenue recognised' });
  } else {
    entries.push({ account: 'Cash / channel payout', debit: r.totalAmount, note: 'Gross receipt' });
    if (channelFee > 0) {
      entries.push({
        account: 'Channel commission expense',
        credit: channelFee,
        note: hasBreakdown && mb!.hostServiceFee != null
          ? 'From Guesty money.hostServiceFee'
          : `${Math.round(channelFeeRate * 100)}% on accommodation fare (est.)`,
      });
    }
    if (cleaningFee > 0) {
      entries.push({ account: 'Owners ledger — cleaning pass-through', credit: cleaningFee, note: 'Cleaning fee held in trust for owner' });
    }
    entries.push({ account: 'Tourist tax payable (MRA)', credit: taxes, note: 'Pass-through to MRA' });
    entries.push({ account: 'Owners ledger — payout owed', credit: ownerSplit, note: '70% of net' });
    entries.push({ account: 'Friday revenue', credit: fridayMargin, note: '30% of net (management fee)' });
    if (r.balanceDue > 0) {
      entries.push({ account: 'Advanced deposit', credit: r.totalAmount - r.balanceDue, note: 'Received pre-arrival' });
      entries.push({ account: 'Accounts receivable', debit: r.balanceDue, note: 'Balance due' });
    }
  }

  return (
    <>
      <div className="task-detail-section">
        <h5>GL entries · derived</h5>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                <th style={thStyle}>Account</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Debit</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  <td style={tdStyle}>
                    <div>{e.account}</div>
                    {e.note && (
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                        {e.note}
                      </div>
                    )}
                  </td>
                  <td className="mono" style={{ ...tdStyle, textAlign: 'right' }}>
                    {e.debit && e.debit > 0 ? formatMoney(e.debit, r.currency) : ''}
                  </td>
                  <td className="mono" style={{ ...tdStyle, textAlign: 'right' }}>
                    {e.credit && e.credit > 0 ? formatMoney(e.credit, r.currency) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.55 }}>
        {hasBreakdown
          ? 'Channel commission + cleaning + taxes from Guesty money breakdown (mig 085); 70/30 owner split per scoping §6. Phase 3: replace with real Finance reads keyed by reservation_id.'
          : 'Phase 1 fallback: derived from totals + channel commission heuristics. Phase 2: real Finance schema reads (Owners ledger / AP / Cash / Advanced deposit) keyed by reservationId.'}
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-text-tertiary)',
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: '8px',
  verticalAlign: 'top',
};

function PaymentsTab({ r }: { r: Reservation }) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  // Default to balanceDue (in major units) for convenience.
  const [amount, setAmount] = useState<number>(r.balanceDue);
  const [method, setMethod] = useState<PaymentMethodApi>('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // T3.10 — manual payments persisted in fad_reservation_payments (mig 089).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadPayments(r.id)
      .then((rows) => {
        if (cancelled) return;
        setPayments(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message || 'Failed to load payments');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [r.id]);

  const totalReceived = payments
    .filter((p) => p.status === 'received')
    .reduce((sum, p) => sum + p.amount_minor / 100, 0);
  const totalRefunded = payments
    .filter((p) => p.status === 'refunded')
    .reduce((sum, p) => sum + p.amount_minor / 100, 0);

  const handleRecord = async () => {
    if (busy) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      fireToast('Enter a positive amount');
      return;
    }
    setBusy(true);
    try {
      const row = await recordPaymentApi(r.id, {
        amountMinor: Math.round(amount * 100),
        currency: r.currency,
        method,
        status: 'received',
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setPayments((prev) => [row, ...prev]);
      fireToast(`Manual payment recorded · ${formatMoney(amount, r.currency)}`);
      setRecordOpen(false);
      setReference('');
      setNotes('');
    } catch (err) {
      fireToast('Failed to record · ' + ((err as Error)?.message || 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="task-detail-section">
        <h5>Payment summary</h5>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <Stat label="Reservation total" value={formatMoney(r.totalAmount, r.currency)} />
          <Stat label="Received" value={formatMoney(totalReceived, r.currency)} tone="success" />
          {totalRefunded > 0 && (
            <Stat label="Refunded" value={formatMoney(totalRefunded, r.currency)} tone="danger" />
          )}
          <Stat
            label="Balance due"
            value={r.balanceDue > 0 ? formatMoney(r.balanceDue, r.currency) : 'Paid in full'}
            tone={r.balanceDue > 0 ? 'warn' : 'success'}
          />
        </div>
      </div>

      <div className="task-detail-section">
        <h5>Records · {loading ? '…' : payments.length}</h5>
        {loading && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Loading payments…
          </div>
        )}
        {loadError && (
          <div style={{ fontSize: 12, color: 'var(--color-text-danger)' }}>
            Failed to load · {loadError}
          </div>
        )}
        {!loading && !loadError && payments.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            No payment records yet.
          </div>
        )}
        {!loading && !loadError && payments.map((p, i) => {
          const amountMajor = p.amount_minor / 100;
          return (
            <div
              key={p.id}
              style={{
                padding: '10px 0',
                borderBottom: i < payments.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 0,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 500 }}>{PAYMENT_METHOD_LABEL[p.method as PaymentMethod]}</span>
                <span
                  className="mono"
                  style={{
                    fontWeight: 500,
                    color:
                      p.status === 'refunded'
                        ? 'var(--color-text-danger)'
                        : 'var(--color-text-success)',
                  }}
                >
                  {p.status === 'refunded' ? '−' : ''}
                  {formatMoney(amountMajor, p.currency)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                <span className="mono">{p.ts.slice(0, 16).replace('T', ' ')}</span>
                {p.reference && <span className="mono">· {p.reference}</span>}
                <span className={'chip sm ' + (p.status === 'refunded' ? 'warn' : '')}>{p.status}</span>
              </div>
              {p.notes && (
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  {p.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {recordOpen ? (
        <div className="task-detail-section">
          <h5>Record manual payment</h5>
          <Grid2>
            <Field label="Amount">
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value || '0'))}
                style={inputStyle}
              />
            </Field>
            <Field label="Method">
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethodApi)} style={inputStyle}>
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="manual_adjustment">Manual adjustment</option>
              </select>
            </Field>
          </Grid2>
          <div style={{ marginTop: 8 }}>
            <Field label="Reference">
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. TRF-XYZ-123"
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ marginTop: 8 }}>
            <Field label="Notes">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={() => setRecordOpen(false)} disabled={busy}>Cancel</button>
            <button className="btn primary sm" onClick={handleRecord} disabled={busy}>
              {busy ? 'Saving…' : 'Record payment'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn sm" onClick={() => setRecordOpen(true)}>
            + Record manual payment
          </button>
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 12, lineHeight: 1.55 }}>
        Phase 1: no payment processor connected — manual records only. Channel payouts continue to flow via Guesty&apos;s payments[] array; future sync will merge them automatically.
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warn' | 'danger' }) {
  const color =
    tone === 'success'
      ? 'var(--color-text-success)'
      : tone === 'warn'
      ? 'var(--color-text-warning)'
      : tone === 'danger'
      ? 'var(--color-text-danger)'
      : undefined;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 130,
        padding: 10,
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 500, color }}>
        {value}
      </div>
    </div>
  );
}

function ActivityTab({ r }: { r: Reservation }) {
  // Pull live activity from the backend (mig 078 + 2026-05-24 wiring). Falls
  // back to fixture activity when liveOnlyMode is off OR when the backend
  // returns nothing — preserves the demo UX in dev without leaking demo
  // entries into prod-FR alongside real ones.
  const [liveActivity, setLiveActivity] = useState<ReservationActivityRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadReservationActivity(r.id, 100)
      .then((rows) => { if (!cancelled) setLiveActivity(rows); })
      .catch(() => { if (!cancelled) setLiveActivity([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [r.id]);

  const liveAsFixture: ReservationActivity[] = (liveActivity ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    ts: row.ts,
    actorId: row.actor_id ?? undefined,
    detail: row.detail,
  } as ReservationActivity));

  const fixtureActivity = activityForReservation(r.id);
  const activity = liveAsFixture.length > 0
    ? liveAsFixture
    : (!liveOnlyMode() ? fixtureActivity : []);

  if (loading && activity.length === 0) {
    return (
      <div className="task-detail-section">
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading activity…</div>
      </div>
    );
  }
  if (activity.length === 0) {
    return (
      <div className="task-detail-section">
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No activity logged yet.</div>
      </div>
    );
  }
  return (
    <div className="task-detail-section">
      <h5>Activity · {activity.length}</h5>
      {activity.map((a: ReservationActivity, i) => (
        <div
          key={a.id}
          style={{
            padding: '8px 0',
            borderBottom: i < activity.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 0,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', minWidth: 90 }}>
            {a.ts.slice(5, 16)}
          </span>
          <div style={{ flex: 1, fontSize: 12 }}>
            <span style={{ color: 'var(--color-text-tertiary)', marginRight: 6 }}>{a.kind.replace(/_/g, ' ')}</span>
            <span>{a.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────── Helpers ─────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>;
}

function Row({ label, value, muted, bold, borderTop }: { label: string; value: string; muted?: boolean; bold?: boolean; borderTop?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        padding: '6px 0',
        borderTop: borderTop ? '0.5px solid var(--color-border-tertiary)' : 0,
        marginTop: borderTop ? 6 : 0,
      }}
    >
      <span style={{ flex: 1, fontWeight: bold ? 500 : 400, fontSize: 13 }}>{label}</span>
      <span
        className="mono"
        style={{
          fontWeight: bold ? 500 : 400,
          fontSize: 13,
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

function StubPanel({ title, body, body2 }: { title: string; body: string; body2?: string }) {
  return (
    <div
      style={{
        padding: 16,
        border: '0.5px dashed var(--color-border-tertiary)',
        borderRadius: 6,
        background: 'var(--color-background-tertiary)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>{body}</div>
      {body2 && (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.55 }}>
          {body2}
        </div>
      )}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: '48px 0 0 0',
  background: 'rgba(15, 24, 54, 0.12)',
  zIndex: 44,
};

const paneStyle: React.CSSProperties = {
  width: 720,
  maxWidth: '100vw',
};
