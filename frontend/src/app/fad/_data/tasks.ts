// Operations task types and live configuration.
// Task records load from /api/tasks; do not add fixture task rows here.

// ───────────────── Type definitions ─────────────────

export type Department = 'cleaning' | 'inspection' | 'maintenance' | 'office';

export type Subdepartment =
  | 'standard_clean'
  | 'owner_standard_clean'
  | 'deep_clean'
  | 'mid_stay'
  | 'linen'
  | 'pre_arrival'
  | 'arrival_inspection'
  | 'post_clean'
  | 'owner_post_clean'
  | 'plumbing'
  | 'electrical'
  | 'carpentry'
  | 'aircon'
  | 'ac_servicing'
  | 'pool'
  | 'garden'
  | 'amenities'
  | 'preventative_maintenance'
  | 'aesthetic_check'
  | 'lockbox'
  | 'pest_control'
  | 'store_cleaning'
  | 'home_buildout'
  | 'procurement'
  | 'quick_reset'
  | 'vendor_coord'
  | 'supplies'
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
    name: 'Mathias Duval',
    initials: 'MD',
    email: 'mathias@friday.mu',
    role: 'commercial_marketing',
    homeZone: 'north',
    skills: ['marketing', 'guest_services', 'reservations', 'admin', 'guesty_update'],
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
    name: 'Mary Oladimeji',
    initials: 'MO',
    email: 'mary@friday.mu',
    role: 'commercial_marketing',
    skills: ['guest_services', 'admin', 'night_shift'],
    notificationChannel: 'fad_inbox',
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
    skills: ['maintenance', 'plumbing', 'electrical', 'carpentry', 'cleaning', 'inspection', 'procurement', 'lockbox'],
    notificationChannel: 'whatsapp',
    startDate: '2024-05-15',
    active: true,
    avatarColor: '#ef4444',
  },
  {
    id: 'u-catherine',
    name: 'Catherine Henri',
    initials: 'CH',
    email: 'catherine@friday.mu',
    role: 'field',
    homeZone: 'north',
    skills: ['cleaning', 'inspection', 'amenities', 'aesthetic_check', 'home_buildout', 'lockbox'],
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
  owner_standard_clean: 'Owner standard clean',
  deep_clean: 'Deep clean',
  mid_stay: 'Mid-stay clean',
  linen: 'Linen service',
  pre_arrival: 'Pre-arrival',
  arrival_inspection: 'Arrival inspection',
  post_clean: 'Post-clean inspection',
  owner_post_clean: 'Owner post-clean inspection',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  carpentry: 'Carpentry',
  aircon: 'A/C',
  ac_servicing: 'A/C servicing',
  pool: 'Pool',
  garden: 'Garden',
  amenities: 'Amenities',
  preventative_maintenance: 'Preventative maintenance',
  aesthetic_check: 'Aesthetic check',
  lockbox: 'Lockbox',
  pest_control: 'Pest control',
  store_cleaning: 'Store cleaning',
  home_buildout: 'Home build-out',
  procurement: 'Procurement',
  quick_reset: 'Quick reset',
  vendor_coord: 'Vendor coordination',
  supplies: 'Supplies',
  admin: 'Admin',
  guest_services: 'Guest services',
};

export const SUBDEPT_BY_DEPT: Record<Department, Subdepartment[]> = {
  cleaning: ['standard_clean', 'owner_standard_clean', 'mid_stay', 'deep_clean', 'linen', 'amenities', 'store_cleaning'],
  inspection: ['post_clean', 'owner_post_clean', 'arrival_inspection', 'pre_arrival', 'aesthetic_check'],
  maintenance: ['plumbing', 'electrical', 'carpentry', 'aircon', 'ac_servicing', 'pool', 'garden', 'preventative_maintenance', 'pest_control', 'home_buildout', 'quick_reset'],
  office: ['admin', 'guest_services', 'lockbox', 'procurement', 'vendor_coord', 'supplies'],
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
  authorName?: string;
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
  addedByName?: string;
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
  addedByName?: string;
  createdAt?: string;
}

export interface TaskSourcePerson {
  id?: string | number | null;
  name?: string | null;
  email?: string | null;
}

export interface TaskSourcePayload {
  provider?: string;
  importBatchId?: string;
  taskId?: string;
  externalRef?: string;
  property?: {
    name?: string | null;
    resolvedCode?: string | null;
    group?: string | null;
  };
  people?: {
    assignees?: string[];
    assignedEmployeeIds?: string[];
    unresolvedAssignees?: string[];
    completedBy?: string | null;
    requestedBy?: string | null;
    createdBy?: string | null;
  };
  time?: {
    totalTime?: string | null;
    estimatedTime?: string | null;
    sourceCreatedAt?: string | null;
    sourceUpdatedAt?: string | null;
    sourceStartedAt?: string | null;
    sourceDueAt?: string | null;
    sourceCompletedAt?: string | null;
  };
  cost?: {
    billTo?: string | null;
    rateType?: string | null;
    currency?: string | null;
    totalCostMinor?: number | null;
  };
  supplemental?: Record<string, unknown>;
  apiEnrichment?: {
    provider?: string;
    fetchedAt?: string;
    taskId?: string;
    sourceUpdatedAt?: string | null;
    reportUrl?: string | null;
    summary?: { note?: string | null; createdAt?: string | null; updatedAt?: string | null } | null;
    assignments?: Array<Record<string, unknown>>;
    photos?: Array<Record<string, unknown>>;
    photoCount?: number;
    comments?: Array<Record<string, unknown>>;
    commentsCount?: number;
    costs?: Array<Record<string, unknown>>;
    costsCount?: number;
    supplies?: Array<Record<string, unknown>>;
    suppliesCount?: number;
    tags?: string[];
    taskTags?: Array<Record<string, unknown>>;
    people?: {
      createdBy?: TaskSourcePerson | null;
      finishedBy?: TaskSourcePerson | null;
      requestedBy?: TaskSourcePerson | null;
      startedBy?: TaskSourcePerson | null;
    };
    linkedReservation?: { id?: string | null; externalReservationId?: string | null } | null;
    reportedTasks?: string[];
    totalTime?: string | null;
    totalMinutes?: number | null;
    createdAt?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  };
  raw?: Record<string, unknown>;
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
  assigneeNames?: string[];
  requesterId?: string;
  requesterName?: string;
  createdById?: string;
  createdByName?: string;
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
  importBatchId?: string;
  sourcePayload?: TaskSourcePayload;
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
  sourceStartedAt?: string;
  sourceDueAt?: string;
  sourceCompletedAt?: string;
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
