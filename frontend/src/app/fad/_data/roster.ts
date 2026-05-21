// @demo:data — Staff roster — GET /api/hr/roster
// Tag: PROD-DATA-10 — see frontend/DEMO_CRUFT.md

// Roster fixtures — Franny's weekly publishing tool.
// v3 model: availability + zone (split), no shift times. Roster is availability, not schedule.
// Source brief §4.1.

export type Availability = 'on' | 'off' | 'leave' | 'standby';
export type Zone = 'north' | 'west';

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  on: 'On',
  off: 'Off',
  leave: 'Leave',
  standby: 'Stand-by',
};

export const ZONE_LABEL: Record<Zone, string> = {
  north: 'North',
  west: 'West',
};

/**
 * Render hint — the UI combines (availability, zone) into a single chip.
 * - on + 'north' → "North" badge
 * - on + 'west'  → "West" badge
 * - on + null    → "On" badge
 * - off          → "Off"
 * - standby      → "Stand-by"
 * - leave        → "Leave"
 */
export const AVAILABILITY_COLOR: Record<Availability, { bg: string; fg: string }> = {
  on: { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)' },
  off: { bg: 'var(--color-bg-danger)', fg: 'var(--color-text-danger)' },
  leave: { bg: 'var(--color-bg-warning)', fg: 'var(--color-text-warning)' },
  standby: { bg: 'var(--color-background-tertiary)', fg: 'var(--color-text-secondary)' },
};

export const ZONE_COLOR: Record<Zone, { bg: string; fg: string }> = {
  north: { bg: 'var(--color-bg-success)', fg: 'var(--color-text-success)' },
  west: { bg: 'var(--color-bg-info)', fg: 'var(--color-text-info)' },
};

export interface RosterDay {
  id?: string;
  userId: string;
  staffId?: string;
  date: string; // YYYY-MM-DD
  availability: Availability;
  zone?: Zone | null;
  notes?: string;
  leaveType?: 'annual' | 'sick' | 'personal';
  startTime?: string | null;
  endTime?: string | null;
  updatedAt?: string | null;
}

export interface RosterWeek {
  id: string;
  weekStart: string; // Monday YYYY-MM-DD
  weekEnd: string;   // Sunday
  status: 'draft' | 'published' | 'archived';
  publishedAt?: string;
  publishedBy?: string;
  publishedToBreezeway?: boolean;
  /** AI suggestion engine state */
  aiSuggested?: boolean;
  aiSuggestedAt?: string;
  aiNotes?: string;
  /** Pre-publish constraint flags */
  aiConstraintWarnings?: string[];
  days: RosterDay[];
}

// @demo:data — Tag: PROD-DATA-39 — see frontend/DEMO_CRUFT.md
export const ROSTER_USERS_ORDER = [
  'u-ishant',
  'u-mathias',
  'u-mary',
  'u-bryan',
  'u-franny',
  'u-alex',
  'u-catherine',
];

// ───── Cell builder helpers ─────

type CellSpec = Availability | { availability: Availability; zone?: Zone | null; leaveType?: RosterDay['leaveType'] };

function cellToDay(userId: string, date: string, spec: CellSpec): RosterDay {
  if (typeof spec === 'string') {
    return { userId, date, availability: spec, zone: null };
  }
  return {
    userId,
    date,
    availability: spec.availability,
    zone: spec.zone ?? null,
    leaveType: spec.leaveType,
  };
}

function buildWeek(
  base: Omit<RosterWeek, 'days'>,
  dates: string[],
  matrix: Record<string, CellSpec[]>,
): RosterWeek {
  return {
    ...base,
    days: ROSTER_USERS_ORDER.flatMap((userId) =>
      dates.map((date, i) => cellToDay(userId, date, matrix[userId][i])),
    ),
  };
}

// ───── Last week (published, archived) ─────

const LAST_WEEK_DATES = [
  '2026-04-20', // Mon
  '2026-04-21', // Tue
  '2026-04-22', // Wed
  '2026-04-23', // Thu
  '2026-04-24', // Fri
  '2026-04-25', // Sat
  '2026-04-26', // Sun
];

const lastWeekMatrix: Record<string, CellSpec[]> = {
  // Mathias was on leave Mon-Tue (sick request to-005)
  'u-ishant':    ['on', 'on', 'on', 'on', 'on', 'on', 'off'],
  'u-mathias':   [{ availability: 'leave', leaveType: 'sick' }, { availability: 'leave', leaveType: 'sick' }, 'on', 'on', 'on', 'off', 'off'],
  'u-mary':      ['on', 'on', 'on', 'off', 'on', 'on', 'on'],
  'u-bryan':     ['off', { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'west' }, 'standby', { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }],
  'u-franny':    ['on', 'on', 'on', 'on', 'on', 'off', 'on'],
  'u-alex':      ['standby', { availability: 'on', zone: 'west' }, 'off', { availability: 'on', zone: 'west' }, 'on', 'on', { availability: 'on', zone: 'west' }],
  // Catherine never works Sundays per weeklyConstraints — last week respected
  'u-catherine': [{ availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, 'off'],
};

export const ROSTER_LAST_WEEK: RosterWeek = buildWeek(
  {
    id: 'rw-2026-04-20',
    weekStart: '2026-04-20',
    weekEnd: '2026-04-26',
    status: 'published',
    publishedAt: '2026-04-17T16:00:00',
    publishedBy: 'u-franny',
    publishedToBreezeway: true,
  },
  LAST_WEEK_DATES,
  lastWeekMatrix,
);

// ───── This week (draft, AI-suggested) ─────

const THIS_WEEK_DATES = [
  '2026-04-27', // Mon (today)
  '2026-04-28', // Tue
  '2026-04-29', // Wed
  '2026-04-30', // Thu
  '2026-05-01', // Fri
  '2026-05-02', // Sat
  '2026-05-03', // Sun
];

const thisWeekMatrix: Record<string, CellSpec[]> = {
  'u-ishant':    ['on', 'on', 'on', 'on', 'on', 'off', 'off'],
  // Mathias never weekends (commercial_marketing weeklyConstraints)
  'u-mathias':   ['on', 'on', 'on', 'on', 'on', 'off', 'off'],
  'u-mary':      ['on', 'on', 'off', 'on', 'on', 'on', 'on'],
  'u-bryan':     [{ availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, 'standby', { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, 'off'],
  'u-franny':    ['on', 'on', 'on', 'on', 'on', 'on', 'off'],
  'u-alex':      [{ availability: 'on', zone: 'west' }, { availability: 'on', zone: 'west' }, { availability: 'on', zone: 'west' }, { availability: 'on', zone: 'west' }, 'on', 'standby', 'off'],
  // Catherine never Sundays — she's on Mon and off Sun. Pending PTO May 4 (Mon next week).
  'u-catherine': [{ availability: 'on', zone: 'north' }, 'off', { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, { availability: 'on', zone: 'north' }, 'off'],
};

export const ROSTER_THIS_WEEK: RosterWeek = buildWeek(
  {
    id: 'rw-2026-04-27',
    weekStart: '2026-04-27',
    weekEnd: '2026-05-03',
    status: 'draft',
    aiSuggested: true,
    aiSuggestedAt: '2026-04-26T18:00:00',
    aiNotes:
      'Suggested based on: 12 cleaning tasks Mon-Wed (5 north, 4 west, 3 admin), 4 maintenance jobs at LB-2 + LV-10 (west zone, Mathias has both), Catherine off Tue (PTO request approved Apr 23). Bryan kept on north zone — has 7 tasks at GBH-* + PT-3 this week. Mary off Wed (childcare day per recurring pattern).',
    aiConstraintWarnings: [
      'Bryan only has 1 standby day (Wed) — within 5+1+1 spec.',
      'West zone gap on Sat: Alex on standby, no other west body. Consider on-call protocol.',
    ],
  },
  THIS_WEEK_DATES,
  thisWeekMatrix,
);

// ───── Next week (empty draft, awaiting AI suggest) ─────

const NEXT_WEEK_DATES = [
  '2026-05-04',
  '2026-05-05',
  '2026-05-06',
  '2026-05-07',
  '2026-05-08',
  '2026-05-09',
  '2026-05-10',
];

const nextWeekMatrix: Record<string, CellSpec[]> = {
  'u-ishant':    ['on', 'on', 'on', 'on', 'on', 'on', 'on'],
  'u-mathias':   ['on', 'on', 'on', 'on', 'on', 'on', 'on'],
  'u-mary':      ['on', 'on', 'on', 'on', 'on', 'on', 'on'],
  'u-bryan':     ['on', 'on', 'on', 'on', 'on', 'on', 'on'],
  'u-franny':    ['on', 'on', 'on', 'on', 'on', 'on', 'on'],
  'u-alex':      ['on', 'on', 'on', 'on', 'on', 'on', 'on'],
  'u-catherine': ['on', 'on', 'on', 'on', 'on', 'on', 'on'],
};

export const ROSTER_NEXT_WEEK: RosterWeek = buildWeek(
  {
    id: 'rw-2026-05-04',
    weekStart: '2026-05-04',
    weekEnd: '2026-05-10',
    status: 'draft',
    aiSuggested: false,
  },
  NEXT_WEEK_DATES,
  nextWeekMatrix,
);

export const ROSTERS = [ROSTER_LAST_WEEK, ROSTER_THIS_WEEK, ROSTER_NEXT_WEEK];

// ───── Workload preview (left pane of Roster page §4.2) ─────

export interface WorkloadCell {
  zone: 'north' | 'west' | 'office';
  department: 'cleaning' | 'inspection' | 'maintenance' | 'office';
  count: number;
}

export interface WorkloadDay {
  date: string;       // YYYY-MM-DD
  totalTasks: number;
}

export interface WorkloadPreview {
  weekStart: string;
  weekEnd: string;
  /** Per zone × department aggregation across the week. */
  byZoneDept: WorkloadCell[];
  /** Per day, total tasks scheduled (drives the heatmap). */
  byDay: WorkloadDay[];
  heaviestDay: string;
  heaviestCount: number;
  lightestDay: string;
  lightestCount: number;
}

// @demo:data — Tag: PROD-DATA-40 — see frontend/DEMO_CRUFT.md
export const WORKLOAD_THIS_WEEK: WorkloadPreview = {
  weekStart: '2026-04-27',
  weekEnd: '2026-05-03',
  byZoneDept: [
    { zone: 'north', department: 'cleaning', count: 12 },
    { zone: 'north', department: 'inspection', count: 3 },
    { zone: 'north', department: 'maintenance', count: 2 },
    { zone: 'west', department: 'cleaning', count: 8 },
    { zone: 'west', department: 'inspection', count: 4 },
    { zone: 'west', department: 'maintenance', count: 5 },
    { zone: 'office', department: 'office', count: 10 },
  ],
  byDay: [
    { date: '2026-04-27', totalTasks: 7 },
    { date: '2026-04-28', totalTasks: 6 },
    { date: '2026-04-29', totalTasks: 9 },
    { date: '2026-04-30', totalTasks: 6 },
    { date: '2026-05-01', totalTasks: 5 },
    { date: '2026-05-02', totalTasks: 3 },
    { date: '2026-05-03', totalTasks: 2 },
  ],
  heaviestDay: '2026-04-29',
  heaviestCount: 9,
  lightestDay: '2026-05-03',
  lightestCount: 2,
};

// ───────────────── User Schedule (live hour grid, used by Tasks > Schedule page if ever) ─────────────────
// Note: Schedule sub-page is dropped from Phase 1 per brief §3.1, but blocks here are
// also used by the "today's schedule" surface in Daily Brief / Tasks Overview.

export interface ScheduleBlock {
  id: string;
  userId: string;
  taskId: string;
  date: string;
  startTime: string; // HH:MM
  endTime: string;
  title: string;
  propertyCode: string;
  department: string;
  status: 'todo' | 'in_progress' | 'paused' | 'completed';
}

export const SCHEDULE_BLOCKS: ScheduleBlock[] = [
  // Alex — pre-arrival inspection + runner
  { id: 'sb-1', userId: 'u-alex', taskId: 't-003', date: '2026-04-27', startTime: '10:00', endTime: '11:30', title: 'Pre-arrival inspection', propertyCode: 'RC-15', department: 'inspection', status: 'in_progress' },
  { id: 'sb-2', userId: 'u-alex', taskId: 't-011', date: '2026-04-27', startTime: '12:00', endTime: '12:45', title: 'Runner — store→VV-47→SD-10', propertyCode: 'OFFICE', department: 'office', status: 'todo' },
  { id: 'sb-3', userId: 'u-alex', taskId: 't-007', date: '2026-04-27', startTime: '13:00', endTime: '15:00', title: 'Replace table glass', propertyCode: 'LB-2', department: 'maintenance', status: 'todo' },

  // Bryan — turnover at GBH-C8 + amenities at VV-47
  { id: 'sb-4', userId: 'u-bryan', taskId: 't-004', date: '2026-04-27', startTime: '11:00', endTime: '14:00', title: 'Standard clean — turnover', propertyCode: 'GBH-C8', department: 'cleaning', status: 'todo' },
  { id: 'sb-5', userId: 'u-bryan', taskId: 't-012', date: '2026-04-27', startTime: '14:30', endTime: '15:30', title: 'Buy missing amenities', propertyCode: 'VV-47', department: 'cleaning', status: 'in_progress' },
  { id: 'sb-6', userId: 'u-bryan', taskId: 't-013', date: '2026-04-27', startTime: '16:00', endTime: '16:30', title: 'Collect Rs 38,000 from Li Da', propertyCode: 'GBH-C3', department: 'office', status: 'in_progress' },

  // Mathias — A/C urgent + admin
  { id: 'sb-7', userId: 'u-mathias', taskId: 't-006', date: '2026-04-27', startTime: '08:30', endTime: '10:00', title: 'A/C — site visit', propertyCode: 'LB-2', department: 'maintenance', status: 'in_progress' },
  { id: 'sb-8', userId: 'u-mathias', taskId: 't-006', date: '2026-04-27', startTime: '14:00', endTime: '16:30', title: 'A/C — install + test', propertyCode: 'LB-2', department: 'maintenance', status: 'todo' },

  // Mary — admin + linen
  { id: 'sb-9', userId: 'u-mary', taskId: 't-016', date: '2026-04-27', startTime: '09:00', endTime: '12:00', title: 'Setup Linen Service Area', propertyCode: 'OFFICE', department: 'office', status: 'todo' },

  // Franny — coordination
  { id: 'sb-10', userId: 'u-franny', taskId: 't-002', date: '2026-04-27', startTime: '08:30', endTime: '09:15', title: 'Plan Linen Service', propertyCode: 'OFFICE', department: 'office', status: 'todo' },
  { id: 'sb-11', userId: 'u-franny', taskId: 't-013', date: '2026-04-27', startTime: '10:00', endTime: '10:30', title: 'Collect Rs 38,000 — coordinate', propertyCode: 'GBH-C3', department: 'office', status: 'in_progress' },

  // Ishant — admin
  { id: 'sb-12', userId: 'u-ishant', taskId: 't-001', date: '2026-04-27', startTime: '09:00', endTime: '10:00', title: 'Get Prices', propertyCode: 'OFFICE', department: 'office', status: 'paused' },

  // Catherine — north zone (off Tue, on Mon — already up at PT-3)
  { id: 'sb-13', userId: 'u-catherine', taskId: 't-021', date: '2026-04-27', startTime: '08:00', endTime: '08:45', title: 'Post-clean inspection follow-up', propertyCode: 'PT-3', department: 'inspection', status: 'completed' },
];
