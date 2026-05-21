// Operations task types and live configuration.
// Task records load from /api/tasks; do not add fixture task rows here.

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
  | 'review'
  | 'syndic';

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
  | 'supply_used'
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

export type TaskSupplyCategory =
  | 'linen'
  | 'amenity'
  | 'cleaning'
  | 'maintenance'
  | 'welcome'
  | 'consumable'
  | 'other';

export interface TaskSupply {
  id: string;
  supplyId: string;
  supplyName: string;
  category: TaskSupplyCategory;
  quantity: number;
  unit: string;
  locationCode?: string;
  unitCost?: number;
  currency: 'MUR' | 'EUR';
  ownerCharge?: boolean;
  stockMovementId?: string;
  flowedToTaskCostId?: string;
  addedBy?: string;
  createdAt?: string;
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
  supplies?: TaskSupply[];
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

// ───────────────── Live task data boundary ─────────────────

// Operations tasks are loaded from /api/tasks via useApiTasks().
// Keep this empty export only for older module surfaces that still import TASKS
// while they are migrated to the API-backed task client.
export const TASKS: Task[] = [];

// ───────────────── Helpers ─────────────────

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
