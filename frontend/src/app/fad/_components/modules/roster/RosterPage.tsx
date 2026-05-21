'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AVAILABILITY_COLOR,
  AVAILABILITY_LABEL,
  ZONE_COLOR,
  ZONE_LABEL,
  type Availability,
  type RosterDay,
  type Zone,
} from '../../../_data/roster';
import type { Task } from '../../../_data/tasks';
import { loadOperationsStaffUsers, type OperationsStaffUser } from '../../../_data/operationsStaffClient';
import { useApiTasksPage } from '../../../_data/useApiTasks';
import { useCurrentUserId, usePermissions } from '../../usePermissions';
import { fireToast } from '../../Toaster';
import { IconChevron } from '../../icons';

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CellOption {
  key: string;
  label: string;
  availability: Availability;
  zone: Zone | null;
}

const CELL_OPTIONS: CellOption[] = [
  { key: 'on-null', label: 'On', availability: 'on', zone: null },
  { key: 'on-north', label: 'North', availability: 'on', zone: 'north' },
  { key: 'on-west', label: 'West', availability: 'on', zone: 'west' },
  { key: 'standby', label: 'Stand-by', availability: 'standby', zone: null },
  { key: 'off', label: 'Off', availability: 'off', zone: null },
  { key: 'leave', label: 'Leave', availability: 'leave', zone: null },
];

function todayIso(): string {
  const now = new Date();
  const localMidnight = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localMidnight.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

function mondayFor(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = d.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function formatShortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatWeekLabel(weekStart: string): string {
  return `${formatShortDate(weekStart)} - ${formatShortDate(addDays(weekStart, 6))}`;
}

function staffDisplayRole(user: OperationsStaffUser): string {
  return [user.role, user.department, user.zone].filter(Boolean).join(' · ') || 'Staff';
}

function defaultCell(user: OperationsStaffUser, date: string): RosterDay {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = day === 0 || day === 6;
  const zone = user.zone === 'north' || user.zone === 'west' ? user.zone : null;
  return {
    userId: user.id,
    date,
    availability: weekend ? 'off' : 'on',
    zone: weekend ? null : zone,
  };
}

function cellKey(userId: string, date: string): string {
  return `${userId}:${date}`;
}

export function RosterPage() {
  const { role, can } = usePermissions();
  const currentUserId = useCurrentUserId();
  const canEdit = can('hr_roster', 'write') || can('hr_roster', 'approve');
  const [weekStart, setWeekStart] = useState(() => mondayFor(todayIso()));
  const [staffUsers, setStaffUsers] = useState<OperationsStaffUser[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ userId: string; date: string } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, RosterDay>>({});
  const [mobileDayIdx, setMobileDayIdx] = useState(0);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const weekEnd = dates[6];
  const tasksPage = useApiTasksPage({
    dueAfter: weekStart,
    dueBefore: weekEnd,
    limit: 500,
    sort: 'dueDate',
    dir: 'asc',
  });

  useEffect(() => {
    let cancelled = false;
    void loadOperationsStaffUsers()
      .then((users) => {
        if (!cancelled) {
          setStaffUsers(users.filter((user) => !/(external|guest|owner)/i.test(user.role || '')));
          setStaffError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setStaffUsers([]);
          setStaffError(e instanceof Error ? e.message : 'HR staff directory unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleUsers = useMemo(() => {
    const sorted = [...staffUsers].sort((a, b) => a.name.localeCompare(b.name));
    if (role === 'field' || role === 'commercial_marketing') {
      return sorted.filter((user) => user.id === currentUserId || user.userId === currentUserId);
    }
    return sorted;
  }, [currentUserId, role, staffUsers]);

  const findCell = (user: OperationsStaffUser, date: string): RosterDay =>
    overrides[cellKey(user.id, date)] || defaultCell(user, date);

  const updateCell = (user: OperationsStaffUser, date: string, opt: CellOption) => {
    const next: RosterDay = {
      userId: user.id,
      date,
      availability: opt.availability,
      zone: opt.zone,
    };
    setOverrides((current) => ({ ...current, [cellKey(user.id, date)]: next }));
  };

  const workload = useMemo(() => buildWorkload(tasksPage.tasks, dates, visibleUsers), [dates, tasksPage.tasks, visibleUsers]);
  const safeMobileIdx = Math.min(Math.max(mobileDayIdx, 0), Math.max(dates.length - 1, 0));
  const mobileDate = dates[safeMobileIdx];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="ops-roster-header">
        <WeekSelector
          weekStart={weekStart}
          onPrev={() => setWeekStart(addDays(weekStart, -7))}
          onNext={() => setWeekStart(addDays(weekStart, 7))}
          onToday={() => setWeekStart(mondayFor(todayIso()))}
        />
        <span className="chip" style={{ fontSize: 11 }}>
          HR directory · {visibleUsers.length} staff
        </span>
        <button
          className="btn ghost sm"
          disabled={!canEdit}
          title={canEdit ? undefined : 'Roster publishing is manager-only'}
          onClick={() => fireToast('Roster publish needs the /api/hr/roster persistence endpoint before it can lock a week.')}
        >
          Publish
        </button>
      </div>

      {(staffError || tasksPage.error) && (
        <div className="ops-roster-warning">
          {staffError || tasksPage.error}
        </div>
      )}

      <div className="fad-split-pane fad-roster-pane" style={{ overflow: 'auto' }}>
        <div className="fad-split-list ops-roster-side">
          <RosterWorkload
            weekStart={weekStart}
            weekEnd={weekEnd}
            staff={visibleUsers}
            assignableCount={visibleUsers.filter((user) => user.canAssign).length}
            workload={workload}
            loading={tasksPage.loading}
          />
        </div>

        <div className="fad-split-detail fad-roster-grid-desktop ops-roster-grid">
          <table>
            <thead>
              <tr>
                <th>Staff</th>
                {dates.map((date) => {
                  const dt = new Date(`${date}T00:00:00Z`);
                  return (
                    <th key={date}>
                      <div>{DAY_LABEL[dt.getUTCDay()]}</div>
                      <div className="mono">{date.slice(8)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <StaffBadge user={user} />
                  </td>
                  {dates.map((date) => {
                    const cell = findCell(user, date);
                    const isEditingThis = editing?.userId === user.id && editing?.date === date;
                    return (
                      <td key={date} style={{ position: 'relative' }}>
                        <RosterCell
                          cell={cell}
                          editable={canEdit}
                          onClick={() => canEdit && setEditing({ userId: user.id, date })}
                        />
                        {isEditingThis && (
                          <CellEditPopover
                            cell={cell}
                            onSelect={(opt) => {
                              updateCell(user, date, opt);
                              setEditing(null);
                            }}
                            onClose={() => setEditing(null)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleUsers.length === 0 && (
            <div className="ops-roster-empty">
              {staffUsers.length === 0 ? 'No active HR staff records loaded.' : 'No staff visible for this role.'}
            </div>
          )}
        </div>

        <div className="fad-split-detail fad-roster-grid-mobile ops-roster-mobile">
          <div className="fad-roster-day-pager">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setMobileDayIdx(Math.max(safeMobileIdx - 1, 0))}
              disabled={safeMobileIdx === 0}
              aria-label="Previous day"
            >
              ‹
            </button>
            <div className="fad-roster-day-label">
              <div>{mobileDate ? DAY_LABEL[new Date(`${mobileDate}T00:00:00Z`).getUTCDay()] : ''}</div>
              <strong>{mobileDate ? formatShortDate(mobileDate) : ''}</strong>
            </div>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setMobileDayIdx(Math.min(safeMobileIdx + 1, dates.length - 1))}
              disabled={safeMobileIdx >= dates.length - 1}
              aria-label="Next day"
            >
              ›
            </button>
          </div>

          <ul className="fad-roster-day-list">
            {visibleUsers.map((user) => {
              const cell = mobileDate ? findCell(user, mobileDate) : undefined;
              const isEditingThis = editing?.userId === user.id && editing?.date === mobileDate;
              return (
                <li key={user.id} className="fad-roster-day-row">
                  <StaffBadge user={user} compact />
                  <div style={{ position: 'relative', flex: '0 0 50%', maxWidth: 190 }}>
                    {cell && (
                      <RosterCell
                        cell={cell}
                        editable={canEdit}
                        onClick={() => canEdit && mobileDate && setEditing({ userId: user.id, date: mobileDate })}
                      />
                    )}
                    {isEditingThis && cell && mobileDate && (
                      <CellEditPopover
                        cell={cell}
                        onSelect={(opt) => {
                          updateCell(user, mobileDate, opt);
                          setEditing(null);
                        }}
                        onClose={() => setEditing(null)}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StaffBadge({ user, compact = false }: { user: OperationsStaffUser; compact?: boolean }) {
  return (
    <div className="ops-roster-staff">
      <span>{user.initials || initialsFor(user.name)}</span>
      <div>
        <strong>{compact ? user.name.split(' ')[0] : user.name}</strong>
        {!compact && <small>{staffDisplayRole(user)}{!user.canAssign ? ' · no login link' : ''}</small>}
      </div>
    </div>
  );
}

function RosterCell({
  cell,
  editable,
  onClick,
}: {
  cell: RosterDay;
  editable: boolean;
  onClick: () => void;
}) {
  const { label, bg, fg } = describeCell(cell);
  return (
    <button
      onClick={onClick}
      disabled={!editable}
      className="ops-roster-cell"
      style={{ background: bg, color: fg }}
      title={editable ? 'Change availability' : undefined}
    >
      {label}
    </button>
  );
}

function describeCell(cell: RosterDay): { label: string; bg: string; fg: string } {
  if (cell.availability === 'on' && cell.zone) {
    const color = ZONE_COLOR[cell.zone];
    return { label: ZONE_LABEL[cell.zone], bg: color.bg, fg: color.fg };
  }
  const color = AVAILABILITY_COLOR[cell.availability];
  return { label: AVAILABILITY_LABEL[cell.availability], bg: color.bg, fg: color.fg };
}

function CellEditPopover({
  cell,
  onSelect,
  onClose,
}: {
  cell: RosterDay;
  onSelect: (opt: CellOption) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={onClose} />
      <div className="fad-dropdown ops-roster-popover">
        {CELL_OPTIONS.map((opt) => {
          const isCurrent = cell.availability === opt.availability && (cell.zone ?? null) === (opt.zone ?? null);
          return (
            <button
              key={opt.key}
              type="button"
              className="fad-dropdown-item"
              onClick={() => onSelect(opt)}
              style={{ background: isCurrent ? 'var(--color-background-tertiary)' : undefined }}
            >
              {opt.label}
              {isCurrent && <span style={{ marginLeft: 'auto' }}>✓</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

interface WorkloadSummary {
  byDay: Array<{ date: string; count: number }>;
  byDepartment: Array<{ label: string; count: number }>;
  byStaff: Array<{ label: string; count: number }>;
  total: number;
}

function buildWorkload(tasks: Task[], dates: string[], staff: OperationsStaffUser[]): WorkloadSummary {
  const staffNameById = new Map(staff.map((user) => [user.id, user.name]));
  const byDay = dates.map((date) => ({ date, count: tasks.filter((task) => task.dueDate === date).length }));
  const byDepartment = Object.entries(tasks.reduce<Record<string, number>>((acc, task) => {
    const key = task.department || 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const byStaff = Object.entries(tasks.reduce<Record<string, number>>((acc, task) => {
    task.assigneeIds.forEach((id, index) => {
      const label = task.assigneeNames?.[index] || staffNameById.get(id) || 'Assigned user';
      acc[label] = (acc[label] || 0) + 1;
    });
    if (task.assigneeIds.length === 0) acc.Unassigned = (acc.Unassigned || 0) + 1;
    return acc;
  }, {})).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  return { byDay, byDepartment, byStaff, total: tasks.length };
}

function RosterWorkload({
  weekStart,
  weekEnd,
  staff,
  assignableCount,
  workload,
  loading,
}: {
  weekStart: string;
  weekEnd: string;
  staff: OperationsStaffUser[];
  assignableCount: number;
  workload: WorkloadSummary;
  loading: boolean;
}) {
  const unlinked = staff.length - assignableCount;
  return (
    <div>
      <h3>Roster · {formatWeekLabel(weekStart)}</h3>
      <p>{loading ? 'Loading live task load...' : `${workload.total} scheduled tasks from ${formatShortDate(weekStart)} to ${formatShortDate(weekEnd)}.`}</p>

      <div className="ops-roster-stat-grid">
        <div><strong>{staff.length}</strong><span>active staff</span></div>
        <div><strong>{assignableCount}</strong><span>task-assignable</span></div>
        <div><strong>{unlinked}</strong><span>needs login link</span></div>
      </div>

      <RosterBars title="Tasks by day" rows={workload.byDay.map((day) => ({ label: DAY_LABEL[new Date(`${day.date}T00:00:00Z`).getUTCDay()], count: day.count }))} />
      <RosterBars title="By department" rows={workload.byDepartment} />
      <RosterBars title="By assignee" rows={workload.byStaff} />
    </div>
  );
}

function RosterBars({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="ops-roster-bars">
      <h4>{title}</h4>
      {rows.length === 0 && <span>No tasks.</span>}
      {rows.map((row) => (
        <div key={row.label} className="ops-roster-bar-row">
          <span>{row.label}</span>
          <div><i style={{ width: `${(row.count / max) * 100}%` }} /></div>
          <strong>{row.count}</strong>
        </div>
      ))}
    </section>
  );
}

function WeekSelector({
  weekStart,
  onPrev,
  onNext,
  onToday,
}: {
  weekStart: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="ops-roster-week-selector">
      <button className="fad-util-btn" onClick={onPrev} title="Previous week">
        <span style={{ display: 'inline-block', transform: 'rotate(180deg)' }}>
          <IconChevron size={11} />
        </span>
      </button>
      <strong>{formatWeekLabel(weekStart)}</strong>
      <button className="fad-util-btn" onClick={onNext} title="Next week">
        <IconChevron size={11} />
      </button>
      <button className="btn ghost sm" onClick={onToday}>Today</button>
    </div>
  );
}
