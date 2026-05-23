'use client';

import { useMemo, useState } from 'react';
import { TIME_OFF_REQUESTS, TIME_OFF_STATUS_LABEL, TIME_OFF_TYPE_LABEL, type TimeOffRequest } from '../../../_data/timeOff';
import { TASK_USER_BY_ID } from '../../../_data/tasks';
import { useCurrentUserId, usePermissions } from '../../usePermissions';
import { TimeOffDrawer } from './TimeOffDrawer';
import { IconPlus } from '../../icons';
import { timeOffStatusTone, toneStyle } from '../../palette';
import {
  useTimeOffRequests,
  apiRequestToFixtureShape,
  cancelTimeOffRequest,
  type AdaptedTimeOff,
} from '../../../_data/hrClient';
import { fireToast } from '../../Toaster';

type StatusFilter = TimeOffRequest['status'] | 'all';

function statusBadge(status: TimeOffRequest['status']) {
  const s = toneStyle(timeOffStatusTone(status));
  return { bg: s.background, fg: s.color };
}

export function TimeOffPage() {
  const { role, can } = usePermissions();
  const currentUserId = useCurrentUserId();
  const canApprove = can('hr_time_off', 'approve') || can('hr_time_off', 'write');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [requestDrawer, setRequestDrawer] = useState<{ kind: 'new' } | { kind: 'detail'; id: string } | null>(null);

  // Live time-off requests from FAD HR backend. Falls back to fixture
  // during initial load / when API unreachable so the page never blanks.
  const { requests: liveRequests, refetch: refetchRequests } = useTimeOffRequests();
  const liveAdapted = useMemo(
    () => (liveRequests ? liveRequests.map(apiRequestToFixtureShape) : null),
    [liveRequests],
  );
  const usingLiveRequests = liveAdapted !== null;
  const sourceRequests: TimeOffRequest[] = liveAdapted ?? TIME_OFF_REQUESTS;
  const bumpRev = refetchRequests;

  const visible = useMemo(() => {
    let reqs = [...sourceRequests];

    // Backend already scopes live field/commercial reads to the caller's
    // linked staff record. Fixture fallback still needs client-side scoping.
    if (!usingLiveRequests && (role === 'field' || role === 'commercial_marketing')) {
      reqs = reqs.filter((r) => r.userId === currentUserId);
    }

    if (statusFilter !== 'all') {
      reqs = reqs.filter((r) => r.status === statusFilter);
    }
    return reqs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [statusFilter, role, currentUserId, sourceRequests, usingLiveRequests]);

  const selected = visible.find((r) => r.id === selectedId) ?? visible[0];

  return (
    <div className={'fad-split-pane' + (detailOpen ? ' detail-open' : '')}>
      {/* Left list */}
      <div className="fad-split-list" style={{ width: 380, borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 12, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['pending', 'approved', 'declined', 'all'] as const).map((s) => (
              <button
                key={s}
                className={'inbox-chip' + (statusFilter === s ? ' active' : '')}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : TIME_OFF_STATUS_LABEL[s]}
                {s !== 'all' && (
                  <span style={{ marginLeft: 4, opacity: 0.6 }}>
                    {sourceRequests.filter((r) => {
                      if (r.status !== s) return false;
                      if (usingLiveRequests) return true;
                      return role === 'field' || role === 'commercial_marketing'
                        ? r.userId === currentUserId
                        : true;
                    }).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {visible.map((r) => {
            // Live-data fields fall through to fixture lookup. r is sometimes
            // an AdaptedTimeOff (live) carrying _staffName/_staffAvatarColor;
            // sometimes a fixture row keyed by userId.
            const adapted = r as AdaptedTimeOff;
            const fixtureUser = TASK_USER_BY_ID[r.userId];
            const user = adapted._staffName
              ? {
                  name: adapted._staffName,
                  initials: adapted._staffInitials ?? '??',
                  avatarColor: adapted._staffAvatarColor ?? '#94a3b8',
                }
              : fixtureUser;
            const isSelected = selected?.id === r.id;
            const days = daysBetween(r.startDate, r.endDate);
            const badge = statusBadge(r.status);
            return (
              <button
                key={r.id}
                onClick={() => { setSelectedId(r.id); setDetailOpen(true); }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '12px 14px',
                  width: '100%',
                  textAlign: 'left',
                  border: 0,
                  background: isSelected ? 'var(--color-background-tertiary)' : 'transparent',
                  cursor: 'pointer',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: user?.avatarColor ?? '#94a3b8',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {user?.initials ?? '??'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{user?.name ?? 'Unknown'}</span>
                    <span
                      style={{
                        fontSize: 9,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: badge.bg,
                        color: badge.fg,
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {r.startDate} → {r.endDate} · {days} day{days === 1 ? '' : 's'} · {TIME_OFF_TYPE_LABEL[r.type]}
                  </div>
                  {r.reason && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.reason}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {visible.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No requests in this view.
            </div>
          )}
        </div>
        <div style={{ padding: 10, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          <button
            className="btn primary sm"
            onClick={() => setRequestDrawer({ kind: 'new' })}
            style={{ width: '100%' }}
          >
            <IconPlus size={12} /> New time-off request
          </button>
        </div>
      </div>

      {/* Right detail */}
      <div className="fad-split-detail" style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <button
          type="button"
          className="btn ghost sm fad-split-back"
          onClick={() => setDetailOpen(false)}
        >
          ← Back to time-off
        </button>
        {selected ? (
          <TimeOffDetail
            req={selected}
            canApprove={canApprove}
            currentUserId={currentUserId}
            onAfterDecide={bumpRev}
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', marginTop: 60 }}>
            Select a request to view details.
          </div>
        )}
      </div>

      {requestDrawer && (
        <TimeOffDrawer
          mode={requestDrawer}
          canApprove={canApprove}
          onClose={() => setRequestDrawer(null)}
          onSaved={(req) => {
            setRequestDrawer(null);
            setSelectedId(req.id);
            bumpRev();
          }}
        />
      )}
    </div>
  );
}

function TimeOffDetail({
  req,
  canApprove,
  currentUserId,
  onAfterDecide,
}: {
  req: TimeOffRequest;
  canApprove: boolean;
  currentUserId: string;
  onAfterDecide: () => void;
}) {
  const adapted = req as AdaptedTimeOff;
  const fixtureUser = TASK_USER_BY_ID[req.userId];
  const user = adapted._staffName
    ? {
        name: adapted._staffName,
        initials: adapted._staffInitials ?? '??',
        avatarColor: adapted._staffAvatarColor ?? '#94a3b8',
      }
    : fixtureUser;
  const fixtureReviewer = req.reviewedBy ? TASK_USER_BY_ID[req.reviewedBy] : undefined;
  const reviewer = adapted._reviewerName
    ? { name: adapted._reviewerName }
    : fixtureReviewer;
  const days = daysBetween(req.startDate, req.endDate);
  const [open, setOpen] = useState<'approve' | 'decline' | null>(null);
  const [note, setNote] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  // Requester can cancel their own pending request; managers can also
  // cancel approved/pending on behalf of staff (e.g. corrections). Backend
  // owns the actual authorization; client just hides the button when it
  // wouldn't make sense.
  const isRequester = req.userId === currentUserId;
  const canCancel =
    (req.status === 'pending' && (isRequester || canApprove)) ||
    (req.status === 'approved' && canApprove);

  const doCancel = async () => {
    setCancelBusy(true);
    try {
      await cancelTimeOffRequest(req.id);
      fireToast('Time-off request cancelled');
      setCancelConfirm(false);
      onAfterDecide();
    } catch (e) {
      fireToast(`Cancel failed · ${e instanceof Error ? e.message : 'unknown error'}`);
      setCancelBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            background: user?.avatarColor ?? '#94a3b8',
            color: 'white',
            fontSize: 18,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {user?.initials ?? '??'}
        </span>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{user?.name ?? 'Unknown'}</h2>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {req.startDate} → {req.endDate} · {days} day{days === 1 ? '' : 's'} · {TIME_OFF_TYPE_LABEL[req.type]}
          </div>
        </div>
      </div>

      {req.reason && (
        <div
          style={{
            padding: 12,
            background: 'var(--color-background-secondary)',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
            Reason
          </div>
          {req.reason}
        </div>
      )}

      <div style={{ marginBottom: 16, fontSize: 13 }}>
        <strong>Status:</strong> {TIME_OFF_STATUS_LABEL[req.status]}
        {reviewer && req.reviewedAt && (
          <> by {reviewer.name} on {req.reviewedAt.slice(0, 10)}</>
        )}
      </div>

      {req.reviewNotes && (
        <div
          style={{
            padding: 12,
            background: 'var(--color-background-secondary)',
            borderLeft: '3px solid var(--color-brand-accent)',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
            Reviewer notes
          </div>
          {req.reviewNotes}
        </div>
      )}

      {req.status === 'pending' && canApprove && open === null && !cancelConfirm && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={() => setOpen('approve')}>Approve</button>
          <button className="btn ghost" onClick={() => setOpen('decline')}>Decline</button>
          <button
            className="btn ghost"
            onClick={() => setCancelConfirm(true)}
            style={{ marginLeft: 'auto', color: 'var(--color-text-danger)' }}
          >
            Cancel request
          </button>
        </div>
      )}

      {canCancel && !canApprove && !cancelConfirm && (
        <div style={{ display: 'flex' }}>
          <button
            className="btn ghost"
            onClick={() => setCancelConfirm(true)}
            style={{ color: 'var(--color-text-danger)' }}
          >
            Cancel my request
          </button>
        </div>
      )}

      {cancelConfirm && (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            background: 'var(--color-bg-danger)',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 10 }}>
            Cancel this time-off request? It will be marked <strong>cancelled</strong> and removed from rosters.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              className="btn ghost sm"
              onClick={() => setCancelConfirm(false)}
              disabled={cancelBusy}
            >
              Keep request
            </button>
            <button
              className="btn primary sm"
              onClick={doCancel}
              disabled={cancelBusy}
              style={{ background: 'var(--color-text-danger)', borderColor: 'var(--color-text-danger)' }}
            >
              {cancelBusy ? 'Cancelling…' : 'Cancel request'}
            </button>
          </div>
        </div>
      )}

      {open && (
        <DecisionForm
          req={req}
          decision={open}
          note={note}
          setNote={setNote}
          onCancel={() => { setOpen(null); setNote(''); }}
          onAfter={() => { setOpen(null); setNote(''); onAfterDecide(); }}
        />
      )}
    </div>
  );
}

function DecisionForm({
  req,
  decision,
  note,
  setNote,
  onCancel,
  onAfter,
}: {
  req: TimeOffRequest;
  decision: 'approve' | 'decline';
  note: string;
  setNote: (n: string) => void;
  onCancel: () => void;
  onAfter: () => void;
}) {
  const reviewerId = useCurrentUserId();

  const submit = async () => {
    try {
      const { decideTimeOffRequest } = await import('../../../_data/hrClient');
      await decideTimeOffRequest(req.id, {
        status: decision === 'approve' ? 'approved' : 'rejected',
        review_notes: note || undefined,
      });
      onAfter();
    } catch (e) {
      console.error('[time-off] decide failed:', e);
    }
  };

  return (
    <div
      style={{
        padding: 16,
        marginTop: 16,
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 8,
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 8 }}>
        {decision === 'approve' ? 'Approve request' : 'Decline request'}
      </div>
      {decision === 'approve' && (
        <div
          style={{
            padding: 8,
            background: 'var(--color-background-secondary)',
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            marginBottom: 10,
          }}
        >
          Approving will auto-flip the corresponding roster cells to Leave.
        </div>
      )}
      <textarea
        placeholder={decision === 'approve' ? 'Optional note…' : 'Reason for declining…'}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ width: '100%', minHeight: 60, padding: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={submit}>
          Confirm {decision}
        </button>
      </div>
    </div>
  );
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}
