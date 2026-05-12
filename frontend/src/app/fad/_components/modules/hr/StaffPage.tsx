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
} from '../../../_data/hrClient';

// @demo:logic — Tag: PROD-LOGIC-9 — see frontend/DEMO_CRUFT.md
// Hardcoded demo date. Replace with new Date() (server-aware).
const TODAY = '2026-04-27';

type StatusFilter = 'active' | 'departing' | 'departed' | 'all';
type RoleFilter = TaskUser['role'] | 'all';

function staffStatus(user: TaskUser): 'active' | 'departing' | 'departed' {
  if (!user.endDate) return 'active';
  if (user.endDate < TODAY) return 'departed';
  return 'departing';
}

function staffStatusBadge(status: 'active' | 'departing' | 'departed'): { label: string; bg: string; fg: string } {
  const swatch = toneStyle(staffStatusTone(status));
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
  const [drawerMode, setDrawerMode] = useState<{ kind: 'create' } | { kind: 'edit'; userId: string } | null>(null);

  // Live staff list from FAD HR backend. Falls back to TASK_USERS fixture
  // during loading / when the API is unreachable, so the page never blanks.
  const { staff: liveStaff, refetch: refetchStaff } = useStaff();
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
            {(['active', 'departing', 'departed', 'all'] as const).map((s) => (
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
            canBulkReassign={can('hr_staff', 'write')}
            onEdit={() => setDrawerMode({ kind: 'edit', userId: selected.id })}
            onAfterChange={bumpRev}
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
  canBulkReassign,
  onEdit,
  onAfterChange,
}: {
  user: TaskUser;
  canEdit: boolean;
  canBulkReassign: boolean;
  onEdit: () => void;
  onAfterChange: () => void;
}) {
  const status = staffStatus(user);
  const openTasks = TASKS.filter((t) => t.assigneeIds.includes(user.id) && t.status !== 'completed' && t.status !== 'cancelled');
  // reassignTo still reads TASK_USERS — the operations module isn't live-wired
  // yet, so the destinations for task-reassignment stay fixture-driven.
  const reassignTo = TASK_USERS.filter((u) => u.role === 'field' && u.id !== user.id && u.active);
  const [reassignTarget, setReassignTarget] = useState<string>('');

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
        {canEdit && (
          <button className="btn primary sm" onClick={onEdit}>Edit</button>
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
