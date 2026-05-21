// @demo:data — Operations tasks — GET /api/operations/tasks
// Tag: PROD-DATA-2 — see frontend/DEMO_CRUFT.md

// Tasks module fixtures — Phase 1 (Breezeway-API-shaped, fixture-backed).
// Today: 2026-04-27 Monday. Week: 2026-04-27 → 2026-05-03.
//
// Source brief: fad-tasks-build-brief-v3.md (§4.1, §5.1, §7.2, §7.4)
// Writes go through breezeway.ts shim, never mutate TASKS directly.

// ───────────────── Type definitions ─────────────────

export type Department = 'cleaning' | 'inspection' | 'maintenance' | 'office';

export type Subdepartment =
  | 'standard_clean'
  | 'deep_clean'
  | 'linen'
  | 'pre_arrival'
  | 'post_clean'
  | 'plumbing'
  | 'electrical'
  | 'carpentry'
  | 'aircon'
  | 'pool'
  | 'garden'
  | 'amenities'
  | 'admin'
  | 'guest_services';

export type TaskStatus =
  | 'reported'
  | 'scheduled'
  | 'ready'
  | 'in_progress'
  | 'paused'
  | 'blocked'
  | 'completed'
  | 'closed'
  | 'cancelled';

export type TaskPriority = 'lowest' | 'low' | 'medium' | 'high' | 'urgent';

export type TaskSource =
  | 'manual'
  | 'breezeway'
  | 'inbox_ai'
  | 'guesty'
  | 'recurring'
  | 'reservation_trigger'
  | 'group_email'
  | 'friday'
  | 'reported_issue'
  | 'personal'
  | 'review';

export type TaskVisibility = 'all' | 'team' | 'self';

export type RiskFlag =
  | 'overdue'
  | 'no_progress'
  | 'blocked_access'
  | 'over_time'
  | 'unassigned'
  | 'reservation_imminent';

export type ActivityKind =
  | 'created'
  | 'assigned'
  | 'unassigned'
  | 'status_changed'
  | 'priority_changed'
  | 'commented'
  | 'cost_added'
  | 'risk_flagged'
  | 'ai_suggested'
  | 'approved'
  | 'rejected'
  | 'reassigned'
  | 'rescheduled'
  | 'updated';

// ───────────────── Users (staff) ─────────────────

export interface TaskUser {
  id: string;
  name: string;
  initials: string;
  email?: string;
  role: 'director' | 'commercial_marketing' | 'ops_manager' | 'field' | 'external';
  homeZone?: 'north' | 'west' | null;
  skills?: string[];
  weeklyConstraints?: {
    neverWorks?: ('saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday')[];
  };
  notificationChannel: 'fad_inbox' | 'slack' | 'whatsapp' | 'email' | 'print_only';
  startDate: string;
  endDate?: string;
  active: boolean;
  avatarColor: string;
}

// @demo:data — Tag: PROD-DATA-38 — see frontend/DEMO_CRUFT.md
export const TASK_USERS: TaskUser[] = [
  {
    id: 'u-judith',
    name: 'Judith Friday',
    initials: 'JF',
    email: 'judith@friday.mu',
    role: 'director',
    notificationChannel: 'fad_inbox',
    startDate: '2024-01-01',
    active: true,
    avatarColor: '#7c3aed',
  },
  {
    id: 'u-ishant',
    name: 'Ishant Ayadassen',
    initials: 'IA',
    email: 'ishant@friday.mu',
    role: 'director',
    notificationChannel: 'fad_inbox',
    startDate: '2024-01-01',
    active: true,
    avatarColor: '#10b981',
  },
  {
    id: 'u-mathias',
    name: 'Mathias David',
    initials: 'MD',
    email: 'mathias@friday.mu',
    role: 'commercial_marketing',
    skills: ['marketing', 'guest_services', 'maintenance'],
    weeklyConstraints: {
      neverWorks: ['saturday', 'sunday'],
    },
    notificationChannel: 'fad_inbox',
    startDate: '2024-03-15',
    active: true,
    avatarColor: '#84cc16',
  },
  {
    id: 'u-franny',
    name: 'Franny Henri',
    initials: 'FH',
    email: 'franny@friday.mu',
    role: 'ops_manager',
    skills: ['cleaning', 'inspection', 'guest_services'],
    notificationChannel: 'fad_inbox',
    startDate: '2024-02-01',
    active: true,
    avatarColor: '#0ea5e9',
  },
  {
    id: 'u-mary',
    name: 'Mary Cluthwise',
    initials: 'MC',
    email: 'mary@friday.mu',
    role: 'field',
    skills: ['admin', 'cleaning'],
    notificationChannel: 'whatsapp',
    startDate: '2024-04-01',
    endDate: '2026-05-31', // departure announced
    active: true,
    avatarColor: '#ec4899',
  },
  {
    id: 'u-bryan',
    name: 'Bryan Henri',
    initials: 'BH',
    email: 'bryan@friday.mu',
    role: 'field',
    homeZone: 'north',
    skills: ['maintenance', 'plumbing', 'electrical', 'carpentry'],
    notificationChannel: 'whatsapp',
    startDate: '2024-05-15',
    active: true,
    avatarColor: '#ef4444',
  },
  {
    id: 'u-alex',
    name: 'Alex Legentil',
    initials: 'AL',
    email: 'alex@friday.mu',
    role: 'field',
    homeZone: 'west',
    skills: ['cleaning', 'inspection', 'amenities'],
    notificationChannel: 'whatsapp',
    startDate: '2024-06-01',
    active: true,
    avatarColor: '#f59e0b',
  },
  {
    id: 'u-catherine',
    name: 'Catherine Henri',
    initials: 'CH',
    email: 'catherine@friday.mu',
    role: 'field',
    homeZone: 'north',
    skills: ['cleaning', 'inspection'],
    weeklyConstraints: {
      neverWorks: ['sunday'],
    },
    notificationChannel: 'whatsapp',
    startDate: '2024-09-15',
    active: true,
    avatarColor: '#6366f1',
  },
  {
    id: 'u-oracle',
    name: 'Oracle Cleaning Co.',
    initials: 'OC',
    role: 'external',
    notificationChannel: 'email',
    startDate: '2024-01-01',
    active: true,
    avatarColor: '#64748b',
  },
];

// ───────────────── Properties ─────────────────

// PropertyZone + TaskProperty + TASK_PROPERTIES retained as back-compat shims.
// Canonical source moved to `_data/properties.ts` (v0.2 LOCKED). Will be
// removed in commit 4 of the Properties rebuild — consumers should update
// imports to read `Property` from `_data/properties.ts` directly.
import { TASK_PROPERTIES_SHIM } from './properties';
export type { PropertyZone } from './properties';

export interface TaskProperty {
  code: string;
  name: string;
  zone: import('./properties').PropertyZone;
  tier: 'small' | 'medium' | 'big';
}

export const TASK_PROPERTIES: TaskProperty[] = TASK_PROPERTIES_SHIM;

// ───────────────── Constants ─────────────────

export const SUBDEPT_LABEL: Record<Subdepartment, string> = {
  standard_clean: 'Standard clean',
  deep_clean: 'Deep clean',
  linen: 'Linen service',
  pre_arrival: 'Pre-arrival',
  post_clean: 'Post-clean inspection',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  carpentry: 'Carpentry',
  aircon: 'A/C',
  pool: 'Pool',
  garden: 'Garden',
  amenities: 'Amenities',
  admin: 'Admin',
  guest_services: 'Guest services',
};

export const SUBDEPT_BY_DEPT: Record<Department, Subdepartment[]> = {
  cleaning: ['standard_clean', 'deep_clean', 'linen', 'pre_arrival', 'amenities'],
  inspection: ['post_clean', 'pre_arrival'],
  maintenance: ['plumbing', 'electrical', 'carpentry', 'aircon', 'pool', 'garden'],
  office: ['admin', 'guest_services'],
};

// ───────────────── Inner shapes ─────────────────

export interface AISuggestion {
  kind:
    | 'urgency_bump'
    | 'route'
    | 'assign'
    | 'risk'
    | 'thread_summary'
    | 'duplicate'
    | 'reservation_aware'
    | 'owner_charge'
    | 'next_action'
    | 'similar_past';
  confidence: number;
  message: string;
  /** suggested value depending on kind: assignee id, department, etc. */
  value?: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  text: string;
  ts: string;
  mentions?: string[];
  syncedToBreezeway?: boolean;
}

export interface TaskCost {
  id: string;
  type: 'labor' | 'material' | 'expense' | 'tax' | 'skilled_labor' | 'unskilled_labor' | 'mileage' | 'markup';
  amount: number;
  currency: 'MUR' | 'EUR';
  description: string;
  addedBy: string;
  /** Owner-billable line — flows to Finance as Path-A passthrough capture (T8). */
  ownerCharge?: boolean;
  /** Set by the integration when the line has flowed to a Finance expense. */
  flowedToFinanceExpenseId?: string;
}

export type TaskRequirementKind =
  | 'check'
  | 'photo'
  | 'file'
  | 'expense'
  | 'supply'
  | 'time'
  | 'summary';

export interface TaskRequirement {
  id: string;
  label: string;
  kind: TaskRequirementKind;
  required: boolean;
  description?: string;
  evidenceHint?: string;
  gate?: string;
}

export interface TaskRequirementState {
  completedIds: string[];
  waivedIds: string[];
  updatedAt?: string;
}

export interface ActivityEntry {
  id: string;
  ts: string;
  kind: ActivityKind;
  actorId: string;
  detail?: string;
}

// ───────────────── Task ─────────────────

export interface Task {
  id: string;
  bzId?: string;
  externalRef?: string;
  title: string;
  description?: string;
  propertyCode: string;
  department: Department;
  subdepartment: Subdepartment;
  priority: TaskPriority;
  status: TaskStatus;
  source: TaskSource;
  visibility: TaskVisibility;
  assigneeIds: string[];
  requesterId?: string;
  dueDate: string;
  dueTime?: string;
  estimatedMinutes?: number;
  spentMinutes?: number;
  reservationId?: string;
  /** Convenience rollup — true when any cost line has ownerCharge=true. */
  ownerCharge?: boolean;
  attachmentCount: number;
  comments: TaskComment[];
  costs: TaskCost[];
  requirements?: TaskRequirement[];
  requirementState?: TaskRequirementState;
  isRecurring?: boolean;
  template?: string;
  tags: string[];
  riskFlags: RiskFlag[];
  aiSuggestions: AISuggestion[];
  activityLog: ActivityEntry[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** AI-drafted, needs human green-light before push to Breezeway */
  awaitingHumanApproval?: boolean;
  inboxThreadId?: string;
  groupEmailId?: string;
}

// ───────────────── Date helpers (today = 2026-04-27 Mon) ─────────────────

// @demo:logic — Tag: PROD-LOGIC-7 — see frontend/DEMO_CRUFT.md. Replace with real Date.now() / server now().
const today = '2026-04-27';
const tomorrow = '2026-04-28';
const wed = '2026-04-29';
const thu = '2026-04-30';
const fri = '2026-05-01';
const sat = '2026-05-02';
const yesterday = '2026-04-26';

// ───────────────── Tasks (existing 25 + 6 new = 31 total) ─────────────────

export const TASKS: Task[] = [
  {
    id: 't-001',
    bzId: '136436973',
    title: 'Get Prices for these Items',
    description: 'Centerpiece, Artificial Plants, Bar Stools/Chairs — get latest quotes from 3 suppliers for VV-47 living room refresh.',
    propertyCode: 'OFFICE',
    department: 'office',
    subdepartment: 'admin',
    priority: 'medium',
    status: 'paused',
    source: 'breezeway',
    visibility: 'all',
    assigneeIds: ['u-ishant', 'u-franny', 'u-judith'],
    requesterId: 'u-ishant',
    dueDate: today,
    estimatedMinutes: 60,
    spentMinutes: 32,
    attachmentCount: 45,
    comments: [
      { id: 'c-001-1', authorId: 'u-alex', text: '@Ishant Ayadassen get all in attachment', ts: '2026-02-27T09:00:00', mentions: ['u-ishant'], syncedToBreezeway: true },
    ],
    costs: [],
    tags: [],
    riskFlags: ['no_progress'],
    aiSuggestions: [
      { kind: 'risk', confidence: 0.84, message: 'Paused 32 min ago with no comment — likely blocked. Consider pinging Alex.' },
    ],
    activityLog: [
      { id: 'a-001-1', ts: '2026-03-05T10:00:00', kind: 'created', actorId: 'u-ishant' },
      { id: 'a-001-2', ts: '2026-04-22T14:30:00', kind: 'status_changed', actorId: 'u-ishant', detail: 'scheduled → paused' },
    ],
    createdAt: '2026-03-05T10:00:00',
    updatedAt: '2026-04-22T14:30:00',
  },
  {
    id: 't-002',
    bzId: '136500144',
    title: 'Plan for Linen Service',
    description: 'Coordinate weekly linen drop with Oracle. 6 properties, swap on Mon/Thu.',
    propertyCode: 'OFFICE',
    department: 'office',
    subdepartment: 'admin',
    priority: 'medium',
    status: 'scheduled',
    source: 'breezeway',
    visibility: 'all',
    assigneeIds: ['u-franny'],
    requesterId: 'u-judith',
    dueDate: today,
    estimatedMinutes: 45,
    attachmentCount: 0,
    comments: [
      { id: 'c-002-1', authorId: 'u-franny', text: 'Will reach out to Oracle today', ts: '2026-04-27T08:30:00', syncedToBreezeway: true },
      { id: 'c-002-2', authorId: 'u-judith', text: '@Franny Henri pls confirm Sunday count from Oracle by 3pm', ts: '2026-04-27T09:15:00', mentions: ['u-franny'], syncedToBreezeway: true },
      { id: 'c-002-3', authorId: 'u-franny', text: 'On it.', ts: '2026-04-27T09:18:00', syncedToBreezeway: true },
    ],
    costs: [
      { id: 'cs-002-1', type: 'expense', amount: 1500, currency: 'MUR', description: 'Oracle weekly linen — internal cost', addedBy: 'u-franny', ownerCharge: false },
    ],
    tags: ['recurring'],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-002-1', ts: '2026-04-22T09:00:00', kind: 'created', actorId: 'u-judith' },
      { id: 'a-002-2', ts: '2026-04-22T09:01:00', kind: 'assigned', actorId: 'u-judith', detail: '→ Franny' },
      { id: 'a-002-3', ts: '2026-04-27T09:18:00', kind: 'commented', actorId: 'u-franny', detail: 'On it.' },
    ],
    createdAt: '2026-04-22T09:00:00',
    updatedAt: '2026-04-27T09:18:00',
  },
  {
    id: 't-003',
    bzId: '136500201',
    title: 'Pre-arrival inspection',
    description: 'Full pre-arrival check: amenities stocked, AC test, wifi, pool clarity, welcome basket.',
    propertyCode: 'RC-15',
    department: 'inspection',
    subdepartment: 'pre_arrival',
    priority: 'urgent',
    status: 'in_progress',
    source: 'reservation_trigger',
    visibility: 'all',
    assigneeIds: ['u-alex'],
    requesterId: 'u-franny',
    dueDate: today,
    dueTime: '12:00',
    estimatedMinutes: 90,
    spentMinutes: 28,
    reservationId: 'rsv-rc15-thomas',
    attachmentCount: 12,
    comments: [
      { id: 'c-003-1', authorId: 'u-alex', text: 'Welcome basket missing 2 items — flagging', ts: '2026-04-27T09:42:00', syncedToBreezeway: true },
    ],
    costs: [],
    tags: ['guest-arriving'],
    riskFlags: ['reservation_imminent'],
    aiSuggestions: [
      { kind: 'reservation_aware', confidence: 0.96, message: 'Guest checks in at 14:00 today. Task must close by 13:30.' },
    ],
    activityLog: [
      { id: 'a-003-1', ts: '2026-04-25T08:00:00', kind: 'created', actorId: 'u-franny', detail: 'Auto-created from check-in trigger' },
      { id: 'a-003-2', ts: '2026-04-25T08:01:00', kind: 'assigned', actorId: 'u-franny', detail: '→ Alex' },
      { id: 'a-003-3', ts: '2026-04-27T09:00:00', kind: 'status_changed', actorId: 'u-alex', detail: 'scheduled → in_progress' },
      { id: 'a-003-4', ts: '2026-04-27T09:42:00', kind: 'commented', actorId: 'u-alex', detail: 'Welcome basket missing 2 items' },
    ],
    createdAt: '2026-04-25T08:00:00',
    updatedAt: '2026-04-27T09:42:00',
  },
  {
    id: 't-004',
    bzId: '136500220',
    title: 'Standard clean — checkout turnover',
    description: 'Full checkout clean. Linen swap. Restock amenities. AC + Wifi test.',
    propertyCode: 'GBH-C8',
    department: 'cleaning',
    subdepartment: 'standard_clean',
    priority: 'high',
    status: 'scheduled',
    source: 'reservation_trigger',
    visibility: 'all',
    assigneeIds: ['u-bryan'],
    dueDate: today,
    dueTime: '11:00',
    estimatedMinutes: 180,
    reservationId: 'rsv-gbh-c8-out',
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: ['reservation_imminent'],
    aiSuggestions: [
      { kind: 'reservation_aware', confidence: 0.92, message: 'New guest at 14:00. Cleaning must be done by 13:00.' },
    ],
    activityLog: [
      { id: 'a-004-1', ts: '2026-04-26T18:00:00', kind: 'created', actorId: 'u-franny', detail: 'Auto-created from checkout trigger' },
    ],
    createdAt: '2026-04-26T18:00:00',
    updatedAt: '2026-04-26T18:00:00',
  },
  {
    id: 't-005',
    bzId: '136500301',
    title: 'Deep clean — between long stays',
    description: 'Full deep clean: oven inside, fridge defrost + clean, all baseboards, window tracks, balcony tiles.',
    propertyCode: 'BL-12',
    department: 'cleaning',
    subdepartment: 'deep_clean',
    priority: 'medium',
    status: 'scheduled',
    source: 'manual',
    visibility: 'all',
    assigneeIds: ['u-mary', 'u-bryan'],
    requesterId: 'u-franny',
    dueDate: tomorrow,
    estimatedMinutes: 360,
    attachmentCount: 3,
    comments: [],
    costs: [
      { id: 'cs-005-1', type: 'material', amount: 600, currency: 'MUR', description: 'Cleaning supplies (mold removers, fridge cleaner)', addedBy: 'u-bryan', ownerCharge: true },
    ],
    ownerCharge: true,
    tags: [],
    riskFlags: [],
    aiSuggestions: [
      { kind: 'assign', confidence: 0.78, message: 'Bryan is on North zone Tue — good fit for BL-12 (also north).' },
    ],
    activityLog: [
      { id: 'a-005-1', ts: '2026-04-23T10:00:00', kind: 'created', actorId: 'u-franny' },
    ],
    createdAt: '2026-04-23T10:00:00',
    updatedAt: '2026-04-23T10:00:00',
  },
  {
    id: 't-006',
    bzId: '136400118',
    title: 'A/C not cooling — guest complaint',
    description: 'Living room split unit blowing warm air. Guest reported via WhatsApp 22:15 last night.',
    propertyCode: 'LB-2',
    department: 'maintenance',
    subdepartment: 'aircon',
    priority: 'urgent',
    status: 'in_progress',
    source: 'inbox_ai',
    visibility: 'all',
    assigneeIds: ['u-mathias'],
    requesterId: 'u-franny',
    dueDate: today,
    dueTime: '10:00',
    estimatedMinutes: 90,
    spentMinutes: 45,
    inboxThreadId: 'inb-lb2-guest-22',
    attachmentCount: 4,
    comments: [
      { id: 'c-006-1', authorId: 'u-mathias', text: 'On site. Looks like compressor — calling Coolbreeze for parts ETA.', ts: '2026-04-27T08:45:00', syncedToBreezeway: true },
      { id: 'c-006-2', authorId: 'u-franny', text: '@Mathias David need ETA before 11am to update guest', ts: '2026-04-27T08:50:00', mentions: ['u-mathias'], syncedToBreezeway: true },
      { id: 'c-006-3', authorId: 'u-mathias', text: 'Coolbreeze: parts at 14:00, fix by 16:00. Approving spend Rs 4,800.', ts: '2026-04-27T09:20:00', syncedToBreezeway: true },
    ],
    costs: [
      { id: 'cs-006-1', type: 'material', amount: 4800, currency: 'MUR', description: 'Compressor parts (Coolbreeze)', addedBy: 'u-mathias', ownerCharge: true },
      { id: 'cs-006-2', type: 'skilled_labor', amount: 1500, currency: 'MUR', description: 'Mathias 2hr', addedBy: 'u-mathias', ownerCharge: true },
    ],
    ownerCharge: true,
    tags: ['guest-impacting', 'escalated'],
    riskFlags: ['reservation_imminent'],
    aiSuggestions: [
      { kind: 'urgency_bump', confidence: 0.94, message: 'Guest still in-stay, complaint less than 12h ago. Auto-bumped to urgent.' },
      { kind: 'thread_summary', confidence: 0.90, message: 'Decided: Coolbreeze parts at 14:00, fix by 16:00, spend Rs 4,800 awaiting approval.' },
      { kind: 'owner_charge', confidence: 0.88, message: 'AC compressor at LB-2 — likely owner-billable, capex-class repair.', value: 'true' },
    ],
    activityLog: [
      { id: 'a-006-01', ts: '2026-04-26T22:30:00', kind: 'created', actorId: 'u-franny', detail: 'Drafted from Inbox thread inb-lb2-guest-22' },
      { id: 'a-006-02', ts: '2026-04-26T22:32:00', kind: 'assigned', actorId: 'u-franny', detail: '→ Mathias' },
      { id: 'a-006-03', ts: '2026-04-26T22:35:00', kind: 'priority_changed', actorId: 'system', detail: 'high → urgent (AI urgency_bump)' },
      { id: 'a-006-04', ts: '2026-04-26T22:35:00', kind: 'risk_flagged', actorId: 'system', detail: 'reservation_imminent' },
      { id: 'a-006-05', ts: '2026-04-27T08:30:00', kind: 'status_changed', actorId: 'u-mathias', detail: 'scheduled → in_progress' },
      { id: 'a-006-06', ts: '2026-04-27T08:45:00', kind: 'commented', actorId: 'u-mathias', detail: 'On site. Looks like compressor.' },
      { id: 'a-006-07', ts: '2026-04-27T08:50:00', kind: 'commented', actorId: 'u-franny', detail: '@Mathias need ETA before 11am' },
      { id: 'a-006-08', ts: '2026-04-27T09:18:00', kind: 'cost_added', actorId: 'u-mathias', detail: 'Rs 4,800 · Compressor parts (Coolbreeze)' },
      { id: 'a-006-09', ts: '2026-04-27T09:20:00', kind: 'commented', actorId: 'u-mathias', detail: 'Coolbreeze: parts 14:00, fix 16:00.' },
      { id: 'a-006-10', ts: '2026-04-27T09:22:00', kind: 'cost_added', actorId: 'u-mathias', detail: 'Rs 1,500 · Mathias 2hr labor' },
    ],
    createdAt: '2026-04-26T22:30:00',
    updatedAt: '2026-04-27T09:22:00',
    awaitingHumanApproval: false,
  },
  {
    id: 't-007',
    bzId: '136400201',
    title: 'Replace broken table glass',
    description: 'Outdoor dining table glass shattered. Need replacement panel 1.4m × 0.9m tempered.',
    propertyCode: 'LB-2',
    department: 'maintenance',
    subdepartment: 'carpentry',
    priority: 'high',
    status: 'blocked',
    source: 'reported_issue',
    visibility: 'all',
    assigneeIds: ['u-alex'],
    requesterId: 'u-bryan',
    dueDate: '2026-04-27',
    dueTime: '08:00',
    estimatedMinutes: 120,
    attachmentCount: 6,
    comments: [
      { id: 'c-007-1', authorId: 'u-alex', text: 'Quote from Verre Express: Rs 8,200. Need approval to proceed.', ts: '2026-04-26T16:00:00', syncedToBreezeway: true },
    ],
    costs: [],
    ownerCharge: true,
    tags: ['awaiting-approval'],
    riskFlags: ['blocked_access'],
    aiSuggestions: [
      { kind: 'risk', confidence: 0.81, message: 'Quote pending 16h. Approval likely needed today — guest checkin tomorrow.' },
    ],
    activityLog: [
      { id: 'a-007-1', ts: '2026-04-26T14:30:00', kind: 'created', actorId: 'u-bryan', detail: 'Reported during pre-arrival inspection' },
      { id: 'a-007-2', ts: '2026-04-26T14:45:00', kind: 'assigned', actorId: 'u-bryan', detail: '→ Alex' },
      { id: 'a-007-3', ts: '2026-04-26T16:00:00', kind: 'commented', actorId: 'u-alex', detail: 'Verre Express quote Rs 8,200' },
      { id: 'a-007-4', ts: '2026-04-26T16:01:00', kind: 'status_changed', actorId: 'u-alex', detail: 'scheduled → blocked' },
    ],
    createdAt: '2026-04-26T14:30:00',
    updatedAt: '2026-04-26T16:00:00',
  },
  {
    id: 't-008',
    bzId: '136400222',
    title: 'Install Water Heater',
    description: 'Replace old 80L heater with new 100L unit. Includes electrical reroute.',
    propertyCode: 'BCN-A',
    department: 'maintenance',
    subdepartment: 'plumbing',
    priority: 'medium',
    status: 'scheduled',
    source: 'breezeway',
    visibility: 'all',
    assigneeIds: ['u-mathias'],
    dueDate: '2026-04-22',
    estimatedMinutes: 240,
    attachmentCount: 2,
    comments: [],
    costs: [
      { id: 'cs-008-1', type: 'material', amount: 1850000, currency: 'MUR', description: 'Ariston 100L water heater unit', addedBy: 'u-mathias', ownerCharge: true },
    ],
    ownerCharge: true,
    tags: [],
    riskFlags: ['overdue', 'no_progress'],
    aiSuggestions: [
      { kind: 'risk', confidence: 0.88, message: 'Overdue 5 days. Mathias on leave Mon-Tue. Reassign or reschedule.' },
    ],
    activityLog: [
      { id: 'a-008-1', ts: '2026-04-15T09:00:00', kind: 'created', actorId: 'u-ishant' },
      { id: 'a-008-2', ts: '2026-04-15T09:01:00', kind: 'assigned', actorId: 'u-ishant', detail: '→ Mathias' },
      { id: 'a-008-3', ts: '2026-04-23T00:00:00', kind: 'risk_flagged', actorId: 'system', detail: 'overdue' },
    ],
    createdAt: '2026-04-15T09:00:00',
    updatedAt: '2026-04-15T09:00:00',
  },
  {
    id: 't-009',
    bzId: '136400260',
    title: 'Fix outside sofa bed',
    description: 'Wooden frame cracked on left side. Needs replacement slats + reinforcement.',
    propertyCode: 'GBH-C3',
    department: 'maintenance',
    subdepartment: 'carpentry',
    priority: 'medium',
    status: 'scheduled',
    source: 'reported_issue',
    visibility: 'all',
    assigneeIds: ['u-alex'],
    dueDate: '2026-04-28',
    estimatedMinutes: 90,
    attachmentCount: 3,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-009-1', ts: '2026-04-19T10:00:00', kind: 'created', actorId: 'u-bryan', detail: 'Reported during inspection' },
    ],
    createdAt: '2026-04-19T10:00:00',
    updatedAt: '2026-04-19T10:00:00',
  },
  {
    id: 't-010',
    bzId: '136400301',
    title: 'Install new bottle for water dispenser',
    description: 'Office water dispenser empty. Order replacement 19L from Aqua Pure.',
    propertyCode: 'OFFICE',
    department: 'office',
    subdepartment: 'admin',
    priority: 'low',
    status: 'scheduled',
    source: 'manual',
    visibility: 'all',
    assigneeIds: ['u-ishant'],
    dueDate: '2026-04-28',
    estimatedMinutes: 30,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-010-1', ts: '2026-04-20T11:00:00', kind: 'created', actorId: 'u-ishant' },
    ],
    createdAt: '2026-04-20T11:00:00',
    updatedAt: '2026-04-20T11:00:00',
  },
  {
    id: 't-011',
    bzId: '136400341',
    title: 'runner task',
    description: 'Pick up amenities from store, drop at VV-47 and SD-10.',
    propertyCode: 'OFFICE',
    department: 'office',
    subdepartment: 'admin',
    priority: 'medium',
    status: 'scheduled',
    source: 'manual',
    visibility: 'all',
    assigneeIds: ['u-alex'],
    dueDate: today,
    estimatedMinutes: 45,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-011-1', ts: '2026-04-26T15:00:00', kind: 'created', actorId: 'u-franny' },
    ],
    createdAt: '2026-04-26T15:00:00',
    updatedAt: '2026-04-26T15:00:00',
  },
  {
    id: 't-012',
    bzId: '136400420',
    title: 'Buy missing amenities — VV-47',
    description: 'Towels x4, hand soap x3, dish detergent x2.',
    propertyCode: 'VV-47',
    department: 'cleaning',
    subdepartment: 'amenities',
    priority: 'medium',
    status: 'in_progress',
    source: 'reported_issue',
    visibility: 'all',
    assigneeIds: ['u-bryan'],
    dueDate: today,
    estimatedMinutes: 60,
    spentMinutes: 14,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-012-1', ts: '2026-04-26T18:00:00', kind: 'created', actorId: 'u-alex' },
      { id: 'a-012-2', ts: '2026-04-27T09:30:00', kind: 'status_changed', actorId: 'u-bryan', detail: 'scheduled → in_progress' },
    ],
    createdAt: '2026-04-26T18:00:00',
    updatedAt: '2026-04-27T09:30:00',
  },
  {
    id: 't-013',
    bzId: '136400500',
    title: 'Collect Rs 38,000 from Li Da',
    description: 'Tourist tax + cleaning fee balance for stay GBH-C3 Mar 17 — Apr 17.',
    propertyCode: 'GBH-C3',
    department: 'office',
    subdepartment: 'guest_services',
    priority: 'medium',
    status: 'in_progress',
    source: 'manual',
    visibility: 'all',
    assigneeIds: ['u-bryan', 'u-franny'],
    dueDate: today,
    estimatedMinutes: 30,
    spentMinutes: 144,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: ['over_time'],
    aiSuggestions: [
      { kind: 'risk', confidence: 0.79, message: 'Spent 4.8× estimate. Likely chasing — consider adding @Judith for escalation.' },
    ],
    activityLog: [
      { id: 'a-013-1', ts: '2026-04-22T09:00:00', kind: 'created', actorId: 'u-judith' },
      { id: 'a-013-2', ts: '2026-04-22T09:01:00', kind: 'assigned', actorId: 'u-judith', detail: '→ Bryan, Franny' },
    ],
    createdAt: '2026-04-22T09:00:00',
    updatedAt: '2026-04-27T08:00:00',
  },
  {
    id: 't-014',
    bzId: '136400600',
    title: 'Internet Tip Up',
    description: 'My.t fibre upgrade quote — 100Mbps → 300Mbps for SD-10. Compare with Emtel Fibre.',
    propertyCode: 'SD-10',
    department: 'office',
    subdepartment: 'admin',
    priority: 'low',
    status: 'scheduled',
    source: 'manual',
    visibility: 'all',
    assigneeIds: ['u-ishant'],
    dueDate: '2026-04-28',
    estimatedMinutes: 60,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-014-1', ts: '2026-04-21T10:00:00', kind: 'created', actorId: 'u-ishant' },
    ],
    createdAt: '2026-04-21T10:00:00',
    updatedAt: '2026-04-21T10:00:00',
  },
  {
    id: 't-015',
    bzId: '136400700',
    title: 'Print Brochure House Rules',
    description: 'Print 6 copies of v3.2 house rules brochure for new property pack.',
    propertyCode: 'OFFICE',
    department: 'office',
    subdepartment: 'admin',
    priority: 'lowest',
    status: 'completed',
    source: 'recurring',
    visibility: 'all',
    assigneeIds: ['u-mary'],
    dueDate: '2026-04-21',
    estimatedMinutes: 30,
    spentMinutes: 24,
    attachmentCount: 1,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-015-1', ts: '2026-04-15T10:00:00', kind: 'created', actorId: 'u-franny' },
      { id: 'a-015-2', ts: '2026-04-21T11:00:00', kind: 'status_changed', actorId: 'u-mary', detail: 'in_progress → completed' },
    ],
    createdAt: '2026-04-15T10:00:00',
    updatedAt: '2026-04-21T11:00:00',
    completedAt: '2026-04-21T11:00:00',
  },
  {
    id: 't-016',
    bzId: '136400801',
    title: 'Setup Linen Service Area in Office',
    description: 'Create dedicated linen station in office, label shelves by property, intake/outtake bins.',
    propertyCode: 'OFFICE',
    department: 'office',
    subdepartment: 'admin',
    priority: 'medium',
    status: 'scheduled',
    source: 'manual',
    visibility: 'all',
    assigneeIds: ['u-mary', 'u-franny'],
    dueDate: '2026-04-28',
    estimatedMinutes: 180,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-016-1', ts: '2026-04-20T10:00:00', kind: 'created', actorId: 'u-judith' },
    ],
    createdAt: '2026-04-20T10:00:00',
    updatedAt: '2026-04-20T10:00:00',
  },
  {
    id: 't-017',
    bzId: '136400900',
    title: 'Place Detergent Dispensers',
    description: 'Mount auto-dispensers in kitchen + 2 bathrooms.',
    propertyCode: 'GBH-C3',
    department: 'maintenance',
    subdepartment: 'plumbing',
    priority: 'low',
    status: 'scheduled',
    source: 'breezeway',
    visibility: 'all',
    assigneeIds: ['u-alex'],
    dueDate: '2026-04-29',
    estimatedMinutes: 60,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-017-1', ts: '2026-04-23T11:00:00', kind: 'created', actorId: 'u-franny' },
    ],
    createdAt: '2026-04-23T11:00:00',
    updatedAt: '2026-04-23T11:00:00',
  },
  {
    id: 't-018',
    bzId: '136401000',
    title: 'Refresh — full property reset',
    description: 'Mid-stay refresh: light clean, linen swap, amenities top-up, pool skim.',
    propertyCode: 'KS-5',
    department: 'cleaning',
    subdepartment: 'standard_clean',
    priority: 'medium',
    status: 'completed',
    source: 'recurring',
    visibility: 'all',
    assigneeIds: ['u-alex'],
    dueDate: '2026-04-25',
    estimatedMinutes: 120,
    spentMinutes: 105,
    attachmentCount: 8,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-018-1', ts: '2026-04-23T10:00:00', kind: 'created', actorId: 'u-franny' },
      { id: 'a-018-2', ts: '2026-04-25T13:00:00', kind: 'status_changed', actorId: 'u-alex', detail: 'in_progress → completed' },
    ],
    createdAt: '2026-04-23T10:00:00',
    updatedAt: '2026-04-25T13:00:00',
    completedAt: '2026-04-25T13:00:00',
  },
  {
    id: 't-019',
    bzId: '136401100',
    title: 'Pool — clarity check & dose',
    description: 'Weekly chemistry test, pH balance, chlorine top-up.',
    propertyCode: 'SD-10',
    department: 'maintenance',
    subdepartment: 'pool',
    priority: 'medium',
    status: 'scheduled',
    source: 'recurring',
    visibility: 'all',
    assigneeIds: ['u-mathias'],
    dueDate: '2026-04-29',
    estimatedMinutes: 45,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: ['recurring'],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-019-1', ts: '2026-04-22T08:00:00', kind: 'created', actorId: 'u-franny', detail: 'Recurring · weekly' },
    ],
    createdAt: '2026-04-22T08:00:00',
    updatedAt: '2026-04-22T08:00:00',
  },
  {
    id: 't-020',
    bzId: '136401200',
    title: 'Garden — hedge trim + weeding',
    description: 'Front hedge, side bougainvillea, weeding around pool.',
    propertyCode: 'VV-47',
    department: 'maintenance',
    subdepartment: 'garden',
    priority: 'low',
    status: 'scheduled',
    source: 'recurring',
    visibility: 'all',
    assigneeIds: ['u-bryan'],
    dueDate: '2026-04-30',
    estimatedMinutes: 180,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: ['recurring'],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-020-1', ts: '2026-04-23T08:00:00', kind: 'created', actorId: 'u-franny', detail: 'Recurring · monthly' },
    ],
    createdAt: '2026-04-23T08:00:00',
    updatedAt: '2026-04-23T08:00:00',
  },
  {
    id: 't-021',
    bzId: '136401301',
    title: 'Post-clean inspection',
    description: 'Signed checklist after cleaner finishes — kitchen, bathrooms, bedrooms, balcony.',
    propertyCode: 'PT-3',
    department: 'inspection',
    subdepartment: 'post_clean',
    priority: 'medium',
    status: 'completed',
    source: 'recurring',
    visibility: 'all',
    assigneeIds: ['u-catherine'],
    dueDate: '2026-04-26',
    estimatedMinutes: 45,
    spentMinutes: 38,
    attachmentCount: 14,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-021-1', ts: '2026-04-25T14:00:00', kind: 'created', actorId: 'u-franny' },
      { id: 'a-021-2', ts: '2026-04-26T11:00:00', kind: 'status_changed', actorId: 'u-catherine', detail: 'in_progress → completed' },
    ],
    createdAt: '2026-04-25T14:00:00',
    updatedAt: '2026-04-26T11:00:00',
    completedAt: '2026-04-26T11:00:00',
  },
  {
    id: 't-022',
    bzId: '136401400',
    title: 'Buy spare table glass — LB-2 spare',
    description: 'Order spare for next time. Tempered 1.4×0.9m, store in office.',
    propertyCode: 'OFFICE',
    department: 'office',
    subdepartment: 'admin',
    priority: 'low',
    status: 'scheduled',
    source: 'manual',
    visibility: 'all',
    assigneeIds: ['u-ishant'],
    dueDate: '2026-04-30',
    estimatedMinutes: 30,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: [],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-022-1', ts: '2026-04-26T16:30:00', kind: 'created', actorId: 'u-ishant' },
    ],
    createdAt: '2026-04-26T16:30:00',
    updatedAt: '2026-04-26T16:30:00',
  },
  {
    id: 't-023',
    bzId: '136401500',
    title: 'Owner walkthrough — quarterly',
    description: 'Smith Family quarterly walkthrough VV-47. Review: condition, AC service log, garden, pool.',
    propertyCode: 'VV-47',
    department: 'office',
    subdepartment: 'guest_services',
    priority: 'medium',
    status: 'scheduled',
    source: 'recurring',
    visibility: 'all',
    assigneeIds: ['u-judith', 'u-franny'],
    dueDate: '2026-05-02',
    estimatedMinutes: 90,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: ['owner-facing', 'recurring'],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-023-1', ts: '2026-04-15T10:00:00', kind: 'created', actorId: 'u-judith', detail: 'Recurring · quarterly' },
    ],
    createdAt: '2026-04-15T10:00:00',
    updatedAt: '2026-04-15T10:00:00',
  },
  {
    id: 't-024',
    title: 'Investigate kitchen smell — guest report',
    description: 'Guest reported sulphur smell from kitchen sink area. AI extracted from WhatsApp thread.',
    propertyCode: 'LV-10',
    department: 'maintenance',
    subdepartment: 'plumbing',
    priority: 'high',
    status: 'scheduled',
    source: 'inbox_ai',
    visibility: 'all',
    assigneeIds: [],
    dueDate: today,
    inboxThreadId: 'inb-lv10-guest-04',
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: ['ai-drafted'],
    riskFlags: ['unassigned'],
    aiSuggestions: [
      { kind: 'route', confidence: 0.91, message: 'Sulphur + sink → likely drain trap dry. Maintenance / Plumbing.' },
      { kind: 'assign', confidence: 0.84, message: 'Mathias has 3 prior sink jobs at LV-10. Suggest assigning.', value: 'u-mathias' },
    ],
    activityLog: [
      { id: 'a-024-1', ts: '2026-04-27T07:50:00', kind: 'created', actorId: 'system', detail: 'AI-drafted from inbox thread inb-lv10-guest-04' },
    ],
    createdAt: '2026-04-27T07:50:00',
    updatedAt: '2026-04-27T07:50:00',
    awaitingHumanApproval: true,
  },
  {
    id: 't-025',
    title: 'Confirm late checkout — Wang at BS-1',
    description: 'Guest asked for 14:00 checkout (4h late). AI checked: no incoming guest until 18:00, fee Rs 1,500 applies. Drafted confirmation reply.',
    propertyCode: 'BS-1',
    department: 'office',
    subdepartment: 'guest_services',
    priority: 'medium',
    status: 'scheduled',
    source: 'inbox_ai',
    visibility: 'all',
    assigneeIds: [],
    dueDate: today,
    inboxThreadId: 'inb-bs1-wang-late',
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: ['ai-drafted', 'guest-facing'],
    riskFlags: ['unassigned'],
    aiSuggestions: [
      { kind: 'reservation_aware', confidence: 0.93, message: 'No conflict with next guest. Approving the request is safe.' },
    ],
    activityLog: [
      { id: 'a-025-1', ts: '2026-04-27T08:10:00', kind: 'created', actorId: 'system', detail: 'AI-drafted from inbox thread inb-bs1-wang-late' },
    ],
    createdAt: '2026-04-27T08:10:00',
    updatedAt: '2026-04-27T08:10:00',
    awaitingHumanApproval: true,
  },

  // ───── Personal tasks (FAD-only, no Breezeway sync) ─────
  {
    id: 't-026',
    title: 'Send Mary farewell card — circulate for sign',
    description: 'Pick up card from office, get sign from team before May 31 last day.',
    propertyCode: 'OFFICE',
    department: 'office',
    subdepartment: 'admin',
    priority: 'low',
    status: 'scheduled',
    source: 'personal',
    visibility: 'self',
    assigneeIds: ['u-judith'],
    requesterId: 'u-judith',
    dueDate: '2026-05-25',
    estimatedMinutes: 20,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: ['personal'],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-026-1', ts: '2026-04-27T07:30:00', kind: 'created', actorId: 'u-judith' },
    ],
    createdAt: '2026-04-27T07:30:00',
    updatedAt: '2026-04-27T07:30:00',
  },
  {
    id: 't-027',
    title: 'Reach out to Mauritius Telecom about FAD landline routing',
    description: 'Personal action — call Sumesh re: redirect of office mainline to FAD inbox after Mary departs.',
    propertyCode: 'OFFICE',
    department: 'office',
    subdepartment: 'admin',
    priority: 'medium',
    status: 'scheduled',
    source: 'personal',
    visibility: 'self',
    assigneeIds: ['u-franny'],
    requesterId: 'u-franny',
    dueDate: '2026-05-15',
    estimatedMinutes: 30,
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: ['personal'],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-027-1', ts: '2026-04-25T15:00:00', kind: 'created', actorId: 'u-franny' },
    ],
    createdAt: '2026-04-25T15:00:00',
    updatedAt: '2026-04-25T15:00:00',
  },

  // ───── Group-email originated tasks ─────
  {
    id: 't-028',
    title: 'Reply to listing inquiry from info@',
    description: 'Prospect emailed info@friday.mu asking about July availability for group of 10. AI extracted contact + dates + party size.',
    propertyCode: 'OFFICE',
    department: 'office',
    subdepartment: 'guest_services',
    priority: 'medium',
    status: 'scheduled',
    source: 'group_email',
    visibility: 'all',
    assigneeIds: ['u-mathias'],
    dueDate: tomorrow,
    estimatedMinutes: 30,
    groupEmailId: 'ge-info-001',
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: ['lead', 'ai-drafted'],
    riskFlags: [],
    aiSuggestions: [
      { kind: 'next_action', confidence: 0.86, message: 'Group of 10 needs LB-2 (sleeps 8) + adjacent SD-10 (sleeps 4). Both available Jul 12–18.' },
    ],
    activityLog: [
      { id: 'a-028-1', ts: '2026-04-26T11:30:00', kind: 'created', actorId: 'system', detail: 'Drafted from group_email ge-info-001 (info@friday.mu)' },
      { id: 'a-028-2', ts: '2026-04-26T11:31:00', kind: 'assigned', actorId: 'u-judith', detail: '→ Mathias (commercial)' },
    ],
    createdAt: '2026-04-26T11:30:00',
    updatedAt: '2026-04-26T11:31:00',
    awaitingHumanApproval: false,
  },
  {
    id: 't-029',
    title: 'GBH common-area light fixture — syndic complaint',
    description: 'Email to syndic@friday.mu from GBH co-owner about flickering lights in common stairwell. Coordinate with building syndic for repair.',
    propertyCode: 'GBH-C3',
    department: 'maintenance',
    subdepartment: 'electrical',
    priority: 'medium',
    status: 'scheduled',
    source: 'group_email',
    visibility: 'all',
    assigneeIds: ['u-franny'],
    dueDate: '2026-04-30',
    estimatedMinutes: 60,
    groupEmailId: 'ge-syndic-014',
    attachmentCount: 1,
    comments: [],
    costs: [],
    tags: ['syndic'],
    riskFlags: [],
    aiSuggestions: [
      { kind: 'route', confidence: 0.78, message: 'Common-area issue → syndic budget, not owner-billable. Coordinate with GBH manager.' },
    ],
    activityLog: [
      { id: 'a-029-1', ts: '2026-04-25T14:20:00', kind: 'created', actorId: 'system', detail: 'Drafted from group_email ge-syndic-014 (syndic@friday.mu)' },
    ],
    createdAt: '2026-04-25T14:20:00',
    updatedAt: '2026-04-25T14:20:00',
  },

  // ───── Reservation-trigger samples ─────
  {
    id: 't-030',
    bzId: '136500999',
    title: 'Standard clean — checkout turnover (auto)',
    description: 'Auto-generated on guest checkout. Standard turnover protocol.',
    propertyCode: 'PT-3',
    department: 'cleaning',
    subdepartment: 'standard_clean',
    priority: 'high',
    status: 'scheduled',
    source: 'reservation_trigger',
    visibility: 'all',
    assigneeIds: ['u-catherine'],
    dueDate: thu,
    dueTime: '11:00',
    estimatedMinutes: 150,
    reservationId: 'rsv-pt3-out-apr30',
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: ['auto-generated'],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-030-1', ts: '2026-04-27T06:00:00', kind: 'created', actorId: 'system', detail: 'Auto-created from checkout trigger · rsv-pt3-out-apr30' },
    ],
    createdAt: '2026-04-27T06:00:00',
    updatedAt: '2026-04-27T06:00:00',
  },
  {
    id: 't-031',
    bzId: '136501020',
    title: 'Pre-arrival inspection (auto)',
    description: 'Auto-generated 1 day before check-in. Property empty for 4 days — full pre-arrival check needed.',
    propertyCode: 'KS-5',
    department: 'inspection',
    subdepartment: 'pre_arrival',
    priority: 'medium',
    status: 'scheduled',
    source: 'reservation_trigger',
    visibility: 'all',
    assigneeIds: ['u-alex'],
    dueDate: fri,
    dueTime: '11:00',
    estimatedMinutes: 60,
    reservationId: 'rsv-ks5-in-may2',
    attachmentCount: 0,
    comments: [],
    costs: [],
    tags: ['auto-generated'],
    riskFlags: [],
    aiSuggestions: [],
    activityLog: [
      { id: 'a-031-1', ts: '2026-04-27T07:00:00', kind: 'created', actorId: 'system', detail: 'Auto-created from check-in trigger · rsv-ks5-in-may2' },
    ],
    createdAt: '2026-04-27T07:00:00',
    updatedAt: '2026-04-27T07:00:00',
  },
];

// ───────────────── Reported Issues ─────────────────

export interface ReportedIssue {
  id: string;
  bzId?: string;
  reporterId: string;
  reporterLabel?: string;
  propertyCode: string;
  title: string;
  description: string;
  photos: number;
  reportedAt: string;
  source: 'field_pm' | 'guesty_message' | 'inbox' | 'guest_chat' | 'inspection' | 'group_email';
  status: 'new' | 'triaged' | 'converted' | 'dismissed';
  aiSuggestedDepartment?: Department;
  aiSuggestedSubdepartment?: Subdepartment;
  aiSuggestedAssignee?: string;
  aiSuggestedPriority?: TaskPriority;
  aiConfidence?: number;
  aiReason?: string;
  convertedTaskId?: string;
  inboxThreadId?: string;
  groupEmailId?: string;
}

export const REPORTED_ISSUES: ReportedIssue[] = [
  {
    id: 'ri-001',
    reporterId: 'inbox',
    reporterLabel: 'Guest WhatsApp · Lukas Bremmer',
    propertyCode: 'LV-10',
    title: 'Kitchen smells like rotten eggs',
    description: 'Strong sulphur odor coming from area near the sink. Started this morning.',
    photos: 2,
    reportedAt: '2026-04-27T07:48:00',
    source: 'guest_chat',
    status: 'new',
    aiSuggestedDepartment: 'maintenance',
    aiSuggestedSubdepartment: 'plumbing',
    aiSuggestedAssignee: 'u-mathias',
    aiSuggestedPriority: 'high',
    aiConfidence: 0.91,
    aiReason: 'Sulphur smell near sink → dry drain trap. Plumbing fix, ~30min. Mathias has 3 prior LV-10 plumbing jobs.',
    inboxThreadId: 'inb-lv10-guest-04',
  },
  {
    id: 'ri-002',
    reporterId: 'inbox',
    reporterLabel: 'Guest WhatsApp · Yudi Wang',
    propertyCode: 'BS-1',
    title: 'Can we extend checkout to 14:00?',
    description: 'Flight at 19:00, would love a few extra hours. Happy to pay if needed.',
    photos: 0,
    reportedAt: '2026-04-27T08:05:00',
    source: 'guest_chat',
    status: 'new',
    aiSuggestedDepartment: 'office',
    aiSuggestedSubdepartment: 'guest_services',
    aiSuggestedPriority: 'medium',
    aiConfidence: 0.93,
    aiReason: 'No incoming guest until 18:00. Late checkout fee Rs 1,500 applies per house rules. Safe to approve.',
    inboxThreadId: 'inb-bs1-wang-late',
  },
  {
    id: 'ri-003',
    reporterId: 'u-alex',
    propertyCode: 'LB-2',
    title: 'Outdoor table glass shattered',
    description: 'Found it during pre-arrival inspection. Looks like wind impact yesterday. Photos attached.',
    photos: 6,
    reportedAt: '2026-04-26T14:30:00',
    source: 'field_pm',
    status: 'converted',
    convertedTaskId: 't-007',
    aiSuggestedDepartment: 'maintenance',
    aiSuggestedSubdepartment: 'carpentry',
    aiSuggestedPriority: 'high',
    aiConfidence: 0.97,
    aiReason: 'Broken outdoor furniture before guest arrival. High urgency, replacement standard.',
  },
  {
    id: 'ri-004',
    reporterId: 'u-bryan',
    propertyCode: 'GBH-C3',
    title: 'Sofa bed frame cracked',
    description: 'Wooden frame cracked on the left side, slats coming loose.',
    photos: 3,
    reportedAt: '2026-04-19T09:30:00',
    source: 'field_pm',
    status: 'converted',
    convertedTaskId: 't-009',
    aiSuggestedDepartment: 'maintenance',
    aiSuggestedSubdepartment: 'carpentry',
    aiSuggestedAssignee: 'u-alex',
    aiSuggestedPriority: 'medium',
    aiConfidence: 0.89,
    aiReason: 'Carpentry repair. Alex on west zone — GBH is north but Alex has Wed availability.',
  },
  {
    id: 'ri-005',
    reporterId: 'u-mary',
    propertyCode: 'KS-5',
    title: 'Wifi router losing signal nightly',
    description: 'Guest mentioned wifi drops every night around 22:00. Restart fixes it. Likely My.t modem.',
    photos: 0,
    reportedAt: '2026-04-25T18:00:00',
    source: 'inspection',
    status: 'triaged',
    aiSuggestedDepartment: 'maintenance',
    aiSuggestedSubdepartment: 'electrical',
    aiSuggestedAssignee: 'u-mathias',
    aiSuggestedPriority: 'medium',
    aiConfidence: 0.74,
    aiReason: 'Recurring nightly drop usually = thermal issue or scheduled maintenance window. Could also be ISP — call My.t before truck roll.',
  },
  {
    id: 'ri-006',
    reporterId: 'inbox',
    reporterLabel: 'Guest WhatsApp · Fernando Kanarski',
    propertyCode: 'RC-15',
    title: 'Welcome basket missing some items',
    description: 'Just arrived. Welcome card mentions wine + chocolates but only the wine is here.',
    photos: 1,
    reportedAt: '2026-04-27T09:35:00',
    source: 'guest_chat',
    status: 'new',
    aiSuggestedDepartment: 'cleaning',
    aiSuggestedSubdepartment: 'amenities',
    aiSuggestedAssignee: 'u-alex',
    aiSuggestedPriority: 'high',
    aiConfidence: 0.88,
    aiReason: 'Guest just checked in, welcome basket incomplete. Alex on-site (pre-arrival inspection task t-003). Drop chocolates, ~15 min.',
    inboxThreadId: 'inb-rc15-kanarski',
  },
  {
    id: 'ri-007',
    reporterId: 'u-catherine',
    propertyCode: 'PT-3',
    title: 'Mosquito mesh torn in master bedroom',
    description: 'Window mesh on north side has a 10cm tear. Mosquitos getting in.',
    photos: 2,
    reportedAt: '2026-04-26T10:00:00',
    source: 'inspection',
    status: 'new',
    aiSuggestedDepartment: 'maintenance',
    aiSuggestedSubdepartment: 'carpentry',
    aiSuggestedPriority: 'medium',
    aiConfidence: 0.86,
    aiReason: 'Mesh repair, simple fix. ~30 min, mesh roll in office store.',
  },
  {
    id: 'ri-008',
    reporterId: 'inbox',
    reporterLabel: 'Owner email · Marchand SCI',
    propertyCode: 'BL-12',
    title: 'Owner asks for end-of-month garden photos',
    description: 'M. Marchand wants photos of bougainvillea and lawn before they decide on landscaper change.',
    photos: 0,
    reportedAt: '2026-04-26T16:30:00',
    source: 'inbox',
    status: 'new',
    aiSuggestedDepartment: 'office',
    aiSuggestedSubdepartment: 'guest_services',
    aiSuggestedPriority: 'low',
    aiConfidence: 0.78,
    aiReason: 'Owner request, low urgency, can fold into next inspection visit.',
  },
  {
    id: 'ri-009',
    reporterId: 'inbox',
    reporterLabel: 'Group email · info@friday.mu',
    propertyCode: 'OFFICE',
    title: 'Listing inquiry — group of 10 for July',
    description: 'Prospect from France asking about adjacent villas for July 12–18, party of 10.',
    photos: 0,
    reportedAt: '2026-04-26T11:30:00',
    source: 'group_email',
    status: 'converted',
    convertedTaskId: 't-028',
    aiSuggestedDepartment: 'office',
    aiSuggestedSubdepartment: 'guest_services',
    aiSuggestedAssignee: 'u-mathias',
    aiSuggestedPriority: 'medium',
    aiConfidence: 0.86,
    aiReason: 'Lead inquiry — assign to Mathias (commercial). LB-2 + SD-10 fits party size.',
    groupEmailId: 'ge-info-001',
  },
];

// ───────────────── Approval Requests (FAD-native shape per brief §7.1) ─────────────────

export type ApprovalType = 'spend' | 'vendor' | 'scope_change' | 'other';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'countered';
export type ApprovalThresholdTier = 'small' | 'medium' | 'large';

export interface ApprovalRequest {
  id: string;
  linkedTaskId?: string;
  requesterId: string;
  propertyCode: string;
  type: ApprovalType;
  amount?: number;
  currency?: 'MUR' | 'EUR';
  vendor?: string;
  justification: string;
  attachments: string[];
  thresholdTier?: ApprovalThresholdTier;
  requestedAt: string;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  counterAmount?: number;
}

// @demo:data — Tag: PROD-DATA-31 — see frontend/DEMO_CRUFT.md
export const APPROVAL_REQUESTS: ApprovalRequest[] = [
  {
    id: 'ar-001',
    linkedTaskId: 't-007',
    requesterId: 'u-alex',
    propertyCode: 'LB-2',
    type: 'spend',
    amount: 8200,
    currency: 'MUR',
    vendor: 'Verre Express',
    justification: 'Replace shattered outdoor table glass at LB-2. Guest checks in 28 Apr 14:00. Got 3 quotes: Verre Express 8,200, Glass Plus 9,500, Vitrerie Mr 8,800. Verre Express has 24h delivery.',
    attachments: ['quote-verre-express.pdf', 'quote-glass-plus.pdf', 'quote-vitrerie.pdf'],
    thresholdTier: 'small',
    requestedAt: '2026-04-26T16:00:00',
    status: 'pending',
  },
  {
    id: 'ar-002',
    linkedTaskId: 't-006',
    requesterId: 'u-mathias',
    propertyCode: 'LB-2',
    type: 'spend',
    amount: 4800,
    currency: 'MUR',
    vendor: 'Coolbreeze',
    justification: 'Compressor parts for LB-2 living room split. Guest in-stay, A/C not cooling since 22:15 last night. Coolbreeze has parts ready, can fix by 16:00 today. No alternative supplier with same-day stock.',
    attachments: ['coolbreeze-quote.pdf'],
    thresholdTier: 'small',
    requestedAt: '2026-04-27T09:20:00',
    status: 'pending',
  },
  {
    id: 'ar-003',
    linkedTaskId: 't-019',
    requesterId: 'u-mathias',
    propertyCode: 'SD-10',
    type: 'other',
    justification: 'Pool pump showing intermittent fault — need 2 extra hours diagnostic before deciding repair vs replace. Standard chemistry test fine, but pump cycles erratically. Want to get baseline electrical readings before quoting.',
    attachments: [],
    requestedAt: '2026-04-27T08:00:00',
    status: 'pending',
  },
  {
    id: 'ar-004',
    linkedTaskId: 't-008',
    requesterId: 'u-mathias',
    propertyCode: 'BCN-A',
    type: 'vendor',
    vendor: 'Ariston (replaces Atlantic)',
    justification: 'Switch water heater from Atlantic to Ariston (better warranty, similar price). Atlantic 100L stock-out 3 weeks. Ariston 100L same price (Rs 18,500), 5yr vs 3yr warranty, in stock at Brico Center.',
    attachments: ['ariston-spec.pdf'],
    thresholdTier: 'medium',
    requestedAt: '2026-04-25T14:00:00',
    status: 'approved',
    reviewedBy: 'u-judith',
    reviewedAt: '2026-04-25T15:30:00',
    reviewNotes: 'Approved. Better warranty wins.',
  },
  {
    id: 'ar-005',
    linkedTaskId: 't-005',
    requesterId: 'u-bryan',
    propertyCode: 'BL-12',
    type: 'scope_change',
    amount: 600,
    currency: 'MUR',
    justification: 'Add fridge defrost-deep-clean to BL-12 deep clean (originally not in scope). Found mold in fridge seal during pre-clean. Will add ~45 min and Rs 600 in cleaning supplies.',
    attachments: ['fridge-mold.jpg'],
    thresholdTier: 'small',
    requestedAt: '2026-04-26T11:00:00',
    status: 'countered',
    reviewedBy: 'u-franny',
    reviewedAt: '2026-04-26T11:30:00',
    counterAmount: 400,
    reviewNotes: 'Approved scope, but cap supplies at Rs 400 — use existing stock first.',
  },
];

// ───────────────── Insights aggregations (precomputed for fixtures) ─────────────────

// @demo:data — Tag: PROD-DATA-32 — see frontend/DEMO_CRUFT.md
export const TASK_INSIGHTS = {
  weeklyCompleted: 47,
  weeklyCreated: 52,
  avgCompletionMinutes: 73,
  topAssignees: [
    { userId: 'u-alex', completed: 12, avgMinutes: 65 },
    { userId: 'u-bryan', completed: 11, avgMinutes: 78 },
    { userId: 'u-mathias', completed: 9, avgMinutes: 105 },
    { userId: 'u-mary', completed: 8, avgMinutes: 52 },
    { userId: 'u-catherine', completed: 7, avgMinutes: 41 },
  ],
  byDepartment: [
    { dept: 'cleaning' as const, count: 21, avgMinutes: 145 },
    { dept: 'inspection' as const, count: 14, avgMinutes: 38 },
    { dept: 'maintenance' as const, count: 9, avgMinutes: 92 },
    { dept: 'office' as const, count: 8, avgMinutes: 45 },
  ],
  topPropertiesByIssues: [
    { code: 'LB-2', issues: 4 },
    { code: 'LV-10', issues: 3 },
    { code: 'KS-5', issues: 2 },
    { code: 'GBH-C3', issues: 2 },
    { code: 'RC-15', issues: 2 },
  ],
  escalationTrend: [3, 5, 4, 7, 6, 8, 5], // last 7 days
  completedTrend: [6, 8, 7, 5, 9, 6, 6],  // last 7 days
  /** AI accuracy — populated by telemetry hooks in Phase 2; canned for Phase 1. */
  aiAccuracy: {
    autoTriageAccept: 0.78,
    nlParseAccept: 0.84,
    riskFlagAccept: 0.91,
    sampleSize: 138,
  },
};

// ───────────────── Helpers ─────────────────

/** Subset of TASKS that are AI-drafted and waiting on human green-light. */
export const AI_TASK_DRAFTS = TASKS.filter((t) => t.awaitingHumanApproval);

export const TASK_USER_BY_ID: Record<string, TaskUser> = TASK_USERS.reduce(
  (acc, u) => {
    acc[u.id] = u;
    return acc;
  },
  {} as Record<string, TaskUser>,
);

export const TASK_PROPERTY_BY_CODE: Record<string, TaskProperty> = TASK_PROPERTIES.reduce(
  (acc, p) => {
    acc[p.code] = p;
    return acc;
  },
  {} as Record<string, TaskProperty>,
);
