'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  PERMISSIONS,
  getScope,
  type Action,
  type Resource,
  type RolePermissions,
  type Scope,
} from '../_data/permissions';
import { TASK_USERS, type TaskUser } from '../_data/tasks';

// ───────────────── Context ─────────────────

type Role = TaskUser['role'];

interface PermissionsContextValue {
  /** Current acting role. Phase 1 defaults to 'director' in production. */
  role: Role;
  /** The TaskUser whose role is "currently active" — for self-scope checks. */
  currentUserId: string;
  /** The "real" auth'd role — what Phase 2 auth would resolve. View-as switcher
   *  gates on this to prevent non-directors from seeing it. */
  realRole: Role;
  setRole: (role: Role) => void;
  /** Convenience: bypass any check (Director). */
  isDirector: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

// @demo:auth + @demo:state — Tag: PROD-AUTH-4 / PROD-STATE-1 — see frontend/DEMO_CRUFT.md
// Replace with: auth-context provider that reads role + user from JWT (or
// GET /api/auth/me). Delete dev-role storage entirely. Backend MUST also
// enforce permission on API endpoints — client checks are not authoritative.
const STORAGE_KEY = 'fad:dev-role';
const STORAGE_USER_KEY = 'fad:dev-user';
const STORAGE_REAL_ROLE_KEY = 'fad:real-role';

/**
 * Defaults — Phase 1 production lands as Director (Ishant).
 * Dev role-switcher persists override in localStorage.
 *
 * The "real role" — what Phase 2 auth would resolve — is stored separately so
 * the View-as switcher can be gated to Director only. Field staff using FAD
 * for real never see the switcher.
 */
const DEFAULT_ROLE: Role = 'director';
const DEFAULT_USER_ID = 'u-ishant';

/** Pick the first user fixture matching a role — used when role-switcher fires. */
function pickUserForRole(role: Role): string {
  const user = TASK_USERS.find((u) => u.role === role && u.active);
  return user?.id ?? DEFAULT_USER_ID;
}

interface ProviderProps {
  children: ReactNode;
  /** Override for tests / SSR. Skipped when localStorage has a value. */
  initialRole?: Role;
}

export function PermissionsProvider({ children, initialRole }: ProviderProps) {
  const [role, setRoleState] = useState<Role>(initialRole ?? DEFAULT_ROLE);
  const [currentUserId, setCurrentUserId] = useState<string>(DEFAULT_USER_ID);
  const [realRole, setRealRole] = useState<Role>(initialRole ?? DEFAULT_ROLE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Role | null;
      const storedUser = localStorage.getItem(STORAGE_USER_KEY);
      const storedReal = localStorage.getItem(STORAGE_REAL_ROLE_KEY) as Role | null;
      if (storedReal && storedReal in PERMISSIONS) {
        setRealRole(storedReal);
      } else {
        // First load: snapshot the initial role as the "real" role.
        const real = initialRole ?? DEFAULT_ROLE;
        setRealRole(real);
        localStorage.setItem(STORAGE_REAL_ROLE_KEY, real);
      }
      if (stored && stored in PERMISSIONS) {
        setRoleState(stored);
        setCurrentUserId(storedUser ?? pickUserForRole(stored));
      } else {
        setCurrentUserId(pickUserForRole(initialRole ?? DEFAULT_ROLE));
      }
    } catch {
      // localStorage unavailable; keep defaults
    }
    setHydrated(true);
  }, [initialRole]);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    const userId = pickUserForRole(next);
    setCurrentUserId(userId);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.setItem(STORAGE_USER_KEY, userId);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<PermissionsContextValue>(
    () => ({
      role,
      currentUserId,
      realRole,
      setRole,
      isDirector: role === 'director',
    }),
    [role, currentUserId, realRole, setRole],
  );

  return createElement(PermissionsContext.Provider, { value }, hydrated ? children : null);
}

// ───────────────── Hooks ─────────────────

function ctx(): PermissionsContextValue {
  const value = useContext(PermissionsContext);
  if (!value) {
    // Provider absent (older surfaces or stories). Fall back to Director — safe in dev,
    // never reached in production because FadApp wraps everything.
    return {
      role: DEFAULT_ROLE,
      currentUserId: DEFAULT_USER_ID,
      realRole: DEFAULT_ROLE,
      setRole: () => undefined,
      isDirector: true,
    };
  }
  return value;
}

export function useCurrentRole(): Role {
  return ctx().role;
}

export function useCurrentUserId(): string {
  return ctx().currentUserId;
}

/** Hook: imperative permission checks. */
export function usePermissions() {
  const { role, currentUserId, realRole, setRole, isDirector } = ctx();

  const can = useCallback(
    (resource: Resource, action: Action): boolean => {
      const scope = getScope(role, resource, action);
      // 'all' and 'team' both grant general access; 'self' requires owner check via canForSelf.
      return scope === 'all' || scope === 'team';
    },
    [role],
  );

  const scopeOf = useCallback(
    (resource: Resource, action: Action): Scope => getScope(role, resource, action),
    [role],
  );

  const canForSelf = useCallback(
    (resource: Resource, action: Action, ownerId: string): boolean => {
      const scope = getScope(role, resource, action);
      if (scope === 'all' || scope === 'team') return true;
      if (scope === 'self') return ownerId === currentUserId;
      return false;
    },
    [role, currentUserId],
  );

  return {
    role,
    currentUserId,
    realRole,
    setRole,
    isDirector,
    can,
    canForSelf,
    scopeOf,
  };
}

/** Hook: declarative single-check shortcut. Returns true only for 'all' / 'team' scopes. */
export function useCanAccess(resource: Resource, action: Action = 'read'): boolean {
  const { can } = usePermissions();
  return can(resource, action);
}

/**
 * Hook: looser visibility check — returns true if the role has ANY scope
 * (all / team / self) on (resource, action). Use this for navigation visibility
 * (sub-page tabs, sidebar entries) where 'self' is enough to render.
 */
export function useCanSee(resource: Resource, action: Action = 'read'): boolean {
  const { scopeOf } = usePermissions();
  return scopeOf(resource, action) !== 'none';
}

// ───────────────── Module → resource mapping ─────────────────
//
// Modules in MODULES are gated by mapping their id to one or more Resource keys.
// A module is visible when the current role has read access on ALL listed resources.
//
// Modules absent from this map default to "open to all roles" — matching the
// "no accidental lockouts" rule in §10.

export const MODULE_RESOURCE: Record<string, Resource[]> = {
  // Inbox is visible if ANY tab resource is granted (Guest, Team, Group, Syndic).
  // Tab-level filtering happens inside the module via INBOX_TAB_RESOURCE.
  inbox: ['inbox_guest', 'inbox_team', 'inbox_group', 'inbox_syndic'],
  // 'operations' was renamed from 'tasks' — internal data layer still uses 'tasks' resource.
  operations: ['tasks'],
  calendar: ['reservations'],
  properties: ['properties'],
  reservations: ['reservations'],
  finance: ['finance'],
  // Legal & Admin gated by `owners` (contracts / legal docs sit in the owner-domain)
  // rather than `settings` — keeps it hidden from Field while leaving Settings open.
  legal: ['owners'],
  guests: ['owners'],
  owners: ['owners'],
  reviews: ['owners'],
  marketing: ['crm'],
  leads: ['crm'],
  analytics: ['owners'],
  intelligence: ['owners'],
  syndic: ['inbox_syndic'],
  // Tease/preview business-unit + system modules. Gated by `owners` so Field
  // (no owners scope) doesn't see them in the sidebar; Director / Commercial /
  // Ops all retain visibility. Refine semantics when these modules ship for real.
  // 'design' is the live Friday Design OS module (FD entity, paid ID projects).
  design: ['owners'],
  agency: ['owners'],
  training: ['owners'],
  settings: ['settings'],
  hr: ['hr_staff'],
};

/**
 * Inbox tab visibility — per brief §3.3, the existing Inbox extends to Team / Group tabs.
 * Each tab gets its own resource gate. Used by InboxModule when T3 ships tabs.
 */
export const INBOX_TAB_RESOURCE: Record<string, Resource> = {
  guest: 'inbox_guest',
  team: 'inbox_team',
  group: 'inbox_group',
  syndic: 'inbox_syndic',
};

/**
 * Returns true if the given role can see the module at all — i.e. has read
 * access on ANY of the listed resources. Sub-tab filtering happens inside
 * each module (Inbox tabs, Finance sub-pages, etc.).
 */
export function canSeeModule(role: Role, moduleId: string): boolean {
  if (role === 'director') return true;
  const resources = MODULE_RESOURCE[moduleId];
  if (!resources) return true; // unmapped → open by default
  const rolePerms: RolePermissions = PERMISSIONS[role] ?? {};
  return resources.some((r) => {
    const scope = rolePerms[r]?.read ?? 'none';
    return scope !== 'none';
  });
}

// ───────────────── Friday card gating ─────────────────
//
// FridayCards aggregate across modules. Each card type declares the resource
// it surfaces — Friday filters cards on render so a Field role never sees a
// Finance card.

export const FRIDAY_CARD_RESOURCE: Record<string, Resource | null> = {
  'tourist-tax-breakdown': 'finance',
  'owner-pl': 'owners',
  'checkins': 'reservations',
  'draft-reply': 'inbox_guest',
  'bars': 'owners',
  'action': null, // varies by card.module — caller should check action card's module separately
};

export function canSeeFridayCard(role: Role, cardType: string, cardModule?: string): boolean {
  if (role === 'director') return true;
  const resource = FRIDAY_CARD_RESOURCE[cardType];
  if (resource === null && cardModule) {
    return canSeeModule(role, cardModule);
  }
  if (!resource) return true; // unknown card → open by default
  const scope = getScope(role, resource, 'read');
  return scope !== 'none';
}
