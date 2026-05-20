// Permissions matrix — role × resource × action.
// Single source of truth for the `useCanAccess` hook (T2).
//
// Phase 1: four hardcoded roles. Custom role creation is Phase 2.
// Director cannot be revoked of any permission (lockout guard at UI layer).
// Surfaces NOT explicitly gated stay open by default (no accidental lockouts).

import type { TaskUser } from './tasks';

export type Resource =
  | 'tasks'
  | 'inbox_guest'
  | 'inbox_syndic'
  | 'inbox_group'
  | 'inbox_team'
  | 'crm'
  | 'owners'
  | 'finance'
  | 'reservations'
  | 'properties'
  | 'hr_staff'
  | 'hr_roster'
  | 'hr_time_off'
  | 'hr_stats'
  | 'hr_permissions'
  | 'settings'
  | 'tenant_admin';

export type Action = 'read' | 'write' | 'approve' | 'delete';

/**
 * 'all'  — full scope
 * 'team' — own + team-visible records
 * 'self' — only own records
 * 'none' — denied (also represented by absence of the key)
 */
export type Scope = 'all' | 'team' | 'self' | 'none';

export type RolePermissions = {
  [R in Resource]?: {
    [A in Action]?: Scope;
  };
};

const FULL_ACCESS: { [A in Action]: Scope } = {
  read: 'all',
  write: 'all',
  approve: 'all',
  delete: 'all',
};

const READ_ONLY: { [A in Action]: Scope } = {
  read: 'all',
  write: 'none',
  approve: 'none',
  delete: 'none',
};

const SELF_ONLY: { [A in Action]: Scope } = {
  read: 'self',
  write: 'self',
  approve: 'none',
  delete: 'none',
};

// Director gets full access on every resource. Encoded explicitly here so
// the UI can render the matrix without special-casing director, but the
// `useCanAccess` hook will still short-circuit on role === 'director' for
// the lockout guard.
const DIRECTOR_PERMS: RolePermissions = {
  tasks: FULL_ACCESS,
  inbox_guest: FULL_ACCESS,
  inbox_syndic: FULL_ACCESS,
  inbox_group: FULL_ACCESS,
  inbox_team: FULL_ACCESS,
  crm: FULL_ACCESS,
  owners: FULL_ACCESS,
  finance: FULL_ACCESS,
  reservations: FULL_ACCESS,
  properties: FULL_ACCESS,
  hr_staff: FULL_ACCESS,
  hr_roster: FULL_ACCESS,
  hr_time_off: FULL_ACCESS,
  hr_stats: FULL_ACCESS,
  hr_permissions: FULL_ACCESS,
  settings: FULL_ACCESS,
  tenant_admin: FULL_ACCESS,
};

const COMMERCIAL_MARKETING_PERMS: RolePermissions = {
  tasks: FULL_ACCESS,
  inbox_guest: FULL_ACCESS,
  inbox_syndic: FULL_ACCESS,
  inbox_group: FULL_ACCESS,
  inbox_team: FULL_ACCESS,
  crm: FULL_ACCESS,
  owners: READ_ONLY,
  // Finance locked to director per Ishant 2026-05-18 — "nobody should
  // see finance" (besides director).
  finance: {},
  reservations: FULL_ACCESS,
  properties: FULL_ACCESS,
  hr_staff: SELF_ONLY,
  hr_roster: SELF_ONLY,
  hr_time_off: SELF_ONLY,
  hr_stats: {},
  // hr_permissions: director-only — approving app permissions stays
  // with Ishant.
  hr_permissions: {},
  settings: { read: 'all', write: 'self', approve: 'none', delete: 'none' },
  tenant_admin: {},
};

const OPS_MANAGER_PERMS: RolePermissions = {
  tasks: FULL_ACCESS,
  inbox_guest: FULL_ACCESS,
  inbox_syndic: FULL_ACCESS,
  inbox_group: FULL_ACCESS,
  inbox_team: FULL_ACCESS,
  hr_staff: FULL_ACCESS,
  hr_roster: FULL_ACCESS,
  // Ops manager can SEE time-off but can't APPROVE — approval stays
  // with director per Ishant 2026-05-18.
  hr_time_off: { read: 'all', write: 'all', approve: 'none', delete: 'none' },
  hr_stats: FULL_ACCESS,
  hr_permissions: {},
  crm: READ_ONLY,
  owners: READ_ONLY,
  // Finance locked to director per Ishant 2026-05-18.
  finance: {},
  reservations: FULL_ACCESS,
  properties: FULL_ACCESS,
  settings: { read: 'all', write: 'self', approve: 'none', delete: 'none' },
  tenant_admin: {},
};

const FIELD_PERMS: RolePermissions = {
  tasks: { read: 'team', write: 'self', approve: 'none', delete: 'none' },
  inbox_team: FULL_ACCESS,
  inbox_guest: {},
  inbox_syndic: {},
  inbox_group: {},
  hr_staff: SELF_ONLY,
  hr_roster: { read: 'self', write: 'none', approve: 'none', delete: 'none' },
  hr_time_off: SELF_ONLY,
  hr_stats: {},
  hr_permissions: {},
  crm: {},
  owners: {},
  finance: {},
  // Field/Contributor (per Reservations scoping pack §6) sees the reservation
  // itself but not finance sub-tabs — Folio/Accounting/Payments are gated
  // separately inside ReservationDetail by `financialAccessFor(role)`.
  reservations: READ_ONLY,
  properties: {},
  // Field gets a slimmed Settings (Appearance + Account only — section gating in
  // SettingsModule). SELF_ONLY here unlocks the module; sections handle the rest.
  settings: SELF_ONLY,
  tenant_admin: {},
};

const EXTERNAL_PERMS: RolePermissions = {
  // External vendors (Oracle Cleaning Co.) — no FAD access at all.
};

export const PERMISSIONS: Record<TaskUser['role'], RolePermissions> = {
  director: DIRECTOR_PERMS,
  commercial_marketing: COMMERCIAL_MARKETING_PERMS,
  ops_manager: OPS_MANAGER_PERMS,
  field: FIELD_PERMS,
  external: EXTERNAL_PERMS,
};

export const RESOURCE_LABEL: Record<Resource, string> = {
  tasks: 'Tasks',
  inbox_guest: 'Inbox · Guest',
  inbox_syndic: 'Inbox · Syndic',
  inbox_group: 'Inbox · Group',
  inbox_team: 'Inbox · Team',
  crm: 'CRM',
  owners: 'Owners',
  finance: 'Finance',
  reservations: 'Reservations',
  properties: 'Properties',
  hr_staff: 'HR · Staff',
  hr_roster: 'Operations · Roster',
  hr_time_off: 'HR · Time-off',
  hr_stats: 'HR · Stats',
  hr_permissions: 'HR · Permissions',
  settings: 'Settings',
  tenant_admin: 'Tenant Admin',
};

export const ROLE_LABEL: Record<TaskUser['role'], string> = {
  director: 'Director',
  commercial_marketing: 'Commercial & Marketing',
  ops_manager: 'Ops Manager',
  field: 'Field',
  external: 'External',
};

export const ALL_RESOURCES: Resource[] = Object.keys(RESOURCE_LABEL) as Resource[];
export const ALL_ACTIONS: Action[] = ['read', 'write', 'approve', 'delete'];

/**
 * Returns the scope (or 'none') a given role has on (resource, action).
 * Director always returns 'all' regardless of matrix state — lockout guard.
 */
export function getScope(role: TaskUser['role'], resource: Resource, action: Action): Scope {
  if (role === 'director') return 'all';
  const rolePerms = PERMISSIONS[role];
  const resourcePerms = rolePerms[resource];
  if (!resourcePerms) return 'none';
  return resourcePerms[action] ?? 'none';
}
