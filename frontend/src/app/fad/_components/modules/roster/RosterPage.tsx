'use client';

import type { FormEvent } from 'react';
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
import {
  loadRosterWeek,
  publishRosterWeek,
  saveRosterWeek,
  type ApiRosterWeek,
} from '../../../_data/rosterClient';
import { useT } from '../../../_i18n/useT';
import type { Task } from '../../../_data/tasks';
import { TASK_PROPERTIES_SHIM } from '../../../_data/properties';
import { loadOperationsStaffUsers, type OperationsStaffUser } from '../../../_data/operationsStaffClient';
import {
  sendOperationsConsultMessage,
  type OperationsConsultActionSuggestion,
  type OperationsConsultHistoryMessage,
} from '../../../_data/operationsConsultClient';
import { useApiTasksPage } from '../../../_data/useApiTasks';
import { useCurrentUserId, useJwtRawUserId, usePermissions } from '../../usePermissions';
import { fireToast } from '../../Toaster';
import { IconChevron, IconSend, IconSparkle } from '../../icons';

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CellOption {
  key: string;
  label: string;
  availability: Availability;
  zone: Zone | null;
}

interface RosterAgentSuggestion {
  userId: string;
  staffId?: string;
  staffName: string;
  date: string;
  availability: Availability;
  zone: Zone | null;
  taskCount: number;
  reason: string;
}

interface RosterConsultMessage extends OperationsConsultHistoryMessage {
  id: string;
  actions?: OperationsConsultActionSuggestion[];
  meta?: string;
}

const CELL_OPTIONS: CellOption[] = [
  { key: 'on-null', label: 'On', availability: 'on', zone: null },
  { key: 'on-north', label: 'North', availability: 'on', zone: 'north' },
  { key: 'on-west', label: 'West', availability: 'on', zone: 'west' },
  { key: 'standby', label: 'Stand-by', availability: 'standby', zone: null },
  { key: 'off', label: 'Off', availability: 'off', zone: null },
  { key: 'leave', label: 'Leave', availability: 'leave', zone: null },
];

const PROPERTY_ZONE_BY_CODE = new Map(
  TASK_PROPERTIES_SHIM
    .filter((property) => property.zone === 'north' || property.zone === 'west')
    .map((property) => [property.code, property.zone as Zone]),
);

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
    userId: staffKey(user),
    staffId: user.staffId || user.id,
    date,
    availability: weekend ? 'off' : 'on',
    zone: weekend ? null : zone,
  };
}

function cellKey(userId: string, date: string): string {
  return `${userId}:${date}`;
}

function staffKey(user: OperationsStaffUser): string {
  return user.staffId || user.id;
}

function statusLabel(status?: ApiRosterWeek['status']): string {
  if (status === 'published') return 'Published';
  if (status === 'archived') return 'Archived';
  return 'Draft';
}

function taskZone(task: Task): Zone | null {
  return task.propertyCode ? PROPERTY_ZONE_BY_CODE.get(task.propertyCode) ?? null : null;
}

function staffZone(user: OperationsStaffUser): Zone | null {
  return user.zone === 'north' || user.zone === 'west' ? user.zone : null;
}

function dominantZone(tasks: Task[], fallback: Zone | null): Zone | null {
  const counts = tasks.reduce<Record<Zone, number>>((acc, task) => {
    const zone = taskZone(task);
    if (zone) acc[zone] += 1;
    return acc;
  }, { north: 0, west: 0 });
  if (counts.north === 0 && counts.west === 0) return fallback;
  return counts.north >= counts.west ? 'north' : 'west';
}

function sameRosterCell(a: RosterDay | undefined, b: Pick<RosterDay, 'availability' | 'zone'>): boolean {
  if (!a) return false;
  return a.availability === b.availability && (a.zone ?? null) === (b.zone ?? null);
}

function buildRosterAgentPlan(input: {
  dates: string[];
  staff: OperationsStaffUser[];
  tasks: Task[];
  currentCells: Map<string, RosterDay>;
}): RosterAgentSuggestion[] {
  const weeklyAssignedLoad = new Map<string, number>();
  for (const user of input.staff) weeklyAssignedLoad.set(staffKey(user), 0);
  for (const task of input.tasks) {
    for (const user of input.staff) {
      const ids = [user.id, user.userId, user.staffId].filter(Boolean);
      if (ids.some((id) => task.assigneeIds.includes(id as string))) {
        weeklyAssignedLoad.set(staffKey(user), (weeklyAssignedLoad.get(staffKey(user)) || 0) + 1);
      }
    }
  }

  const suggestions: RosterAgentSuggestion[] = [];
  for (const date of input.dates) {
    const dayTasks = input.tasks.filter((task) => task.dueDate === date);
    const dayZone = dominantZone(dayTasks, null);
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = dayOfWeek === 0 || dayOfWeek === 6;
    const neededCoverage = Math.min(
      input.staff.length,
      dayTasks.length === 0 ? 0 : Math.max(1, Math.ceil(dayTasks.length / 4)),
    );
    const ranked = [...input.staff].sort((a, b) => {
      const aAssigned = dayTasks.filter((task) => [a.id, a.userId, a.staffId].filter(Boolean).some((id) => task.assigneeIds.includes(id as string))).length;
      const bAssigned = dayTasks.filter((task) => [b.id, b.userId, b.staffId].filter(Boolean).some((id) => task.assigneeIds.includes(id as string))).length;
      const aZone = staffZone(a);
      const bZone = staffZone(b);
      return (
        bAssigned - aAssigned ||
        Number(bZone === dayZone) - Number(aZone === dayZone) ||
        (weeklyAssignedLoad.get(staffKey(a)) || 0) - (weeklyAssignedLoad.get(staffKey(b)) || 0) ||
        a.name.localeCompare(b.name)
      );
    });
    const coverage = new Set(ranked.slice(0, neededCoverage).map((user) => staffKey(user)));

    for (const user of input.staff) {
      const key = staffKey(user);
      const current = input.currentCells.get(cellKey(key, date));
      if (current?.availability === 'leave') continue;

      const userTasks = dayTasks.filter((task) => [user.id, user.userId, user.staffId].filter(Boolean).some((id) => task.assigneeIds.includes(id as string)));
      const userZone = dominantZone(userTasks, staffZone(user) || dayZone);
      const next: Pick<RosterDay, 'availability' | 'zone'> = userTasks.length > 0
        ? { availability: 'on', zone: userZone }
        : coverage.has(key)
          ? { availability: 'on', zone: staffZone(user) || dayZone }
          : weekend
            ? { availability: 'off', zone: null }
            : { availability: 'on', zone: staffZone(user) };

      if (sameRosterCell(current, next)) continue;

      suggestions.push({
        userId: key,
        staffId: user.staffId || user.id,
        staffName: user.name,
        date,
        availability: next.availability,
        zone: next.zone ?? null,
        taskCount: userTasks.length,
        reason: userTasks.length > 0
          ? `${userTasks.length} assigned task${userTasks.length === 1 ? '' : 's'} on this day.`
          : coverage.has(key)
            ? `${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'} need coverage.`
            : weekend
              ? 'Weekend with no assigned task load.'
              : 'Weekday base coverage using staff zone.',
      });
    }
  }
  return suggestions.slice(0, 80);
}

function rosterConsultNotes(input: {
  weekStart: string;
  weekEnd: string;
  dirty: boolean;
  rosterStatus?: ApiRosterWeek['status'];
  staff: OperationsStaffUser[];
  dates: string[];
  currentCells: Map<string, RosterDay>;
  draft: RosterAgentSuggestion[];
  workload: WorkloadSummary;
}): string {
  const staffRows = input.staff.slice(0, 10).map((user) => {
    const key = staffKey(user);
    const days = input.dates.map((date) => {
      const cell = input.currentCells.get(cellKey(key, date));
      if (!cell) return `${date.slice(5)}:missing`;
      const zone = cell.zone ? `/${cell.zone}` : '';
      return `${date.slice(5)}:${cell.availability}${zone}`;
    }).join(', ');
    return `${user.name}: ${days}`;
  });
  const draftRows = input.draft.slice(0, 12).map((item) => (
    `${item.date}: ${item.staffName} -> ${item.availability}${item.zone ? `/${item.zone}` : ''} (${item.reason})`
  ));
  return [
    `Roster week ${input.weekStart} to ${input.weekEnd}.`,
    `Roster status: ${input.rosterStatus || 'draft'}; unsaved edits: ${input.dirty ? 'yes' : 'no'}.`,
    `Workload: ${input.workload.total} tasks, ${input.workload.unassignedCount} unassigned, ${input.workload.priorityCount} urgent/high.`,
    `Current roster cells: ${staffRows.join(' | ') || 'none loaded'}.`,
    `Visible roster draft: ${draftRows.join(' | ') || 'none'}.`,
  ].join(' ');
}

function RosterFridayConsultPanel({
  weekStart,
  weekEnd,
  dates,
  staff,
  tasks,
  workload,
  currentCells,
  rosterStatus,
  dirty,
  saving,
  canEdit,
  rosterAgentPlan,
  onGenerateDraft,
  onApplyDraft,
  onDiscardDraft,
}: {
  weekStart: string;
  weekEnd: string;
  dates: string[];
  staff: OperationsStaffUser[];
  tasks: Task[];
  workload: WorkloadSummary;
  currentCells: Map<string, RosterDay>;
  rosterStatus?: ApiRosterWeek['status'];
  dirty: boolean;
  saving: boolean;
  canEdit: boolean;
  rosterAgentPlan: RosterAgentSuggestion[];
  onGenerateDraft: () => RosterAgentSuggestion[];
  onApplyDraft: () => void;
  onDiscardDraft: () => void;
}) {
  const [messages, setMessages] = useState<RosterConsultMessage[]>([
    {
      id: 'welcome',
      role: 'friday',
      text: 'I can help review this roster against weekly task load, coverage, zone fit, weekend fairness, standby/off days, and night-shift constraints.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const appendMessage = (message: Omit<RosterConsultMessage, 'id'>) => {
    setMessages((current) => [
      ...current,
      {
        ...message,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    ]);
  };

  const appendFriday = (text: string, extra?: Partial<RosterConsultMessage>) => {
    appendMessage({ role: 'friday', text, ...extra });
  };

  const runDraft = () => {
    const next = onGenerateDraft();
    appendFriday(
      next.length > 0
        ? `Drafted ${next.length} roster cell${next.length === 1 ? '' : 's'} for ${formatWeekLabel(weekStart)}. Review before applying.`
        : 'The roster already matches the visible weekly task load closely enough for this pass.',
    );
  };

  const runApply = () => {
    if (rosterAgentPlan.length === 0) {
      appendFriday('There is no roster draft to apply yet.');
      return;
    }
    onApplyDraft();
    appendFriday('Applied the visible roster draft as unsaved edits. Save draft or publish when ready.');
  };

  const runSuggestedAction = async (type: OperationsConsultActionSuggestion['type']) => {
    if (type === 'draft_schedule') {
      runDraft();
      return;
    }
    if (type === 'apply_schedule_draft') {
      runApply();
      return;
    }
    const prompt = type === 'request_owner_approval'
      ? 'Check whether any roster decision here implies owner approval or guest-impact risk.'
      : 'Review this roster week and suggest the next manual edit. Do not apply anything.';
    await submitConsultPrompt(prompt);
  };

  const submitConsultPrompt = async (promptText: string) => {
    const text = promptText.trim();
    if (!text || loading) return;
    const history = messages
      .filter((message) => message.id !== 'welcome')
      .slice(-8)
      .map(({ role, text: messageText }) => ({ role, text: messageText }));

    appendMessage({ role: 'user', text });
    setLoading(true);
    try {
      const response = await sendOperationsConsultMessage({
        text,
        context: 'roster',
        rangeStart: weekStart,
        rangeEnd: weekEnd,
        plannerMode: 'roster_week',
        scheduledTasks: tasks,
        staff,
        history,
        notes: rosterConsultNotes({
          weekStart,
          weekEnd,
          dates,
          dirty,
          rosterStatus,
          staff,
          currentCells,
          draft: rosterAgentPlan,
          workload,
        }),
      });
      appendFriday(response.response, {
        actions: response.action_suggestions || [],
        meta: response.metadata?.tokenEstimate ? `KB context ~${response.metadata.tokenEstimate.toLocaleString()} tokens` : undefined,
      });
    } catch (e) {
      appendFriday(e instanceof Error ? e.message : 'Friday Consult could not read the roster context.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    setInput('');
    void submitConsultPrompt(text);
  };

  return (
    <section className="ops-consult-panel" aria-label="Friday Consult for roster planning">
      <div className="ops-consult-head">
        <div>
          <div className="ops-mobile-kicker">Friday Consult</div>
          <h3>Roster coverage agent</h3>
          <small>{formatWeekLabel(weekStart)}</small>
        </div>
        <span>
          <IconSparkle size={13} />
          {rosterAgentPlan.length > 0 ? `${rosterAgentPlan.length} cells drafted` : 'Knowledge loaded'}
        </span>
      </div>

      <div className="ops-consult-actions" aria-label="Friday Consult roster quick actions">
        <button className="btn ghost sm" type="button" disabled={!canEdit || saving || staff.length === 0} onClick={runDraft}>
          Draft roster
        </button>
        <button className="btn secondary sm" type="button" disabled={!canEdit || saving || rosterAgentPlan.length === 0} onClick={runApply}>
          Apply draft
        </button>
        <button className="btn ghost sm" type="button" disabled={!canEdit || saving || rosterAgentPlan.length === 0} onClick={onDiscardDraft}>
          Discard draft
        </button>
      </div>

      <div className="ops-consult-thread" aria-live="polite">
        {messages.map((message) => (
          <div className={`ops-consult-message ${message.role}`} key={message.id}>
            <strong>{message.role === 'user' ? 'You' : 'Friday Consult'}</strong>
            <p>{message.text}</p>
            {message.meta && <small>{message.meta}</small>}
            {message.actions && message.actions.length > 0 && (
              <div className="ops-consult-action-suggestions">
                {message.actions.map((action) => (
                  <button
                    key={`${message.id}-${action.type}-${action.label}`}
                    className="btn secondary sm"
                    type="button"
                    disabled={loading || saving}
                    onClick={() => void runSuggestedAction(action.type)}
                    title={action.reason || undefined}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {rosterAgentPlan.length > 0 && (
          <div className="ops-consult-draft">
            {rosterAgentPlan.slice(0, 8).map((item) => (
              <div className="ops-schedule-backlog-row" key={`${item.userId}-${item.date}`}>
                <span>
                  <strong>{formatShortDate(item.date)} · {item.staffName}</strong>
                  <small>{item.availability}{item.zone ? ` · ${ZONE_LABEL[item.zone]}` : ''} · {item.reason}</small>
                </span>
                <span>{item.taskCount} task{item.taskCount === 1 ? '' : 's'}</span>
              </div>
            ))}
            {rosterAgentPlan.length > 8 && (
              <small>+{rosterAgentPlan.length - 8} more roster cell{rosterAgentPlan.length - 8 === 1 ? '' : 's'}</small>
            )}
          </div>
        )}
      </div>

      <form className="ops-consult-compose" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Talk to Friday Consult about coverage, weekend fairness, zones, standby days, or who should be off..."
          rows={2}
        />
        <button className="btn primary sm" type="submit" disabled={loading || !input.trim()}>
          <IconSend size={12} />
          {loading ? 'Reading...' : 'Send'}
        </button>
      </form>
    </section>
  );
}

export function RosterPage() {
  const { role, can } = usePermissions();
  const { t } = useT();
  const currentUserId = useCurrentUserId();
  const rawCurrentUserId = useJwtRawUserId() || currentUserId;
  const isField = role === 'field';
  const canEdit = can('hr_roster', 'write') || can('hr_roster', 'approve');
  const [weekStart, setWeekStart] = useState(() => mondayFor(todayIso()));
  const [staffUsers, setStaffUsers] = useState<OperationsStaffUser[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [rosterWeek, setRosterWeek] = useState<ApiRosterWeek | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<{ userId: string; date: string } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, RosterDay>>({});
  const [rosterAgentPlan, setRosterAgentPlan] = useState<RosterAgentSuggestion[]>([]);
  const [mobileDayIdx, setMobileDayIdx] = useState(0);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const weekEnd = dates[6];
  const tasksPage = useApiTasksPage({
    assignee: role === 'field' ? 'me' : undefined,
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

  useEffect(() => {
    let cancelled = false;
    setRosterLoading(true);
    setRosterError(null);
    setOverrides({});
    setRosterAgentPlan([]);
    setDirty(false);
    void loadRosterWeek(weekStart)
      .then((week) => {
        if (!cancelled) setRosterWeek(week);
      })
      .catch((e) => {
        if (!cancelled) {
          setRosterWeek(null);
          setRosterError(e instanceof Error ? e.message : 'Roster week unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const rosterUsers = useMemo<OperationsStaffUser[]>(() => {
    const byId = new Map<string, OperationsStaffUser>();
    for (const day of rosterWeek?.days || []) {
      const id = day.user_id || day.staff_id;
      if (!id || byId.has(id)) continue;
      const name = day.staff_name || (id === rawCurrentUserId || id === currentUserId ? 'Your roster' : 'Roster staff');
      byId.set(id, {
        id,
        userId: day.user_id || undefined,
        staffId: day.staff_id || undefined,
        name,
        role: null,
        department: null,
        zone: day.zone || null,
        status: 'active',
        canAssign: Boolean(day.user_id),
        initials: initialsFor(name),
      });
    }
    return [...byId.values()];
  }, [currentUserId, rawCurrentUserId, rosterWeek]);

  const visibleUsers = useMemo(() => {
    const source = staffUsers.length > 0 ? staffUsers : rosterUsers;
    const sorted = [...source].sort((a, b) => a.name.localeCompare(b.name));
    if (isField || role === 'commercial_marketing') {
      const ownRows = sorted.filter((user) => [user.id, user.userId, user.staffId].filter(Boolean).some((id) => id === currentUserId || id === rawCurrentUserId));
      return ownRows.length > 0 || staffUsers.length > 0 ? ownRows : sorted;
    }
    return sorted;
  }, [currentUserId, isField, rawCurrentUserId, role, rosterUsers, staffUsers]);

  const savedCells = useMemo(() => {
    const next: Record<string, RosterDay> = {};
    for (const day of rosterWeek?.days || []) {
      const key = day.staff_id || day.user_id;
      if (!key || !day.date || !day.availability) continue;
      next[cellKey(key, day.date)] = {
        id: day.id,
        userId: key,
        staffId: day.staff_id || key,
        date: day.date,
        availability: day.availability,
        zone: day.zone === 'north' || day.zone === 'west' ? day.zone : null,
        leaveType: day.leave_type === 'annual' || day.leave_type === 'sick' || day.leave_type === 'personal' ? day.leave_type : undefined,
        startTime: day.start_time ?? null,
        endTime: day.end_time ?? null,
        notes: day.notes ?? undefined,
        updatedAt: day.updated_at ?? null,
      };
    }
    return next;
  }, [rosterWeek]);

  const findCell = (user: OperationsStaffUser, date: string): RosterDay => {
    const key = staffKey(user);
    return overrides[cellKey(key, date)] || savedCells[cellKey(key, date)] || defaultCell(user, date);
  };

  const updateCell = (user: OperationsStaffUser, date: string, opt: CellOption) => {
    const key = staffKey(user);
    const next: RosterDay = {
      userId: key,
      staffId: user.staffId || user.id,
      date,
      availability: opt.availability,
      zone: opt.zone,
    };
    setOverrides((current) => ({ ...current, [cellKey(key, date)]: next }));
    setRosterAgentPlan([]);
    setDirty(true);
  };

  const persistableUsers = visibleUsers.filter((user) => user.staffId || user.id);
  const collectWeekDays = (): RosterDay[] =>
    persistableUsers.flatMap((user) =>
      dates.map((date) => {
        const cell = findCell(user, date);
        return {
          ...cell,
          userId: staffKey(user),
          staffId: user.staffId || user.id,
        };
      }),
    );
  const currentRosterCells = new Map(collectWeekDays().map((day) => [cellKey(day.userId, day.date), day]));

  const saveDraft = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!canEdit || saving) return rosterWeek;
    if (persistableUsers.length === 0) {
      const msg = 'No HR staff records are available to save.';
      setRosterError(msg);
      if (!silent) fireToast(msg);
      return rosterWeek;
    }
    setSaving(true);
    setRosterError(null);
    try {
      const saved = await saveRosterWeek({ weekStart, days: collectWeekDays() });
      setRosterWeek(saved);
      setOverrides({});
      setDirty(false);
      if (!silent) fireToast('Roster draft saved');
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Roster save failed';
      setRosterError(msg);
      if (!silent) fireToast(msg);
      return rosterWeek;
    } finally {
      setSaving(false);
    }
  };

  const publishWeek = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setRosterError(null);
    try {
      const saved = dirty ? await saveRosterWeek({ weekStart, days: collectWeekDays() }) : rosterWeek;
      if (saved) {
        setRosterWeek(saved);
        setOverrides({});
        setDirty(false);
      }
      const published = await publishRosterWeek(weekStart);
      setRosterWeek(published);
      fireToast('Roster published');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Roster publish failed';
      setRosterError(msg);
      fireToast(msg);
    } finally {
      setSaving(false);
    }
  };

  const workload = useMemo(() => buildWorkload(tasksPage.tasks, dates, visibleUsers), [dates, tasksPage.tasks, visibleUsers]);
  const safeMobileIdx = Math.min(Math.max(mobileDayIdx, 0), Math.max(dates.length - 1, 0));
  const mobileDate = dates[safeMobileIdx];
  const generateRosterAgentPlan = () => {
    const next = buildRosterAgentPlan({
      dates,
      staff: persistableUsers,
      tasks: tasksPage.tasks,
      currentCells: currentRosterCells,
    });
    setRosterAgentPlan(next);
    fireToast(next.length > 0 ? `Friday Consult drafted ${next.length} roster cell${next.length === 1 ? '' : 's'}` : 'Roster already matches the current task load');
    return next;
  };

  const applyRosterAgentPlan = () => {
    if (!canEdit || rosterAgentPlan.length === 0) return;
    setOverrides((current) => {
      const next = { ...current };
      for (const item of rosterAgentPlan) {
        next[cellKey(item.userId, item.date)] = {
          userId: item.userId,
          staffId: item.staffId || item.userId,
          date: item.date,
          availability: item.availability,
          zone: item.zone,
        };
      }
      return next;
    });
    setDirty(true);
    setRosterAgentPlan([]);
    fireToast(`Applied ${rosterAgentPlan.length} Friday Consult roster cell${rosterAgentPlan.length === 1 ? '' : 's'}`);
  };

  const discardRosterAgentPlan = () => {
    setRosterAgentPlan([]);
    fireToast('Friday Consult roster draft discarded');
  };

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
          {t('operations.roster.staffCount', { n: visibleUsers.length }, `HR directory · ${visibleUsers.length} staff`)}
        </span>
        <span className="chip" style={{ fontSize: 11 }}>
          {rosterLoading ? t('operations.roster.loading', 'Loading roster...') : t(`operations.roster.status.${rosterWeek?.status || 'draft'}`, statusLabel(rosterWeek?.status))}
          {dirty ? ` · ${t('operations.roster.unsaved', 'unsaved')}` : ''}
        </span>
        {rosterWeek?.published_at && (
          <span className="chip" style={{ fontSize: 11 }}>
            {t('operations.roster.publishedOn', { date: formatShortDate(rosterWeek.published_at.slice(0, 10)) }, `Published ${formatShortDate(rosterWeek.published_at.slice(0, 10))}`)}
          </span>
        )}
        <button
          className="btn ghost sm"
          disabled={!canEdit || saving || !dirty}
          title={canEdit ? undefined : t('operations.roster.managerOnly', 'Roster edits are manager-only')}
          onClick={() => void saveDraft()}
        >
          {saving ? t('operations.roster.saving', 'Saving...') : t('operations.roster.saveDraft', 'Save draft')}
        </button>
        <button
          className="btn ghost sm"
          disabled={!canEdit || saving || persistableUsers.length === 0}
          title={canEdit ? undefined : t('operations.roster.publishManagerOnly', 'Roster publishing is manager-only')}
          onClick={() => void publishWeek()}
        >
          {t('operations.roster.publish', 'Publish')}
        </button>
      </div>

      {((staffError && visibleUsers.length === 0) || rosterError || tasksPage.error) && (
        <div className="ops-roster-warning">
          {(staffError && visibleUsers.length === 0) || rosterError || tasksPage.error}
        </div>
      )}

      {canEdit && (
        <RosterFridayConsultPanel
          weekStart={weekStart}
          weekEnd={weekEnd}
          dates={dates}
          staff={persistableUsers}
          tasks={tasksPage.tasks}
          workload={workload}
          currentCells={currentRosterCells}
          rosterStatus={rosterWeek?.status}
          dirty={dirty}
          saving={saving}
          canEdit={canEdit}
          rosterAgentPlan={rosterAgentPlan}
          onGenerateDraft={generateRosterAgentPlan}
          onApplyDraft={applyRosterAgentPlan}
          onDiscardDraft={discardRosterAgentPlan}
        />
      )}

      {canEdit && rosterAgentPlan.length > 0 && (
        <div className="ops-roster-warning" style={{ display: 'grid', gap: 8 }}>
          <strong>Friday Consult roster draft · {rosterAgentPlan.length} suggested changes</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {rosterAgentPlan.slice(0, 10).map((item) => (
              <span className="chip" key={`${item.userId}-${item.date}`} style={{ fontSize: 11 }}>
                {formatShortDate(item.date)} · {item.staffName} → {item.zone ? ZONE_LABEL[item.zone] : AVAILABILITY_LABEL[item.availability]}
              </span>
            ))}
            {rosterAgentPlan.length > 10 && <span className="chip" style={{ fontSize: 11 }}>+{rosterAgentPlan.length - 10} more</span>}
          </div>
        </div>
      )}

      <div className="fad-split-pane fad-roster-pane detail-open" style={{ overflow: 'auto' }}>
        {!isField && (
          <div className="fad-split-list ops-roster-side">
            <RosterWorkload
              weekStart={weekStart}
              weekEnd={weekEnd}
              staff={visibleUsers}
              assignableCount={visibleUsers.filter((user) => user.canAssign).length}
              workload={workload}
              loading={tasksPage.loading || rosterLoading}
              rosterStatus={rosterWeek?.status}
              dirty={dirty}
            />
          </div>
        )}

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
                    const key = staffKey(user);
                    const cell = findCell(user, date);
                    const isEditingThis = editing?.userId === key && editing?.date === date;
                    return (
                      <td key={date} style={{ position: 'relative' }}>
                        <RosterCell
                          cell={cell}
                          editable={canEdit}
                          onClick={() => canEdit && setEditing({ userId: key, date })}
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
              {staffUsers.length === 0
                ? t('operations.roster.emptyStaff', 'No active HR staff records loaded.')
                : t('operations.roster.emptyRole', 'No staff visible for this role.')}
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
              const key = staffKey(user);
              const cell = mobileDate ? findCell(user, mobileDate) : undefined;
              const isEditingThis = editing?.userId === key && editing?.date === mobileDate;
              return (
                <li key={user.id} className="fad-roster-day-row">
                  <StaffBadge user={user} compact />
                  <div style={{ position: 'relative', flex: '0 0 50%', maxWidth: 190 }}>
                    {cell && (
                      <RosterCell
                        cell={cell}
                        editable={canEdit}
                        onClick={() => canEdit && mobileDate && setEditing({ userId: key, date: mobileDate })}
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
  const { t } = useT();
  const { label, bg, fg } = describeCell(cell);
  const translatedLabel = cell.availability === 'on' && cell.zone
    ? t(`operations.roster.zone.${cell.zone}`, label)
    : t(`operations.roster.availability.${cell.availability}`, label);
  return (
    <button
      onClick={onClick}
      disabled={!editable}
      className="ops-roster-cell"
      style={{ background: bg, color: fg }}
      title={editable ? t('operations.roster.changeAvailability', 'Change availability') : undefined}
    >
      {translatedLabel}
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
  unassignedCount: number;
  priorityCount: number;
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
  const unassignedCount = tasks.filter((task) => task.assigneeIds.length === 0).length;
  const priorityCount = tasks.filter((task) => task.priority === 'urgent' || task.priority === 'high').length;
  return { byDay, byDepartment, byStaff, unassignedCount, priorityCount, total: tasks.length };
}

function buildRosterReview(workload: WorkloadSummary, staff: OperationsStaffUser[], assignableCount: number): Array<{ tone: 'neutral' | 'warning' | 'danger'; label: string; detail: string }> {
  const busiestDay = [...workload.byDay].sort((a, b) => b.count - a.count)[0];
  const busiestStaff = workload.byStaff.find((row) => row.label !== 'Unassigned');
  const rows: Array<{ tone: 'neutral' | 'warning' | 'danger'; label: string; detail: string }> = [];

  if (workload.unassignedCount > 0) {
    rows.push({ tone: 'danger', label: `${workload.unassignedCount} unassigned`, detail: 'Assign before publishing the week.' });
  }
  if (workload.priorityCount > 0) {
    rows.push({ tone: 'warning', label: `${workload.priorityCount} high priority`, detail: 'Check coverage before field handoff.' });
  }
  if (busiestDay && busiestDay.count > 0) {
    const day = DAY_LABEL[new Date(`${busiestDay.date}T00:00:00Z`).getUTCDay()];
    rows.push({ tone: 'neutral', label: `${day} is busiest`, detail: `${busiestDay.count} task${busiestDay.count === 1 ? '' : 's'} scheduled.` });
  }
  if (busiestStaff && busiestStaff.count > 0) {
    rows.push({ tone: 'neutral', label: `${busiestStaff.label}`, detail: `${busiestStaff.count} assigned task${busiestStaff.count === 1 ? '' : 's'} this week.` });
  }
  if (staff.length > assignableCount) {
    rows.push({ tone: 'warning', label: `${staff.length - assignableCount} login gaps`, detail: 'Link HR staff to app users.' });
  }
  if (rows.length === 0) {
    rows.push({ tone: 'neutral', label: 'No task load', detail: 'No scheduled tasks found for this week.' });
  }
  return rows.slice(0, 4);
}

function RosterWorkload({
  weekStart,
  weekEnd,
  staff,
  assignableCount,
  workload,
  loading,
  rosterStatus,
  dirty,
}: {
  weekStart: string;
  weekEnd: string;
  staff: OperationsStaffUser[];
  assignableCount: number;
  workload: WorkloadSummary;
  loading: boolean;
  rosterStatus?: ApiRosterWeek['status'];
  dirty: boolean;
}) {
  const unlinked = staff.length - assignableCount;
  const reviewRows = buildRosterReview(workload, staff, assignableCount);
  return (
    <div>
      <h3>Roster · {formatWeekLabel(weekStart)}</h3>
      <p>{loading ? 'Loading live task load...' : `${workload.total} scheduled tasks from ${formatShortDate(weekStart)} to ${formatShortDate(weekEnd)}.`}</p>

      <div className="ops-roster-stat-grid">
        <div><strong>{staff.length}</strong><span>active staff</span></div>
        <div><strong>{assignableCount}</strong><span>task-assignable</span></div>
        <div><strong>{unlinked}</strong><span>needs login link</span></div>
        <div><strong>{statusLabel(rosterStatus)}</strong><span>{dirty ? 'unsaved edits' : 'saved state'}</span></div>
      </div>

      <section className="ops-roster-review">
        <h4>Review</h4>
        {reviewRows.map((row) => (
          <div className="ops-roster-review-row" data-tone={row.tone} key={`${row.label}-${row.detail}`}>
            <strong>{row.label}</strong>
            <span>{row.detail}</span>
          </div>
        ))}
      </section>

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
  const { t } = useT();
  return (
    <div className="ops-roster-week-selector">
      <button className="fad-util-btn" onClick={onPrev} title={t('operations.roster.previousWeek', 'Previous week')}>
        <span style={{ display: 'inline-block', transform: 'rotate(180deg)' }}>
          <IconChevron size={11} />
        </span>
      </button>
      <strong>{formatWeekLabel(weekStart)}</strong>
      <button className="fad-util-btn" onClick={onNext} title={t('operations.roster.nextWeek', 'Next week')}>
        <IconChevron size={11} />
      </button>
      <button className="btn ghost sm" onClick={onToday}>{t('operations.roster.today', 'Today')}</button>
    </div>
  );
}
