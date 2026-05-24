'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { CAL_EVENTS, type CalEvent, type FixedCalEvent } from '../../_data/fixtures';
import {
  RESERVATIONS,
  CHANNEL_LABEL,
  PAYOUT_LABEL,
  STATUS_LABEL as RES_STATUS_LABEL,
  formatMoney,
  formatStayWindow,
  notesForReservation,
  type Reservation,
  type ReservationNote,
} from '../../_data/reservations';
import { TASKS, TASK_USERS, TASK_USER_BY_ID, type Task } from '../../_data/tasks';
import { useLiveReservations } from '../../_data/reservationsClient';
import { useApiTasks } from '../../_data/useApiTasks';
import type { FetchTasksPageInput } from '../../_data/tasksClient';
import { liveOnlyMode } from '../../_data/demoMode';
import { addReservationNote, updateReservationTimes } from '../../_data/breezeway';
import { useCurrentUserId } from '../usePermissions';
import { fireToast } from '../Toaster';
import { FilterBar, FilterChip } from '../FilterBar';
import { IconClose, IconPlus, IconRefresh } from '../icons';
import { ModuleHeader } from '../ModuleHeader';
import { useT } from '../../_i18n/useT';
import { CreateTaskDrawer } from './operations/CreateTaskDrawer';
import { MultiCalendarGrid, type CellPrice } from './calendar/MultiCalendarGrid';
import { AvailabilitySearchModal } from './calendar/AvailabilitySearchModal';
import { useLiveProperties } from '../../_data/propertiesClient';
import { useCalendarGrid } from '../../_data/calendarGridClient';

type CalView = 'multi' | 'agenda' | 'day' | 'week' | 'month';

interface ViewDay {
  isoDate: string;
  /** Letter abbrev, e.g. "Mon" — for headers. */
  label: string;
  /** Day-of-month, e.g. "27" — for headers. */
  date: string;
  today: boolean;
  /** True when this day belongs to the focused month (month view only). */
  inFocusMonth: boolean;
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EVENT_TYPES: { id: 'reservation' | 'task' | 'maint' | 'meeting'; label: string; dot: string }[] = [
  { id: 'reservation', label: 'Reservations', dot: 'accent' },
  { id: 'task', label: 'Tasks', dot: 'info' },
  { id: 'maint', label: 'Maintenance', dot: 'amber' },
  { id: 'meeting', label: 'Meetings', dot: 'neutral' },
];

const TYPE_LABEL: Record<CalEvent['type'], string> = {
  checkin: 'Check-in',
  checkout: 'Check-out',
  task: 'Task',
  maint: 'Maintenance',
  meeting: 'Meeting',
};

/** 3-letter channel chip shown inside stay bands so colour isn't the only
 *  signal of source. Matches the channel-legend strip at the foot of the
 *  calendar. */
function channelShort(c: Reservation['channel']): string {
  switch (c) {
    case 'airbnb': return 'AIR';
    case 'booking': return 'BDC';
    case 'vrbo': return 'VRB';
    case 'direct': return 'DIR';
    case 'owner': return 'OWN';
    case 'email': return 'EML';
    default: return '';
  }
}

function eventOpenLabel(type: CalEvent['type']): string {
  switch (type) {
    case 'task':
      return 'Open task';
    case 'maint':
      return 'Open work order';
    case 'meeting':
      return 'Open meeting';
    case 'checkin':
    case 'checkout':
      return 'Open reservation';
  }
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  return next;
}

function startOfWeek(d: Date): Date {
  // Mon-anchored week. JS getDay: 0=Sun, 1=Mon, ..., 6=Sat.
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function computeViewDays(viewDate: Date, view: CalView): ViewDay[] {
  const focusMonth = viewDate.getMonth();
  const make = (d: Date): ViewDay => ({
    isoDate: isoDay(d),
    label: DAY_LABELS[d.getDay()],
    date: String(d.getDate()).padStart(2, '0'),
    today: isoDay(d) === TODAY_ISO,
    inFocusMonth: d.getMonth() === focusMonth,
  });
  if (view === 'day') {
    return [make(viewDate)];
  }
  if (view === 'week' || view === 'agenda') {
    const monday = startOfWeek(viewDate);
    return Array.from({ length: 7 }, (_, i) => make(addDays(monday, i)));
  }
  if (view === 'multi') {
    // 60-day window anchored 7 days before viewDate (so today + recent
    // history + next ~7 weeks are all visible without scrolling).
    const start = addDays(viewDate, -7);
    return Array.from({ length: 60 }, (_, i) => make(addDays(start, i)));
  }
  // month: 5 weeks anchored on Mon-of-week-containing-1st
  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const monday = startOfWeek(firstOfMonth);
  return Array.from({ length: 35 }, (_, i) => make(addDays(monday, i)));
}

function viewSubtitle(viewDate: Date, view: CalView, days: ViewDay[]): string {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleString('en-US', opts);
  if (view === 'day') {
    return fmt(days[0].isoDate, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (view === 'week' || view === 'agenda' || view === 'multi') {
    const first = days[0].isoDate;
    const last = days[days.length - 1].isoDate;
    return `${fmt(first, { month: 'short', day: 'numeric' })} → ${fmt(last, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function dayIndexFor(iso: string, days: ViewDay[]): number {
  return days.findIndex((d) => d.isoDate === iso.slice(0, 10));
}

function eventHour(iso: string, fallback: number): number {
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return fallback;
  if (/T00:00:00(?:\.000)?Z?$/.test(iso)) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.getHours();
}

function previousISODate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return isoDay(d);
}

function reservationToEvents(rsv: Reservation, days: ViewDay[]): CalEvent[] {
  // Used by mobile day-list and DayView to surface check-in / check-out events at
  // their precise hour. WeekView renders these as continuous bars instead.
  const events: CalEvent[] = [];
  const inIdx = dayIndexFor(rsv.checkIn, days);
  const outIdx = dayIndexFor(rsv.checkOut, days);
  if (inIdx >= 0) {
    const hour = eventHour(rsv.checkIn, 15);
    events.push({
      day: inIdx,
      start: hour,
      end: hour + 1,
      type: 'checkin',
      title: `${rsv.guestName.split(' ').slice(-1)[0]} in · ${rsv.propertyCode}`,
      sourceId: rsv.id,
    });
  }
  if (outIdx >= 0) {
    const hour = eventHour(rsv.checkOut, 11);
    events.push({
      day: outIdx,
      start: hour,
      end: hour + 1,
      type: 'checkout',
      title: `${rsv.guestName.split(' ').slice(-1)[0]} out · ${rsv.propertyCode}`,
      sourceId: rsv.id,
    });
  }
  return events;
}

function fixedToEvent(e: FixedCalEvent, days: ViewDay[]): CalEvent | null {
  const idx = dayIndexFor(e.isoDate, days);
  if (idx < 0) return null;
  return { day: idx, start: e.start, end: e.end, type: e.type, title: e.title };
}

interface Stay {
  rsv: Reservation;
  /** Day index of the band's left edge in the visible window (clipped). */
  startIdx: number;
  /** Day index of the band's right edge in the visible window (clipped). */
  endIdx: number;
  /** True when check-in falls within the visible window. */
  startsThisWeek: boolean;
  /** True when check-out falls within the visible window. */
  endsThisWeek: boolean;
}

function computeStaysInWindow(
  days: ViewDay[],
  reservations: Reservation[],
  opts: { includeInquiries?: boolean } = {},
): Stay[] {
  if (days.length === 0) return [];
  const firstISO = days[0].isoDate;
  const lastISO = days[days.length - 1].isoDate;
  const includeInquiries = opts.includeInquiries === true;
  return reservations
    .filter((r) => {
      // Cancellations always out — they're a noise floor.
      if (r.status === 'cancelled') return false;
      // Inquiries + holds are speculative bookings. Default off so the
      // calendar reflects what's actually happening; opt-in via the
      // "Show inquiries" toggle in the toolbar.
      if (!includeInquiries && (r.status === 'inquiry' || r.status === 'hold')) return false;
      const inISO = r.checkIn.slice(0, 10);
      const outISO = r.checkOut.slice(0, 10);
      return outISO > firstISO && inISO <= lastISO;
    })
    .map((r) => {
      const inISO = r.checkIn.slice(0, 10);
      const outISO = r.checkOut.slice(0, 10);
      const lastNightISO = previousISODate(outISO);
      const inIdx = days.findIndex((d) => d.isoDate === inISO);
      const lastNightIdx = days.findIndex((d) => d.isoDate === lastNightISO);
      const outIdx = days.findIndex((d) => d.isoDate === outISO);
      return {
        rsv: r,
        startIdx: inIdx >= 0 ? inIdx : 0,
        endIdx: lastNightIdx >= 0 ? lastNightIdx : days.length - 1,
        startsThisWeek: inIdx >= 0,
        endsThisWeek: outIdx >= 0,
      };
    })
    .filter((s) => s.endIdx >= s.startIdx)
    .sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);
}

function packStays(stays: Stay[]): Stay[][] {
  const rows: Stay[][] = [];
  for (const s of stays) {
    const row = rows.find((r) => r.every((o) => o.endIdx < s.startIdx || o.startIdx > s.endIdx));
    if (row) row.push(s);
    else rows.push([s]);
  }
  return rows;
}

/**
 * Synthesize a calendar event from a task. Returns:
 *  - timed event if the task has an explicit dueTime
 *  - all-day event (start: -1) for untimed tasks — these show in the all-day
 *    strip / mobile-list "All day" group, not in the timed grid.
 */
function taskToEvent(task: Task, days: ViewDay[]): CalEvent | null {
  const idx = dayIndexFor(task.dueDate, days);
  if (idx < 0) return null;
  const title = `${task.propertyCode} · ${task.title}`;
  if (!task.dueTime) {
    return { day: idx, start: -1, end: -1, type: 'task', title, sourceId: task.id, allDay: true };
  }
  const hour = parseInt(task.dueTime.slice(0, 2), 10) || 9;
  return { day: idx, start: hour, end: hour + 1, type: 'task', title, sourceId: task.id };
}

type FilterChipId = 'reservation' | 'task' | 'maint' | 'meeting';

export function CalendarModule() {
  const currentUserId = useCurrentUserId();
  const { t: calT } = useT();
  const demoData = !liveOnlyMode();
  const [tab, setTab] = useState<CalView>(() => (
    typeof window !== 'undefined' && window.innerWidth <= 768 ? 'agenda' : 'multi'
  ));
  // Live properties for the multi-calendar (Phase 5, T4.38). Triggered
  // lazily — only hydrate when the multi tab is the active view.
  const { properties: liveProperties } = useLiveProperties();
  // v0.2: per-cell €PRICE + availability. Only fetched in multi tab.
  const [viewDate, setViewDate] = useState<Date>(() => new Date(`${TODAY_ISO}T12:00:00`));
  const days = useMemo(() => computeViewDays(viewDate, tab), [viewDate, tab]);
  const taskWindowFilter = useMemo<FetchTasksPageInput>(() => ({
    dueAfter: days[0]?.isoDate,
    dueBefore: days[days.length - 1]?.isoDate,
    sort: 'dueDate',
    limit: 500,
  }), [days]);
  const reservationWindowFilter = useMemo(() => ({
    from: days[0]?.isoDate,
    to: days[days.length - 1]?.isoDate,
    dateMode: 'overlap' as const,
    limit: 500,
  }), [days]);
  const {
    reservations: liveReservations,
    loading: reservationsLoading,
    error: reservationsError,
    refetch: refetchReservations,
  } = useLiveReservations(reservationWindowFilter);
  const {
    tasks: liveTasks,
    loading: tasksLoading,
    error: tasksError,
    refetch: refetchTasks,
  } = useApiTasks(taskWindowFilter);
  const sourceReservations = liveReservations ?? (demoData ? RESERVATIONS : []);
  const sourceTasks = demoData ? TASKS : liveTasks;
  const visibleEventTypes = demoData ? EVENT_TYPES : EVENT_TYPES.filter((t) => t.id === 'reservation' || t.id === 'task');
  const [typeFilter, setTypeFilter] = useState<Set<FilterChipId>>(
    new Set(EVENT_TYPES.map((t) => t.id)),
  );
  const [mineOnly, setMineOnly] = useState(false);
  // Calendar v0.5 — Ishant feedback 0887d756: inquiries clutter the
  // default view. Default off; opt-in via toolbar toggle. Hold +
  // inquiry both treated as speculative (see computeStaysInWindow).
  const [showInquiries, setShowInquiries] = useState(false);
  // Multi-calendar v0.3 (T75 · 2026-05-25 · bug #0887d756):
  // (a) Default to active properties only — 60-property unfiltered
  //     view drowned the real working portfolio. Operators kept
  //     filtering manually every session.
  // (b) Zone filter (north / west / all) — Ishant feedback. Property
  //     model has `zone` field already.
  // (c) Week-jump arrows for faster navigation than per-day scroll.
  type McalPropertyFilter = 'active' | 'all';
  type McalZoneFilter = 'all' | 'north' | 'west';
  const [mcalPropertyFilter, setMcalPropertyFilter] = useState<McalPropertyFilter>('active');
  const [mcalZoneFilter, setMcalZoneFilter] = useState<McalZoneFilter>('all');
  const [selectedEvent, setSelectedEvent] = useState<{ ev: CalEvent; x: number; y: number } | null>(
    null,
  );
  const [selectedStay, setSelectedStay] = useState<{ rsv: Reservation; x: number; y: number } | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  /** When set, render a CreateTaskDrawer prefilled for this reservation
   *  (triggered from StayPopover's `+ Task` button). */
  const [taskFromRsv, setTaskFromRsv] = useState<Reservation | null>(null);
  /** Bumped after fixture mutations (note add, time adjust) so memoized
   *  derivations like `stays`/`allEvents` re-run. */
  const [rev, setRev] = useState(0);
  const bumpRev = () => setRev((n) => n + 1);
  const tabs = [
    { id: 'multi', label: 'Multi' },
    { id: 'agenda', label: 'Agenda' },
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
  ];

  const allEvents = useMemo<CalEvent[]>(() => {
    const reservationEvents = sourceReservations.flatMap((r) => reservationToEvents(r, days));
    const filteredTasks = mineOnly
      ? sourceTasks.filter((t) => t.assigneeIds.includes(currentUserId))
      : sourceTasks;
    const taskEvents = filteredTasks.map((t) => taskToEvent(t, days)).filter((e): e is CalEvent => Boolean(e));
    const fixedEvents = (demoData ? CAL_EVENTS : []).map((e) => fixedToEvent(e, days)).filter((e): e is CalEvent => Boolean(e));
    return [...fixedEvents, ...reservationEvents, ...taskEvents];
  }, [days, mineOnly, currentUserId, rev, sourceReservations, sourceTasks, demoData]);

  const stays = useMemo(
    () => packStays(computeStaysInWindow(days, sourceReservations, { includeInquiries: showInquiries })),
    [days, rev, sourceReservations, showInquiries],
  );
  // Calendar v0.5 — same speculative-booking filter for the multi-
  // calendar grid. Default-off keeps the grid focused on confirmed
  // stays; toggle reveals inquiries + holds.
  const mcalReservations = useMemo(
    () => sourceReservations.filter((r) => {
      if (r.status === 'cancelled') return false;
      if (!showInquiries && (r.status === 'inquiry' || r.status === 'hold')) return false;
      return true;
    }),
    [sourceReservations, showInquiries],
  );
  const staysVisible = typeFilter.has('reservation');

  // Map "reservation" chip to checkin/checkout event types so the existing per-type filter
  // (used by mobile day-list etc.) keeps working without a parallel state.
  const includesType = (t: CalEvent['type']) => {
    if (t === 'checkin' || t === 'checkout') return typeFilter.has('reservation');
    return typeFilter.has(t);
  };
  const visibleEvents = allEvents.filter((e) => includesType(e.type));
  // Reservations show up as bands in WeekView's stays lane, not as discrete
  // events in the time grid — so strip checkin/checkout when feeding the grid.
  const weekTimedEvents = visibleEvents.filter(
    (e) => e.type !== 'checkin' && e.type !== 'checkout',
  );

  const todayIdxInWindow = days.findIndex((d) => d.today);
  const [mobileDayIdx, setMobileDayIdx] = useState(0);
  const safeMobileIdx = Math.min(Math.max(mobileDayIdx, 0), days.length - 1);

  // Snap mobile day index to today when it falls inside the visible window after nav.
  useEffect(() => {
    if (todayIdxInWindow >= 0) setMobileDayIdx(todayIdxInWindow);
    else setMobileDayIdx(0);
  }, [todayIdxInWindow]);

  const toggleType = (t: FilterChipId) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const navStep = (dir: -1 | 1) => {
    setViewDate((prev) => {
      if (tab === 'day') return addDays(prev, dir);
      if (tab === 'week' || tab === 'agenda') return addDays(prev, dir * 7);
      if (tab === 'multi') return addDays(prev, dir * 30);
      return new Date(prev.getFullYear(), prev.getMonth() + dir, 1);
    });
  };
  const goToday = () => setViewDate(new Date(`${TODAY_ISO}T12:00:00`));
  const subtitle = viewSubtitle(viewDate, tab, days);

  return (
    <>
      <ModuleHeader
        title={calT('module.calendar', 'Calendar')}
        subtitle={subtitle}
        tabs={tabs}
        activeTab={tab}
        onTabChange={(id) => setTab(id as typeof tab)}
        actions={
          <>
            <select
              className="cal-view-switcher"
              value={tab}
              onChange={(e) => setTab(e.target.value as CalView)}
              aria-label="Calendar view"
            >
              <option value="multi">Multi</option>
              <option value="agenda">Agenda</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
            <button
              className="btn sm"
              onClick={() => setAvailabilityOpen(true)}
              title="Find available properties for a date window"
            >
              Find availability
            </button>
            <div className="cal-nav">
              <button className="btn ghost sm" onClick={() => navStep(-1)} aria-label="Previous">
                ‹
              </button>
              <button className="btn ghost sm" onClick={goToday}>
                Today
              </button>
              <button className="btn ghost sm" onClick={() => navStep(1)} aria-label="Next">
                ›
              </button>
              {/* v0.4 — custom date picker. Jump to any date directly
                  instead of stepping day/week/month at a time. Native
                  input gives iOS/Android their proper picker on mobile
                  for free. */}
              <input
                type="date"
                value={viewDate.toISOString().slice(0, 10)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setViewDate(new Date(`${v}T12:00:00`));
                }}
                className="cal-date-picker"
                aria-label="Jump to date"
                title="Jump to a specific date"
              />
            </div>
            <button
              className="btn sm cal-action-sync"
              onClick={() => {
                refetchReservations();
                refetchTasks();
                fireToast('Refreshing live calendar data');
              }}
              title="Refresh live reservations and tasks"
            >
              <IconRefresh size={12} /> Refresh
            </button>
            {demoData && (
              <button className="btn primary sm" onClick={() => setCreateOpen(true)}>
                <IconPlus size={12} /> Event
              </button>
            )}
          </>
        }
      />
      <div className="fad-module-body">
        <FilterBar>
          {visibleEventTypes.map((t) => (
            <FilterChip
              key={t.id}
              active={typeFilter.has(t.id)}
              dot={t.dot}
              onClick={() => toggleType(t.id)}
            >
              {t.label}
            </FilterChip>
          ))}
          <span style={{ width: 1, height: 18, background: 'var(--color-border-tertiary)', margin: '0 4px' }} />
          <FilterChip
            active={mineOnly}
            onClick={() => setMineOnly((v) => !v)}
          >
            Mine only
          </FilterChip>
          <FilterChip
            active={showInquiries}
            onClick={() => setShowInquiries((v) => !v)}
          >
            Show inquiries
          </FilterChip>
          {tab === 'multi' && (
            <>
              <span style={{ width: 1, height: 18, background: 'var(--color-border-tertiary)', margin: '0 4px' }} />
              <FilterChip
                active={mcalPropertyFilter === 'active'}
                onClick={() => setMcalPropertyFilter(mcalPropertyFilter === 'active' ? 'all' : 'active')}
              >
                {mcalPropertyFilter === 'active' ? 'Active only' : 'All properties'}
              </FilterChip>
              <FilterChip
                active={mcalZoneFilter === 'north'}
                onClick={() => setMcalZoneFilter(mcalZoneFilter === 'north' ? 'all' : 'north')}
              >
                North
              </FilterChip>
              <FilterChip
                active={mcalZoneFilter === 'west'}
                onClick={() => setMcalZoneFilter(mcalZoneFilter === 'west' ? 'all' : 'west')}
              >
                West
              </FilterChip>
              <button
                className="btn ghost sm"
                onClick={() => setViewDate((prev) => addDays(prev, -7))}
                title="Jump back one week"
              >
                ‹ Week
              </button>
              <button
                className="btn ghost sm"
                onClick={() => setViewDate((prev) => addDays(prev, 7))}
                title="Jump forward one week"
              >
                Week ›
              </button>
            </>
          )}
        </FilterBar>
        {!demoData && (reservationsLoading || tasksLoading) && (
          <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Loading live calendar data…
          </div>
        )}
        {!demoData && (reservationsError || tasksError) && (
          <div role="alert" style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--color-bg-danger)', color: 'var(--color-text-danger)', fontSize: 12 }}>
            {reservationsError ? `Reservations failed: ${reservationsError}` : ''}
            {reservationsError && tasksError ? ' · ' : ''}
            {tasksError ? `Tasks failed: ${tasksError}` : ''}
          </div>
        )}

        {tab === 'multi' ? (
          <MultiCalendarMounted
            properties={(() => {
              // v0.3: apply active + zone filters before handing to grid.
              // Default 'active' filter excludes paused/archived/onboarding;
              // user can toggle to 'all' from the toolbar to see paused too.
              let list = liveProperties;
              if (mcalPropertyFilter === 'active') {
                list = list.filter((p) => p.lifecycleStatus === 'live');
              }
              if (mcalZoneFilter !== 'all') {
                list = list.filter((p) => p.zone === mcalZoneFilter);
              }
              return list;
            })()}
            reservations={mcalReservations}
            tasks={sourceTasks}
            days={days}
            onReservationClick={(rsv, x, y) => setSelectedStay({ rsv, x, y })}
            onPropertyClick={(p) => { window.location.href = `/fad?m=properties&sub=overview&p=${encodeURIComponent(p.code)}`; }}
          />
        ) : tab === 'agenda' ? (
          <AgendaView
            days={days}
            events={visibleEvents}
            onEventClick={(ev, x, y) => setSelectedEvent({ ev, x, y })}
          />
        ) : tab === 'month' ? (
          <MonthView
            days={days}
            viewDate={viewDate}
            events={visibleEvents.filter((e) => e.type !== 'checkin' && e.type !== 'checkout')}
            stays={staysVisible ? stays.flat() : []}
            onEventClick={(ev, x, y) => setSelectedEvent({ ev, x, y })}
            onStayClick={(rsv, x, y) => setSelectedStay({ rsv, x, y })}
          />
        ) : tab === 'day' ? (
          <DayView
            days={days}
            events={visibleEvents.filter((e) => e.type !== 'checkin' && e.type !== 'checkout')}
            stays={staysVisible ? stays.flat() : []}
            onEventClick={(ev, x, y) => setSelectedEvent({ ev, x, y })}
            onStayClick={(rsv, x, y) => setSelectedStay({ rsv, x, y })}
          />
        ) : (
          <>
            <div className="cal-week-desktop">
              <WeekView
                days={days}
                events={weekTimedEvents}
                stayRows={staysVisible ? stays : []}
                onEventClick={(ev, x, y) => setSelectedEvent({ ev, x, y })}
                onStayClick={(rsv, x, y) => setSelectedStay({ rsv, x, y })}
              />
            </div>
            <div className="cal-week-mobile">
              <MobileDayList
                days={days}
                events={visibleEvents}
                dayIdx={safeMobileIdx}
                setDayIdx={setMobileDayIdx}
                onEventClick={(ev, x, y) => setSelectedEvent({ ev, x, y })}
              />
            </div>
          </>
        )}

        <div
          style={{
            display: 'flex',
            gap: 16,
            marginTop: 16,
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            flexWrap: 'wrap',
          }}
        >
          {visibleEventTypes.map((t) => (
            <span key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={'dot ' + t.dot} />
              {t.label}
            </span>
          ))}
          {typeFilter.has('reservation') && (
            <>
              <span style={{ width: 1, height: 12, background: 'var(--color-border-tertiary)' }} />
              {(
                [
                  { id: 'airbnb', label: 'Airbnb' },
                  { id: 'booking', label: 'Booking' },
                  { id: 'direct', label: 'Direct' },
                  { id: 'owner', label: 'Owner' },
                  { id: 'vrbo', label: 'VRBO' },
                  { id: 'email', label: 'Email' },
                ] as const
              ).map((c) => (
                <span key={c.id} className={'cal-channel-legend channel-' + c.id}>
                  <span className="cal-channel-legend-dot" />
                  {c.label}
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      {selectedEvent && (
        <EventPopover
          ev={selectedEvent.ev}
          x={selectedEvent.x}
          y={selectedEvent.y}
          tasks={sourceTasks}
          onClose={() => setSelectedEvent(null)}
        />
      )}
      {selectedStay && (
        <StayPopover
          rsv={selectedStay.rsv}
          x={selectedStay.x}
          y={selectedStay.y}
          authorId={currentUserId}
          localReservationTools={demoData}
          onClose={() => setSelectedStay(null)}
          onCreateTask={(rsv) => {
            setSelectedStay(null);
            setTaskFromRsv(rsv);
          }}
          onMutated={bumpRev}
        />
      )}
      {createOpen && demoData && <NewEventModal onClose={() => setCreateOpen(false)} />}
      {/* `key` forces a remount each time the prefilled reservation changes,
          so CreateTaskDrawer's useState picks up the new prefill values
          instead of persisting state from the previous open. */}
      {taskFromRsv && (
        <CreateTaskDrawer
          key={taskFromRsv.id}
          open={true}
          onClose={() => setTaskFromRsv(null)}
          onCreated={() => {
            setTaskFromRsv(null);
            bumpRev();
          }}
          prefill={{
            title: `Follow up with ${taskFromRsv.guestName}`,
            propertyCode: taskFromRsv.propertyCode,
            reservationId: taskFromRsv.id,
            source: 'manual',
          }}
        />
      )}
      <AvailabilitySearchModal
        open={availabilityOpen}
        onClose={() => setAvailabilityOpen(false)}
      />
    </>
  );
}

function AgendaView({
  days,
  events,
  onEventClick,
}: {
  days: ViewDay[];
  events: CalEvent[];
  onEventClick: (ev: CalEvent, x: number, y: number) => void;
}) {
  const grouped = days.map((day, idx) => {
    const dayEvents = events
      .filter((e) => e.day === idx)
      .sort((a, b) => {
        const aStart = a.allDay ? -1 : a.start;
        const bStart = b.allDay ? -1 : b.start;
        return aStart - bStart;
      });
    return { day, events: dayEvents };
  });
  const total = grouped.reduce((sum, g) => sum + g.events.length, 0);

  return (
    <div className="cal-agenda" aria-label="Calendar agenda">
      <div className="cal-agenda-summary">
        <div>
          <span>Next 7 days</span>
          <strong>{total === 0 ? 'Nothing scheduled' : `${total} scheduled item${total === 1 ? '' : 's'}`}</strong>
        </div>
      </div>
      {grouped.map(({ day, events: dayEvents }) => (
        <section key={day.isoDate} className="cal-agenda-day">
          <div className={'cal-agenda-date' + (day.today ? ' today' : '')}>
            <span>{day.label}</span>
            <strong>{new Date(day.isoDate).toLocaleString('en-US', { month: 'short', day: 'numeric' })}</strong>
          </div>
          {dayEvents.length === 0 ? (
            <div className="cal-agenda-empty">Nothing scheduled.</div>
          ) : (
            <div className="cal-agenda-events">
              {dayEvents.map((e, i) => (
                <button
                  key={`${e.title}-${i}`}
                  type="button"
                  className={'cal-agenda-event ' + e.type}
                  onClick={(evt) => {
                    const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                    onEventClick(e, rect.left + 16, rect.top + 16);
                  }}
                >
                  <span className="cal-agenda-time mono">
                    {e.allDay || e.start < 0 ? 'All day' : `${String(e.start).padStart(2, '0')}:00`}
                  </span>
                  <span className="cal-agenda-main">
                    <span>{TYPE_LABEL[e.type]}</span>
                    <strong>{e.title}</strong>
                  </span>
                  <span className="cal-agenda-open">{eventOpenLabel(e.type)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function WeekView({
  days,
  events,
  stayRows,
  onEventClick,
  onStayClick,
}: {
  days: ViewDay[];
  events: CalEvent[];
  stayRows: Stay[][];
  onEventClick: (ev: CalEvent, x: number, y: number) => void;
  onStayClick: (rsv: Reservation, x: number, y: number) => void;
}) {
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const allDayByDay: Record<number, CalEvent[]> = {};
  days.forEach((_, di) => {
    allDayByDay[di] = events.filter((e) => e.day === di && e.allDay);
  });
  const hasAnyAllDay = Object.values(allDayByDay).some((arr) => arr.length > 0);
  const [allDayExpand, setAllDayExpand] = useState<{
    dayIdx: number;
    date: string;
    x: number;
    y: number;
  } | null>(null);
  // Cap stays-lane height by default — with 60+ properties the packed lanes
  // can easily exceed 30 rows. Default 12 lanes (matches MonthView) covers
  // most realistic peak loads; toggle reveals the rest.
  const STAYS_LANE_VISIBLE = 12;
  const [staysExpanded, setStaysExpanded] = useState(false);
  const monthLabel = days[0]
    ? new Date(days[0].isoDate).toLocaleString('en-US', { month: 'short' })
    : '';
  const visibleStayRows = staysExpanded ? stayRows : stayRows.slice(0, STAYS_LANE_VISIBLE);
  const hiddenStayRowsCount = Math.max(stayRows.length - visibleStayRows.length, 0);
  return (
    <div className="cal-wrap">
      <div className="cal-head">
        <div className="cal-head-cell">
          <span style={{ fontSize: 10 }}>{monthLabel}</span>
        </div>
        {days.map((d) => (
          <div key={d.isoDate} className={'cal-head-cell' + (d.today ? ' today' : '')}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{d.label}</span>
            <span className="day">{d.date}</span>
          </div>
        ))}
      </div>
      {stayRows.length > 0 && (
        <div className="cal-stays-lane">
          {visibleStayRows.map((row, rowIdx) => (
            <div key={rowIdx} className="cal-stays-row">
              <div className="cal-stays-rowlabel">{rowIdx === 0 ? 'Stays' : ''}</div>
              {row.map((s) => (
                <button
                  key={s.rsv.id}
                  type="button"
                  className={
                    'cal-stay-band status-' + s.rsv.status +
                    ' channel-' + s.rsv.channel +
                    (!s.startsThisWeek ? ' clip-left' : '') +
                    (!s.endsThisWeek ? ' clip-right' : '')
                  }
                  style={{
                    gridColumnStart: 2 + s.startIdx,
                    gridColumnEnd: 2 + s.endIdx + 1,
                  }}
                  onClick={(evt) => {
                    const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                    onStayClick(s.rsv, rect.right + 8, rect.top);
                  }}
                  title={`${s.rsv.guestName} · ${s.rsv.propertyCode} · ${s.rsv.nights} nts`}
                >
                  {s.startsThisWeek && <span className="cal-stay-end-dot left" aria-hidden="true" />}
                  <span className="cal-stay-channel mono">{channelShort(s.rsv.channel)}</span>
                  <span className="cal-stay-label">
                    {s.rsv.guestName} <span className="cal-stay-prop mono">{s.rsv.propertyCode}</span>
                  </span>
                  {s.endsThisWeek && <span className="cal-stay-end-dot right" aria-hidden="true" />}
                </button>
              ))}
            </div>
          ))}
          {hiddenStayRowsCount > 0 && (
            <button
              type="button"
              className="cal-stays-toggle"
              onClick={() => setStaysExpanded(true)}
            >
              + Show {hiddenStayRowsCount} more lane{hiddenStayRowsCount === 1 ? '' : 's'} of stays
            </button>
          )}
          {staysExpanded && stayRows.length > STAYS_LANE_VISIBLE && (
            <button
              type="button"
              className="cal-stays-toggle"
              onClick={() => setStaysExpanded(false)}
            >
              Collapse stays lane
            </button>
          )}
        </div>
      )}
      {hasAnyAllDay && (
        <div className="cal-allday-row">
          <div className="cal-allday-label">All day</div>
          {days.map((d, di) => {
            const dayEvents = allDayByDay[di];
            const overflowCount = Math.max(dayEvents.length - 2, 0);
            return (
              <div key={di} className="cal-allday-cell">
                {dayEvents.slice(0, 2).map((e, i) => (
                  <button
                    key={i}
                    type="button"
                    className={'cal-allday-pill ' + e.type}
                    onClick={(evt) => {
                      const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                      onEventClick(e, rect.right + 8, rect.top);
                    }}
                    title={e.title}
                  >
                    {e.title}
                  </button>
                ))}
                {overflowCount > 0 && (
                  <button
                    type="button"
                    className="cal-allday-more"
                    onClick={(evt) => {
                      evt.stopPropagation();
                      const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                      setAllDayExpand({
                        dayIdx: di,
                        date: d.isoDate,
                        x: rect.left,
                        y: rect.bottom + 4,
                      });
                    }}
                  >
                    +{overflowCount} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {allDayExpand && allDayByDay[allDayExpand.dayIdx] && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setAllDayExpand(null)}
          />
          <div
            className="fad-dropdown cal-allday-expand"
            style={{ top: allDayExpand.y, left: Math.min(allDayExpand.x, window.innerWidth - 280) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cal-allday-expand-header">
              All day · {new Date(allDayExpand.date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            <div className="cal-allday-expand-list">
              {allDayByDay[allDayExpand.dayIdx].map((e, i) => (
                <button
                  key={i}
                  type="button"
                  className={'cal-allday-pill ' + e.type}
                  onClick={(evt) => {
                    const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                    setAllDayExpand(null);
                    onEventClick(e, rect.right + 8, rect.top);
                  }}
                >
                  {e.title}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="cal-grid">
        {hours.map((h) => (
          <Fragment key={h}>
            <div className="cal-hour-label">{String(h).padStart(2, '0')}:00</div>
            {days.map((d, di) => {
              const evs = events.filter((e) => e.day === di && !e.allDay && e.start === h);
              const visible = evs.slice(0, 3);
              const overflow = evs.length - visible.length;
              return (
                <div key={di} className="cal-cell">
                  {visible.map((e, i) => {
                    const span = e.end - e.start;
                    const widthPct = 100 / visible.length;
                    return (
                      <div
                        key={i}
                        className={'cal-event ' + e.type}
                        style={{
                          top: 2,
                          height: `calc(${span * 52}px - 4px)`,
                          left: `${i * widthPct}%`,
                          width: `calc(${widthPct}% - 2px)`,
                        }}
                        onClick={(evt) => {
                          evt.stopPropagation();
                          const rect = (evt.target as HTMLElement).getBoundingClientRect();
                          onEventClick(e, rect.right + 8, rect.top);
                        }}
                      >
                        <span className="ev-time mono">
                          {String(e.start).padStart(2, '0')}:00
                        </span>
                        {e.title}
                      </div>
                    );
                  })}
                  {overflow > 0 && (
                    <span className="cal-cell-more">+{overflow}</span>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// Multi-calendar wrapper that fetches per-cell price + groups tasks
// by property. Kept as a sibling so the parent CalendarModule doesn't
// fire the calendar-grid fetch on other tabs (Agenda / Week / Month).
// Phase 5 v0.2 (T4.38 v0.2 · 2026-05-25).
function MultiCalendarMounted({
  properties,
  reservations,
  tasks,
  days,
  onReservationClick,
  onPropertyClick,
}: {
  properties: import('../../_data/properties').Property[];
  reservations: import('../../_data/reservations').Reservation[];
  tasks: Task[];
  days: ViewDay[];
  onReservationClick: (rsv: import('../../_data/reservations').Reservation, x: number, y: number) => void;
  onPropertyClick: (p: import('../../_data/properties').Property) => void;
}) {
  const from = days[0]?.isoDate;
  const to = days[days.length - 1]?.isoDate;
  const { pricesByListing } = useCalendarGrid(from, to);

  // Group tasks by propertyCode for in-cell chip overlay.
  const tasksByPropertyCode = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.propertyCode || !t.dueDate) continue;
      const arr = map.get(t.propertyCode) || [];
      arr.push(t);
      map.set(t.propertyCode, arr);
    }
    return map;
  }, [tasks]);

  return (
    <MultiCalendarGrid
      properties={properties}
      reservations={reservations}
      pricesByListing={pricesByListing}
      tasksByPropertyCode={tasksByPropertyCode}
      windowStart={from ? new Date(`${from}T00:00:00`) : new Date()}
      windowDays={Math.max(days.length, 30)}
      todayIso={TODAY_ISO}
      onReservationClick={onReservationClick}
      onPropertyClick={onPropertyClick}
    />
  );
}

function MobileDayList({
  days,
  events,
  dayIdx,
  setDayIdx,
  onEventClick,
}: {
  days: ViewDay[];
  events: CalEvent[];
  dayIdx: number;
  setDayIdx: (n: number) => void;
  onEventClick: (ev: CalEvent, x: number, y: number) => void;
}) {
  const day = days[dayIdx];
  if (!day) return null;
  const dayEvents = events.filter((e) => e.day === dayIdx);
  const allDayEvents = dayEvents.filter((e) => e.allDay);
  const timedEvents = dayEvents.filter((e) => !e.allDay).sort((a, b) => a.start - b.start);
  return (
    <div className="cal-mobile">
      <div className="cal-mobile-pager">
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setDayIdx(Math.max(dayIdx - 1, 0))}
          disabled={dayIdx === 0}
          aria-label="Previous day"
        >
          ‹
        </button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {day.label}
            {day.today && ' · today'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {new Date(day.isoDate).toLocaleString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setDayIdx(Math.min(dayIdx + 1, days.length - 1))}
          disabled={dayIdx >= days.length - 1}
          aria-label="Next day"
        >
          ›
        </button>
      </div>

      {dayEvents.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Nothing scheduled.
        </div>
      ) : (
        <>
          {allDayEvents.length > 0 && (
            <div className="cal-mobile-allday">
              <div className="cal-mobile-allday-label">All day · {allDayEvents.length}</div>
              <ul className="cal-mobile-list">
                {allDayEvents.map((e, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className={'cal-mobile-event ' + e.type}
                      onClick={(evt) => {
                        const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                        onEventClick(e, rect.left + 16, rect.top + 16);
                      }}
                    >
                      <span className="cal-mobile-event-time mono">—</span>
                      <span className="cal-mobile-event-type">{TYPE_LABEL[e.type]}</span>
                      <span className="cal-mobile-event-title">{e.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {timedEvents.length > 0 && (
            <ul className="cal-mobile-list">
              {timedEvents.map((e, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={'cal-mobile-event ' + e.type}
                    onClick={(evt) => {
                      const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                      onEventClick(e, rect.left + 16, rect.top + 16);
                    }}
                  >
                    <span className="cal-mobile-event-time mono">
                      {String(e.start).padStart(2, '0')}:00
                    </span>
                    <span className="cal-mobile-event-type">{TYPE_LABEL[e.type]}</span>
                    <span className="cal-mobile-event-title">{e.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function DayView({
  days,
  events,
  stays,
  onEventClick,
  onStayClick,
}: {
  days: ViewDay[];
  events: CalEvent[];
  stays: Stay[];
  onEventClick: (ev: CalEvent, x: number, y: number) => void;
  onStayClick: (rsv: Reservation, x: number, y: number) => void;
}) {
  const hours = Array.from({ length: 14 }, (_, i) => 7 + i);
  const focusIdx = 0; // day view always shows a single day at index 0
  const focusDay = days[focusIdx];
  if (!focusDay) return null;
  const evs = events.filter((e) => e.day === focusIdx);
  const allDayEvs = evs.filter((e) => e.allDay);
  const staysToday = stays.filter((s) => s.startIdx <= focusIdx && s.endIdx >= focusIdx);
  const monthLabel = new Date(focusDay.isoDate).toLocaleString('en-US', { month: 'short' });
  return (
    <div className="cal-wrap">
      <div className="cal-head" style={{ gridTemplateColumns: '64px 1fr' }}>
        <div className="cal-head-cell">
          <span style={{ fontSize: 10 }}>{monthLabel}</span>
        </div>
        <div className={'cal-head-cell' + (focusDay.today ? ' today' : '')}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{focusDay.label}</span>
          <span className="day">{focusDay.date}</span>
        </div>
      </div>
      {staysToday.length > 0 && (
        <div className="cal-day-stays">
          <div className="cal-day-stays-label">In residence · {staysToday.length}</div>
          <div className="cal-day-stays-list">
            {staysToday.map((s) => {
              const isArrival = s.startIdx === focusIdx && s.startsThisWeek;
              const isDeparture = s.endIdx === focusIdx && s.endsThisWeek;
              const tag = isArrival ? 'Arriving' : isDeparture ? 'Departing' : 'Staying';
              return (
                <button
                  key={s.rsv.id}
                  type="button"
                  className={'cal-stay-band status-' + s.rsv.status + ' channel-' + s.rsv.channel}
                  onClick={(evt) => {
                    const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                    onStayClick(s.rsv, rect.right + 8, rect.top);
                  }}
                >
                  <span className="cal-stay-end-dot" aria-hidden="true" />
                  <span className="cal-stay-channel mono">{channelShort(s.rsv.channel)}</span>
                  <span className="cal-stay-label">
                    {s.rsv.guestName}{' '}
                    <span className="cal-stay-prop mono">{s.rsv.propertyCode}</span>
                  </span>
                  <span style={{ fontSize: 9, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {tag}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {allDayEvs.length > 0 && (
        <div className="cal-allday-row" style={{ gridTemplateColumns: '64px 1fr' }}>
          <div className="cal-allday-label">All day</div>
          <div className="cal-allday-cell" style={{ flexWrap: 'wrap' }}>
            {allDayEvs.map((e, i) => (
              <button
                key={i}
                type="button"
                className={'cal-allday-pill ' + e.type}
                onClick={(evt) => {
                  const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                  onEventClick(e, rect.right + 8, rect.top);
                }}
              >
                {e.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="cal-grid" style={{ gridTemplateColumns: '64px 1fr' }}>
        {hours.map((h) => {
          const cellEvs = evs.filter((e) => !e.allDay && e.start === h);
          return (
            <Fragment key={h}>
              <div className="cal-hour-label">{String(h).padStart(2, '0')}:00</div>
              <div className="cal-cell" style={{ height: 52 }}>
                {cellEvs.map((e, i) => {
                  const span = e.end - e.start;
                  const widthPct = 100 / cellEvs.length;
                  return (
                    <div
                      key={i}
                      className={'cal-event ' + e.type}
                      style={{
                        top: 2,
                        height: `calc(${span * 52}px - 4px)`,
                        left: `${i * widthPct}%`,
                        width: `calc(${widthPct}% - 2px)`,
                      }}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        const rect = (evt.target as HTMLElement).getBoundingClientRect();
                        onEventClick(e, rect.right + 8, rect.top);
                      }}
                    >
                      <span className="ev-time mono">
                        {String(e.start).padStart(2, '0')}:00
                      </span>
                      {e.title}
                    </div>
                  );
                })}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({
  days,
  viewDate,
  events,
  stays,
  onEventClick,
  onStayClick,
}: {
  days: ViewDay[];
  viewDate: Date;
  events: CalEvent[];
  stays: Stay[];
  onEventClick: (ev: CalEvent, x: number, y: number) => void;
  onStayClick: (rsv: Reservation, x: number, y: number) => void;
}) {
  void viewDate;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const [expand, setExpand] = useState<{
    isoDate: string;
    events: CalEvent[];
    stays: Stay[];
    x: number;
    y: number;
  } | null>(null);

  const weeks: ViewDay[][] = useMemo(() => {
    const out: ViewDay[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      out.push(days.slice(i, i + 7));
    }
    return out;
  }, [days]);

  // Tuned for the FR portfolio (60 properties → 60-100 simultaneous stays
   // in peak season). 12 lanes captures most of them; the rest still fall
   // into the per-day "+N more" popover. Going lower hides too much; going
   // higher makes each week-row very tall on a normal viewport.
  const MAX_LANES = 12;

  return (
    <div className="cal-month">
      <div className="cal-month-head">
        {dayNames.map((d) => (
          <div key={d} className="cal-month-head-cell">
            {d}
          </div>
        ))}
      </div>
      <div className="cal-month-body">
        {weeks.map((weekDays, weekIdx) => {
          const weekStartIdx = weekIdx * 7;
          const weekEndIdx = weekStartIdx + 6;

          // Stays that intersect this week, longest-first so they take low lanes.
          const weekStays = stays
            .filter((s) => s.startIdx <= weekEndIdx && s.endIdx >= weekStartIdx)
            .map((s) => ({
              stay: s,
              startCol: Math.max(0, s.startIdx - weekStartIdx),
              endCol: Math.min(6, s.endIdx - weekStartIdx),
              clipLeft: s.startIdx < weekStartIdx,
              clipRight: s.endIdx > weekEndIdx,
            }))
            .sort((a, b) => {
              const aSpan = a.endCol - a.startCol;
              const bSpan = b.endCol - b.startCol;
              if (bSpan !== aSpan) return bSpan - aSpan;
              return a.startCol - b.startCol;
            });

          // First-fit lane allocation.
          const lanes: { startCol: number; endCol: number }[][] = [];
          const placedStays = weekStays.map((s) => {
            let laneIdx = lanes.findIndex((lane) =>
              lane.every((o) => o.endCol < s.startCol || o.startCol > s.endCol),
            );
            if (laneIdx < 0) {
              lanes.push([{ startCol: s.startCol, endCol: s.endCol }]);
              laneIdx = lanes.length - 1;
            } else {
              lanes[laneIdx].push({ startCol: s.startCol, endCol: s.endCol });
            }
            return { ...s, lane: laneIdx };
          });

          // Single-day events placed in the first free lane on their column.
          const laneUsed: Set<number>[] = Array.from({ length: 7 }, () => new Set<number>());
          placedStays.forEach((p) => {
            for (let c = p.startCol; c <= p.endCol; c++) laneUsed[c].add(p.lane);
          });
          const placedEvents: { ev: CalEvent; col: number; lane: number }[] = [];
          for (let col = 0; col < 7; col++) {
            const dayIdx = weekStartIdx + col;
            const cellEvents = events.filter((e) => e.day === dayIdx);
            for (const ev of cellEvents) {
              let lane = 0;
              while (laneUsed[col].has(lane)) lane++;
              laneUsed[col].add(lane);
              placedEvents.push({ ev, col, lane });
            }
          }

          const overflowPerCol: number[] = Array(7).fill(0);
          placedStays.forEach((p) => {
            if (p.lane >= MAX_LANES) {
              for (let c = p.startCol; c <= p.endCol; c++) overflowPerCol[c]++;
            }
          });
          placedEvents.forEach((p) => {
            if (p.lane >= MAX_LANES) overflowPerCol[p.col]++;
          });
          const hasOverflowRow = overflowPerCol.some((n) => n > 0);
          const totalRows = 1 + MAX_LANES + (hasOverflowRow ? 1 : 0);

          return (
            <div
              key={weekDays[0].isoDate}
              className="cal-month-week"
              style={{
                gridTemplateRows: `26px repeat(${MAX_LANES}, 18px)${hasOverflowRow ? ' 18px' : ''}`,
              }}
            >
              {weekDays.map((d, col) => (
                <div
                  key={'bg-' + d.isoDate}
                  className={
                    'cal-mv-cell' +
                    (!d.inFocusMonth ? ' other' : '') +
                    (d.today ? ' today' : '')
                  }
                  style={{ gridColumn: col + 1, gridRow: `1 / ${totalRows + 1}` }}
                />
              ))}
              {weekDays.map((d, col) => (
                <div
                  key={'num-' + d.isoDate}
                  className="cal-mv-daynum-wrap"
                  style={{ gridColumn: col + 1, gridRow: 1 }}
                >
                  <span
                    className={
                      'cal-mv-daynum' +
                      (d.today ? ' today' : '') +
                      (!d.inFocusMonth ? ' muted' : '')
                    }
                  >
                    {Number(d.date)}
                  </span>
                </div>
              ))}
              {placedStays
                .filter((p) => p.lane < MAX_LANES)
                .map((p) => {
                  const rsv = p.stay.rsv;
                  return (
                    <button
                      key={'s-' + rsv.id}
                      type="button"
                      className={
                        'cal-mv-band' +
                        ' channel-' + rsv.channel +
                        ' status-' + rsv.status +
                        (p.clipLeft ? ' clip-left' : '') +
                        (p.clipRight ? ' clip-right' : '')
                      }
                      style={{
                        gridColumn: `${p.startCol + 1} / ${p.endCol + 2}`,
                        gridRow: 1 + p.lane + 1,
                      }}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                        onStayClick(rsv, rect.right + 8, rect.top);
                      }}
                      title={`${rsv.guestName} · ${rsv.propertyCode} · ${rsv.nights} nts · ${CHANNEL_LABEL[rsv.channel] || rsv.channel}`}
                    >
                      {/* Label hidden on continuation segments (clip-left) so a
                       * multi-week stay reads as ONE entity instead of "guest
                       * appears N times" across rows. The colored band itself
                       * is the continuation signal. */}
                      {!p.clipLeft && (
                        <>
                          <span className="cal-mv-band-channel mono">{channelShort(rsv.channel)}</span>
                          <span className="cal-mv-band-label">
                            {rsv.guestName}{' '}
                            <span className="cal-mv-band-prop mono">{rsv.propertyCode}</span>
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              {placedEvents
                .filter((p) => p.lane < MAX_LANES)
                .map((p, i) => (
                  <button
                    key={'e-' + p.col + '-' + p.lane + '-' + i}
                    type="button"
                    className={'cal-mv-event ' + p.ev.type}
                    style={{
                      gridColumn: p.col + 1,
                      gridRow: 1 + p.lane + 1,
                    }}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                      onEventClick(p.ev, rect.right + 8, rect.top);
                    }}
                    title={p.ev.title}
                  >
                    {p.ev.title}
                  </button>
                ))}
              {hasOverflowRow &&
                overflowPerCol.map((n, col) =>
                  n > 0 ? (
                    <button
                      key={'o-' + col}
                      type="button"
                      className="cal-mv-more"
                      style={{ gridColumn: col + 1, gridRow: totalRows }}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                        const dayIdx = weekStartIdx + col;
                        setExpand({
                          isoDate: weekDays[col].isoDate,
                          events: events.filter((e) => e.day === dayIdx),
                          stays: stays.filter((s) => s.startIdx <= dayIdx && s.endIdx >= dayIdx),
                          x: rect.left,
                          y: rect.bottom + 4,
                        });
                      }}
                    >
                      +{n} more
                    </button>
                  ) : null,
                )}
            </div>
          );
        })}
      </div>
      {expand && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setExpand(null)}
          />
          <div
            className="fad-dropdown cal-allday-expand"
            style={{ top: expand.y, left: Math.min(expand.x, window.innerWidth - 320) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cal-allday-expand-header">
              {new Date(expand.isoDate).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}{expand.stays.length + expand.events.length} item{expand.stays.length + expand.events.length === 1 ? '' : 's'}
            </div>
            <div className="cal-allday-expand-list">
              {expand.stays.map((s) => (
                <button
                  key={s.rsv.id}
                  type="button"
                  className={'cal-allday-pill channel-' + s.rsv.channel + ' status-' + s.rsv.status}
                  onClick={(evt) => {
                    const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                    setExpand(null);
                    onStayClick(s.rsv, rect.right + 8, rect.top);
                  }}
                >
                  🛏 {s.rsv.guestName} · {s.rsv.propertyCode}
                </button>
              ))}
              {expand.events.map((e, i) => (
                <button
                  key={'ev-' + i}
                  type="button"
                  className={'cal-allday-pill ' + e.type}
                  onClick={(evt) => {
                    const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                    setExpand(null);
                    onEventClick(e, rect.right + 8, rect.top);
                  }}
                >
                  {e.title}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EventPopover({
  ev,
  x,
  y,
  tasks,
  onClose,
}: {
  ev: CalEvent;
  x: number;
  y: number;
  tasks: Task[];
  onClose: () => void;
}) {
  // Match a task event back to its source record so we can show richer detail.
  const linkedTask = ev.type === 'task' ? matchTaskFromEventTitle(ev, tasks) : null;
  const targetHref = linkedTask
    ? `/fad?m=operations&sub=all&task=${encodeURIComponent(linkedTask.id)}`
    : (ev.type === 'checkin' || ev.type === 'checkout') && ev.sourceId
    ? `/fad?m=reservations&sub=overview&rsv=${encodeURIComponent(ev.sourceId)}`
    : null;
  const timeLabel = ev.allDay
    ? 'All day'
    : `${String(ev.start).padStart(2, '0')}:00 – ${String(ev.end).padStart(2, '0')}:00`;
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div
        className="cal-popover"
        style={{ top: y, left: Math.min(x, window.innerWidth - 320) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span className={'chip ' + (ev.type === 'maint' ? 'warn' : ev.type === 'checkin' || ev.type === 'checkout' ? 'info' : '')}>
            {TYPE_LABEL[ev.type]}
          </span>
          {linkedTask && (
            <span
              className="mono"
              style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}
            >
              #{linkedTask.bzId ?? linkedTask.id}
            </span>
          )}
          <button className="fad-util-btn" onClick={onClose} style={{ marginLeft: 'auto', width: 22, height: 22 }}>
            <IconClose size={12} />
          </button>
        </div>
        <div className="cal-popover-title">{linkedTask?.title ?? ev.title}</div>
        <div className="cal-popover-meta">{timeLabel}</div>
        {linkedTask ? (
          <TaskDetailBlock task={linkedTask} />
        ) : (
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {ev.type === 'maint'
              ? 'Maintenance work order — open the source record to assign or reschedule.'
              : ev.type === 'meeting'
              ? 'Internal meeting — invitees and notes live in the source record.'
              : ''}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn sm"
            disabled={!targetHref}
            onClick={() => {
              if (targetHref) window.location.assign(targetHref);
            }}
          >
            {eventOpenLabel(ev.type)}
          </button>
        </div>
      </div>
    </>
  );
}

function matchTaskFromEventTitle(ev: CalEvent, tasks: Task[]): Task | null {
  if (ev.sourceId) {
    const byId = tasks.find((t) => t.id === ev.sourceId);
    if (byId) return byId;
  }
  // Title shape from taskToEvent: "{propertyCode} · {task.title}"
  const title = ev.title;
  const sepIdx = title.indexOf(' · ');
  if (sepIdx < 0) return null;
  const propertyCode = title.slice(0, sepIdx);
  const taskTitle = title.slice(sepIdx + 3);
  return tasks.find((t) => t.propertyCode === propertyCode && t.title === taskTitle) ?? null;
}

function TaskDetailBlock({ task }: { task: Task }) {
  const assignees = task.assigneeIds
    .map((id) => TASK_USER_BY_ID[id]?.name.split(' ')[0])
    .filter(Boolean)
    .join(', ');
  return (
    <div className="cal-popover-finance">
      <div className="cal-popover-finance-row">
        <span>Property</span>
        <span className="mono" style={{ fontWeight: 500 }}>{task.propertyCode}</span>
      </div>
      <div className="cal-popover-finance-row">
        <span>Department</span>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {task.department} · {task.subdepartment.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="cal-popover-finance-row">
        <span>Status</span>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {task.status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="cal-popover-finance-row">
        <span>Priority</span>
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 3,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background:
              task.priority === 'urgent'
                ? 'var(--color-bg-danger)'
                : task.priority === 'high'
                ? 'var(--color-bg-warning)'
                : 'var(--color-background-secondary)',
            color:
              task.priority === 'urgent'
                ? 'var(--color-text-danger)'
                : task.priority === 'high'
                ? 'var(--color-text-warning)'
                : 'var(--color-text-secondary)',
          }}
        >
          {task.priority}
        </span>
      </div>
      <div className="cal-popover-finance-row">
        <span>Due</span>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {task.dueDate}{task.dueTime ? ` · ${task.dueTime}` : ''}
        </span>
      </div>
      {assignees && (
        <div className="cal-popover-finance-row">
          <span>Assignees</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>{assignees}</span>
        </div>
      )}
      {task.riskFlags.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--color-text-warning)', marginTop: 4 }}>
          ⚠ {task.riskFlags.join(', ')}
        </div>
      )}
    </div>
  );
}

type StayPanel = 'none' | 'note' | 'times';

function StayPopover({
  rsv,
  x,
  y,
  authorId,
  localReservationTools,
  onClose,
  onCreateTask,
  onMutated,
}: {
  rsv: Reservation;
  x: number;
  y: number;
  authorId: string;
  localReservationTools: boolean;
  onClose: () => void;
  onCreateTask: (rsv: Reservation) => void;
  onMutated: () => void;
}) {
  const [panel, setPanel] = useState<StayPanel>('none');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteMentions, setNoteMentions] = useState<string[]>([]);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [checkInDraft, setCheckInDraft] = useState(rsv.checkIn.slice(0, 16));
  const [checkOutDraft, setCheckOutDraft] = useState(rsv.checkOut.slice(0, 16));
  const notes = localReservationTools ? notesForReservation(rsv.id) : [];
  const mentionCandidates = TASK_USERS.filter((u) => u.role !== 'external' && u.active && u.id !== authorId);

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
    addReservationNote({
      reservationId: rsv.id,
      authorId,
      body: text,
      mentions: noteMentions,
    });
    setNoteDraft('');
    setNoteMentions([]);
    setPanel('none');
    fireToast(
      noteMentions.length > 0
        ? `Note added · ${noteMentions.length} teammate${noteMentions.length === 1 ? '' : 's'} notified`
        : 'Note added to reservation',
    );
    onMutated();
  };

  const saveTimes = async () => {
    const inIso = checkInDraft.includes(':') ? checkInDraft + ':00' : checkInDraft;
    const outIso = checkOutDraft.includes(':') ? checkOutDraft + ':00' : checkOutDraft;
    if (inIso === rsv.checkIn && outIso === rsv.checkOut) {
      fireToast('No time changes to save');
      setPanel('none');
      return;
    }
    await updateReservationTimes({
      reservationId: rsv.id,
      checkIn: inIso !== rsv.checkIn ? inIso : undefined,
      checkOut: outIso !== rsv.checkOut ? outIso : undefined,
      actorId: authorId,
    });
    setPanel('none');
    fireToast('Reservation updated · Guesty sync task queued');
    onMutated();
    onClose();
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div
        className="cal-popover"
        style={{
          // Clamp `top` so the popover (which can grow tall when the note
          // composer or time form is open) never spills below the viewport.
          // Worst-case content is ~640px; reserve 16px breathing room.
          top: Math.max(8, Math.min(y, window.innerHeight - 640 - 16)),
          left: Math.min(x, window.innerWidth - 320),
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span className="mono" style={{ fontSize: 11, fontWeight: 500 }}>🛏 {rsv.id}</span>
          <span
            style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--color-brand-accent-soft)',
              color: 'var(--color-brand-accent)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {RES_STATUS_LABEL[rsv.status]}
          </span>
          <button className="fad-util-btn" onClick={onClose} style={{ marginLeft: 'auto', width: 22, height: 22 }}>
            <IconClose size={12} />
          </button>
        </div>
        <div className="cal-popover-title">
          {rsv.guestName} <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>· {rsv.propertyCode}</span>
        </div>
        <div className="cal-popover-meta">{formatStayWindow(rsv)}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
          {rsv.partySize.adults} adult{rsv.partySize.adults === 1 ? '' : 's'}
          {rsv.partySize.children > 0 && ` · ${rsv.partySize.children} child${rsv.partySize.children === 1 ? '' : 'ren'}`}
          {' · '}{CHANNEL_LABEL[rsv.channel]}
        </div>
        <div className="cal-popover-finance">
          <div className="cal-popover-finance-label">Financials</div>
          <div className="cal-popover-finance-row">
            <span>Total</span>
            <span className="mono" style={{ fontWeight: 500 }}>
              {formatMoney(rsv.totalAmount, rsv.currency)}
            </span>
          </div>
          <div className="cal-popover-finance-row">
            <span>Nightly avg</span>
            <span className="mono" style={{ color: 'var(--color-text-secondary)' }}>
              {formatMoney(Math.round(rsv.totalAmount / Math.max(rsv.nights, 1)), rsv.currency)}
            </span>
          </div>
          {rsv.calendarPricing?.nightlyAverage != null && (
            <div className="cal-popover-finance-row">
              <span>Guesty nightly</span>
              <span className="mono" style={{ color: 'var(--color-text-secondary)' }}>
                {formatMoney(rsv.calendarPricing.nightlyAverage, rsv.calendarPricing.currency || rsv.currency)}
              </span>
            </div>
          )}
          {rsv.calendarPricing?.syncedAt && (
            <div className="cal-popover-finance-row">
              <span>Calendar sync</span>
              <span className="mono" style={{ color: 'var(--color-text-tertiary)' }}>
                {rsv.calendarPricing.nightsCached}/{rsv.nights} nights · {rsv.calendarPricing.syncedAt.slice(0, 10)}
              </span>
            </div>
          )}
          <div className="cal-popover-finance-row">
            <span>Tourist tax</span>
            <span className="mono" style={{ color: 'var(--color-text-secondary)' }}>
              {formatMoney(rsv.touristTax, rsv.currency)}
            </span>
          </div>
          <div className="cal-popover-finance-row">
            <span>Payout</span>
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 3,
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                background:
                  rsv.payoutStatus === 'pending'
                    ? 'var(--color-bg-warning)'
                    : rsv.payoutStatus === 'refunded'
                    ? 'var(--color-bg-danger)'
                    : 'var(--color-bg-success)',
                color:
                  rsv.payoutStatus === 'pending'
                    ? 'var(--color-text-warning)'
                    : rsv.payoutStatus === 'refunded'
                    ? 'var(--color-text-danger)'
                    : 'var(--color-text-success)',
              }}
            >
              {PAYOUT_LABEL[rsv.payoutStatus]}
            </span>
          </div>
          {rsv.refundAmount && rsv.refundAmount > 0 && (
            <div className="cal-popover-finance-row">
              <span>Refund issued</span>
              <span className="mono" style={{ color: 'var(--color-text-danger)' }}>
                −{formatMoney(rsv.refundAmount, rsv.currency)}
              </span>
            </div>
          )}
        </div>
        {rsv.notes && (
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontStyle: 'italic', margin: '8px 0' }}>
            {rsv.notes}
          </div>
        )}
        {/* Existing notes — collapsed list above any open composer. */}
        {notes.length > 0 && panel !== 'note' && (
          <div className="cal-popover-note-list">
            {notes.slice(0, 3).map((n) => (
              <ReservationNoteItem key={n.id} note={n} />
            ))}
          </div>
        )}

        {panel === 'note' && (
          <div className="cal-popover-note-compose">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, position: 'relative' }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-warning)', fontWeight: 500 }}>
                🔒 Internal note · only your team can see this
              </span>
              <button
                type="button"
                className="btn ghost sm"
                style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 6px' }}
                onClick={() => setMentionPickerOpen((v) => !v)}
                title="Tag a teammate"
              >
                @ Mention
              </button>
              {mentionPickerOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 9 }}
                    onClick={() => setMentionPickerOpen(false)}
                  />
                  <div
                    className="fad-dropdown"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 4,
                      minWidth: 180,
                      maxHeight: 220,
                      overflowY: 'auto',
                      zIndex: 10,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {mentionCandidates.map((u) => (
                      <button
                        key={u.id}
                        className="fad-dropdown-item"
                        onClick={() => insertMention(u.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            background: u.avatarColor,
                            color: 'white',
                            fontSize: 9,
                            textAlign: 'center',
                            lineHeight: '18px',
                          }}
                        >
                          {u.initials}
                        </span>
                        {u.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="What does the team need to know?"
              style={{ width: '100%', minHeight: 60, fontSize: 12, fontFamily: 'inherit', padding: 6 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                className="btn ghost sm"
                onClick={() => {
                  setPanel('none');
                  setNoteDraft('');
                  setNoteMentions([]);
                }}
              >
                Cancel
              </button>
              <button className="btn primary sm" onClick={postNote} disabled={!noteDraft.trim()}>
                Post note
              </button>
            </div>
          </div>
        )}

        {panel === 'times' && (
          <div className="cal-popover-time-form">
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Adjust check-in / check-out
            </div>
            <label style={{ display: 'block', fontSize: 11, marginBottom: 4 }}>
              Check-in
              <input
                type="datetime-local"
                value={checkInDraft}
                onChange={(e) => setCheckInDraft(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 2, padding: 4, fontSize: 12 }}
              />
            </label>
            <label style={{ display: 'block', fontSize: 11, marginBottom: 4 }}>
              Check-out
              <input
                type="datetime-local"
                value={checkOutDraft}
                onChange={(e) => setCheckOutDraft(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 2, padding: 4, fontSize: 12 }}
              />
            </label>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, marginBottom: 6 }}>
              Saving queues a high-priority Guesty-sync task for the ops manager until the integration lands.
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                className="btn ghost sm"
                onClick={() => {
                  setPanel('none');
                  setCheckInDraft(rsv.checkIn.slice(0, 16));
                  setCheckOutDraft(rsv.checkOut.slice(0, 16));
                }}
              >
                Cancel
              </button>
              <button className="btn primary sm" onClick={saveTimes}>
                Save
              </button>
            </div>
          </div>
        )}

        {panel === 'none' && (
          <>
            <div className="cal-popover-actions">
              {localReservationTools && (
                <button
                  className="btn ghost sm"
                  onClick={() => setPanel('note')}
                  title="Attach an internal note to this stay"
                >
                  + Note
                </button>
              )}
              <button
                className="btn ghost sm"
                onClick={() => onCreateTask(rsv)}
                title="Create a task linked to this reservation"
              >
                + Task
              </button>
              {localReservationTools && (
                <button
                  className="btn ghost sm"
                  onClick={() => setPanel('times')}
                  title="Change check-in or check-out time"
                >
                  Adjust times
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                className="btn sm"
                onClick={() => window.location.assign(`/fad?m=reservations&sub=overview&rsv=${rsv.id}`)}
              >
                Open reservation
              </button>
              <button
                className="btn ghost sm"
                onClick={() =>
                  window.location.assign(`/fad?m=operations&sub=all&rsv=${rsv.id}`)
                }
              >
                Linked tasks
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ReservationNoteItem({ note }: { note: ReservationNote }) {
  const author = TASK_USER_BY_ID[note.authorId];
  return (
    <div className="cal-popover-note-item">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        {author && (
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              borderRadius: 7,
              background: author.avatarColor,
              color: 'white',
              fontSize: 8,
              textAlign: 'center',
              lineHeight: '14px',
              fontWeight: 500,
            }}
          >
            {author.initials}
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 500 }}>{note.authorName}</span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
          {formatNoteTs(note.createdAt)}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
        {note.body}
      </div>
    </div>
  );
}

function formatNoteTs(iso: string): string {
  const d = new Date(iso);
  const today = new Date('2026-04-27T12:00:00');
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function NewEventModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fad-modal-overlay" onClick={onClose}>
      <div className="fad-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fad-modal-head">
          <div className="fad-modal-title">New event</div>
          <button className="fad-util-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="fad-modal-body">
          <div className="fad-field">
            <label>Title</label>
            <input placeholder="e.g. Owner call · Nitzana" defaultValue="" />
          </div>
          <div className="fad-field">
            <label>Type</label>
            <select defaultValue="meeting">
              {EVENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="fad-field">
              <label>Day</label>
              <input type="date" defaultValue={TODAY_ISO} />
            </div>
            <div className="fad-field">
              <label>Start</label>
              <select>
                {Array.from({ length: 14 }, (_, i) => 7 + i).map((h) => (
                  <option key={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
          </div>
          <div className="fad-field">
            <label>Property (optional)</label>
            <input placeholder="—" />
          </div>
          <div className="fad-field">
            <label>Notes</label>
            <textarea rows={3} placeholder="What's this about?" />
          </div>
        </div>
        <div className="fad-modal-foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={onClose}>
            Create event
          </button>
        </div>
      </div>
    </div>
  );
}
