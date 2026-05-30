'use client';

import { useMemo, useState } from 'react';
import { TASK_USERS, type TaskUser } from '../../../_data/tasks';
import { ROLE_LABEL } from '../../../_data/permissions';
import { useCurrentUserId, usePermissions } from '../../usePermissions';
import { StaffDrawer } from './StaffDrawer';
import { IconPlus } from '../../icons';
import { fireToast } from '../../Toaster';
import { TASKS } from '../../../_data/tasks';
import { staffStatusTone, toneStyle } from '../../palette';
import {
  useStaff,
  staffToTaskUserLike,
  createStaff,
  archiveStaff as apiArchiveStaff,
  reactivateStaff as apiReactivateStaff,
} from '../../../_data/hrClient';

// T1.9 (2026-05-25): TODAY gating — wall clock in live-only mode,
// fixture anchor (2026-04-27) when the demo flag is on so seed staff
// keep their expected status (departing / departed buckets).
import { liveOnlyMode } from '../../../_data/demoMode';
function getToday(): string {
  return liveOnlyMode() ? new Date().toISOString().slice(0, 10) : '2026-04-27';
}

type StatusFilter = 'active' | 'departing' | 'departed' | 'archived' | 'all';
type StaffLifecycle = 'active' | 'departing' | 'departed' | 'archived';
type RoleFilter = TaskUser['role'] | 'all';

function staffStatus(user: TaskUser): StaffLifecycle {
  // Backend Staff has `active: boolean` after staffToTaskUserLike adapts it;
  // an `active: false` row is archived. Fixture TaskUsers default `active`
  // to true so the fixture fallback keeps showing as active here.
  if (user.active === false) return 'archived';
  if (!user.endDate) return 'active';
  if (user.endDate < getToday()) return 'departed';
  return 'departing';
}

function staffStatusBadge(status: StaffLifecycle): { label: string; bg: string; fg: string } {
  // Tone palette doesn't have a dedicated 'archived' swatch; reuse the
  // 'departed' tone (also a terminal lifecycle state, also rendered with
  // a muted look) so the badge stays consistent without a palette edit.
  const tone = status === 'archived' ? 'departed' : status;
  const swatch = toneStyle(staffStatusTone(tone));
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return { label, bg: swatch.background, fg: swatch.color };
}

export function StaffPage() {
  const { role, can } = usePermissions();
  const currentUserId = useCurrentUserId();
  const canManage = can('hr_staff', 'write');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; userId: string; initial?: Partial<TaskUser> }
    | null
  >(null);

  // Live staff list from FAD HR backend. Falls back to TASK_USERS fixture
  // during loading / when the API is unreachable, so the page never blanks.
  // When the 'Archived' filter is active, refetch with status=archived so
  // archived rows are included (backend omits them by default).
  const apiStatus = statusFilter === 'archived' ? 'archived' : undefined;
  const { staff: liveStaff, refetch: refetchStaff } = useStaff(apiStatus);
  const liveAdapted = useMemo(
    () => (liveStaff ? liveStaff.map(staffToTaskUserLike) : null),
    [liveStaff],
  );
  const sourceStaff = liveAdapted ?? TASK_USERS;
  const bumpRev = refetchStaff;

  const visibleStaff = useMemo(() => {
    let staff = sourceStaff.filter((u) => u.role !== 'external');

    // Field role: only see own row
    if (role === 'field') {
      staff = staff.filter((u) => u.id === currentUserId);
    } else if (role === 'commercial_marketing') {
      staff = staff.filter((u) => u.id === currentUserId);
    }

    if (statusFilter !== 'all') {
      staff = staff.filter((u) => staffStatus(u) === statusFilter);
    }
    if (roleFilter !== 'all') {
      staff = staff.filter((u) => u.role === roleFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      staff = staff.filter((u) => u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }
    return staff;
  }, [statusFilter, roleFilter, search, role, currentUserId, sourceStaff]);

  const selected = sourceStaff.find((u) => u.id === selectedId) ?? visibleStaff[0];

  return (
    <div className={'fad-split-pane' + (detailOpen ? ' detail-open' : '')}>
      {/* Left list */}
      <div className="fad-split-list" style={{ width: 360, borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 12, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <input
            type="search"
            placeholder="Search staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', fontSize: 13, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {(['active', 'departing', 'departed', 'archived', 'all'] as const).map((s) => (
              <button
                key={s}
                className={'inbox-chip' + (statusFilter === s ? ' active' : '')}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button className={'inbox-chip' + (roleFilter === 'all' ? ' active' : '')} onClick={() => setRoleFilter('all')}>
              All roles
            </button>
            {(['director', 'commercial_marketing', 'ops_manager', 'field'] as const).map((r) => (
              <button
                key={r}
                className={'inbox-chip' + (roleFilter === r ? ' active' : '')}
                onClick={() => setRoleFilter(r)}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {visibleStaff.map((u) => {
            const status = staffStatus(u);
            const badge = staffStatusBadge(status);
            const isSelected = selected?.id === u.id;
            return (
              <button
                key={u.id}
                onClick={() => { setSelectedId(u.id); setDetailOpen(true); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
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
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    background: u.avatarColor,
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {u.initials}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    {ROLE_LABEL[u.role]}
                    {u.homeZone && ` · ${u.homeZone}`}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: badge.bg,
                    color: badge.fg,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {badge.label}
                </span>
              </button>
            );
          })}
          {visibleStaff.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No staff match filters.
            </div>
          )}
        </div>
        {canManage && (
          <div style={{ padding: 10, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
            <button
              className="btn primary sm"
              onClick={() => setDrawerMode({ kind: 'create' })}
              style={{ width: '100%' }}
            >
              <IconPlus size={12} /> Add staff
            </button>
          </div>
        )}
      </div>

      {/* Right detail */}
      <div className="fad-split-detail" style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <button
          type="button"
          className="btn ghost sm fad-split-back"
          onClick={() => setDetailOpen(false)}
        >
          ← Back to staff
        </button>
        {selected ? (
          <StaffDetail
            user={selected}
            canEdit={canManage || selected.id === currentUserId}
            canManage={canManage}
            canBulkReassign={can('hr_staff', 'write')}
            onEdit={() => setDrawerMode({ kind: 'edit', userId: selected.id, initial: selected })}
            onAfterChange={bumpRev}
            onAfterArchive={() => { setSelectedId(null); setDetailOpen(false); bumpRev(); }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', marginTop: 60 }}>
            Select a staff member to view details.
          </div>
        )}
      </div>

      {drawerMode && (
        <StaffDrawer
          mode={drawerMode}
          onClose={() => setDrawerMode(null)}
          onSaved={(user) => {
            setDrawerMode(null);
            setSelectedId(user.id);
            bumpRev();
          }}
        />
      )}
    </div>
  );
}

function StaffDetail({
  user,
  canEdit,
  canManage,
  canBulkReassign,
  onEdit,
  onAfterChange,
  onAfterArchive,
}: {
  user: TaskUser;
  canEdit: boolean;
  canManage: boolean;
  canBulkReassign: boolean;
  onEdit: () => void;
  onAfterChange: () => void;
  onAfterArchive: () => void;
}) {
  const status = staffStatus(user);
  const openTasks = TASKS.filter((t) => t.assigneeIds.includes(user.id) && t.status !== 'completed' && t.status !== 'cancelled');
  // reassignTo still reads TASK_USERS — the operations module isn't live-wired
  // yet, so the destinations for task-reassignment stay fixture-driven.
  const reassignTo = TASK_USERS.filter((u) => u.role === 'field' && u.id !== user.id && u.active);
  const [reassignTarget, setReassignTarget] = useState<string>('');
  const [archiveModal, setArchiveModal] = useState(false);
  const [reactivateBusy, setReactivateBusy] = useState(false);

  const doBulkReassign = () => {
    if (!reassignTarget) return;
    let reassigned = 0;
    for (const t of openTasks) {
      const idx = t.assigneeIds.indexOf(user.id);
      if (idx >= 0) {
        t.assigneeIds[idx] = reassignTarget;
        reassigned++;
      }
    }
    fireToast(`Reassigned ${reassigned} task${reassigned === 1 ? '' : 's'} from ${user.name} to ${TASK_USERS.find((u) => u.id === reassignTarget)?.name}`);
    onAfterChange();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <span
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            background: user.avatarColor,
            color: 'white',
            fontSize: 22,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {user.initials}
        </span>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>{user.name}</h2>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {ROLE_LABEL[user.role]}
            {user.homeZone && ` · ${user.homeZone} zone`}
          </div>
          {user.email && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{user.email}</div>
          )}
        </div>
        {canEdit && status !== 'archived' && (
          <button className="btn primary sm" onClick={onEdit}>Edit</button>
        )}
        {canManage && status !== 'archived' && (
          <button
            className="btn ghost sm"
            onClick={() => setArchiveModal(true)}
            style={{ color: 'var(--color-text-danger)' }}
            title="Archive this staff member — removes them from rosters + assignments"
          >
            Archive
          </button>
        )}
        {canManage && status === 'archived' && (
          <button
            className="btn primary sm"
            disabled={reactivateBusy}
            onClick={async () => {
              setReactivateBusy(true);
              try {
                await apiReactivateStaff(user.id);
                fireToast(`${user.name} reactivated`);
                onAfterArchive();
              } catch (e) {
                fireToast(`Reactivate failed · ${e instanceof Error ? e.message : 'unknown error'}`);
              } finally {
                setReactivateBusy(false);
              }
            }}
          >
            {reactivateBusy ? 'Reactivating…' : 'Reactivate'}
          </button>
        )}
      </div>

      {status === 'departing' && (
        <div
          style={{
            padding: 12,
            background: 'var(--color-background-secondary)',
            borderLeft: '3px solid var(--color-text-warning)',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <strong>Departing {user.endDate}</strong>. After that date, this staff member will not appear in roster
          drafts or task assignments. Open tasks: <strong>{openTasks.length}</strong> — reassign before they leave.
        </div>
      )}

      <DetailGrid>
        <DetailCell label="Joined">{user.startDate}</DetailCell>
        {user.endDate && <DetailCell label="End date">{user.endDate}</DetailCell>}
        <DetailCell label="Notification channel">{user.notificationChannel}</DetailCell>
        <DetailCell label="Skills">{user.skills?.join(', ') || '—'}</DetailCell>
        <DetailCell label="Never works">
          {user.weeklyConstraints?.neverWorks?.join(', ') || 'No constraints'}
        </DetailCell>
        <DetailCell label="Open tasks">{openTasks.length}</DetailCell>
      </DetailGrid>

      {status === 'departing' && canBulkReassign && openTasks.length > 0 && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 8,
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 8 }}>Bulk reassign open tasks</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            One-off admin action. Pick a field staff to receive {user.name}'s {openTasks.length} open task{openTasks.length === 1 ? '' : 's'}.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={reassignTarget}
              onChange={(e) => setReassignTarget(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Select reassignee…</option>
              {reassignTo.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.homeZone ?? 'no zone'})
                </option>
              ))}
            </select>
            <button className="btn primary sm" onClick={doBulkReassign} disabled={!reassignTarget}>
              Reassign all
            </button>
          </div>
        </div>
      )}

      {archiveModal && (
        <ArchiveStaffModal
          user={user}
          openTasksCount={openTasks.length}
          onCancel={() => setArchiveModal(false)}
          onDone={() => { setArchiveModal(false); onAfterArchive(); }}
        />
      )}
    </div>
  );
}

function ArchiveStaffModal({
  user,
  openTasksCount,
  onCancel,
  onDone,
}: {
  user: TaskUser;
  openTasksCount: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [lastWorkedDate, setLastWorkedDate] = useState(new Date().toISOString().slice(0, 10));
  const [leaveReason, setLeaveReason] = useState<string>('resigned');
  const [leaveNotes, setLeaveNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!lastWorkedDate || !leaveReason.trim()) return;
    setSubmitting(true);
    try {
      await apiArchiveStaff(user.id, {
        last_worked_date: lastWorkedDate,
        leave_reason: leaveReason,
        leave_notes: leaveNotes.trim() || undefined,
      });
      fireToast(`${user.name} archived`);
      onDone();
    } catch (e) {
      fireToast(`Archive failed · ${e instanceof Error ? e.message : 'unknown error'}`);
      setSubmitting(false);
    }
  };

  return (
    <div className="fad-modal-overlay" style={{ zIndex: 9000 }} onClick={onCancel}>
      <div className="fad-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="fad-modal-head">
          <div className="fad-modal-title">Archive {user.name}?</div>
        </div>
        <div className="fad-modal-body" style={{ padding: 18 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Archived staff are removed from rosters, assignments, and Ask-Friday context.
            {openTasksCount > 0 && (
              <>
                {' '}<strong>{user.name} has {openTasksCount} open task{openTasksCount === 1 ? '' : 's'}.</strong>{' '}
                Reassign them via the Bulk-reassign panel before archiving so nothing falls through.
              </>
            )}
            {' '}You can reactivate them later from the Archived filter.
          </p>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <label style={{ fontSize: 12 }}>
              <div style={{ marginBottom: 4, color: 'var(--color-text-tertiary)' }}>Last worked date</div>
              <input
                type="date"
                value={lastWorkedDate}
                onChange={(e) => setLastWorkedDate(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              <div style={{ marginBottom: 4, color: 'var(--color-text-tertiary)' }}>Reason</div>
              <select
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
              >
                <option value="resigned">Resigned</option>
                <option value="terminated">Terminated</option>
                <option value="end_of_contract">End of contract</option>
                <option value="mutual_separation">Mutual separation</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label style={{ fontSize: 12 }}>
              <div style={{ marginBottom: 4, color: 'var(--color-text-tertiary)' }}>Notes (optional)</div>
              <textarea
                value={leaveNotes}
                onChange={(e) => setLeaveNotes(e.target.value)}
                rows={3}
                placeholder="Context for the HR record…"
                style={{ width: '100%', padding: '6px 10px', fontSize: 13, fontFamily: 'inherit' }}
              />
            </label>
          </div>
        </div>
        <div className="fad-modal-foot">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={submit}
            disabled={submitting || !lastWorkedDate || !leaveReason.trim()}
            style={{ background: 'var(--color-text-danger)', borderColor: 'var(--color-text-danger)' }}
          >
            {submitting ? 'Archiving…' : 'Archive staff'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

function DetailCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--color-background-secondary)',
        borderRadius: 6,
        fontSize: 13,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
          fontWeight: 500,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
