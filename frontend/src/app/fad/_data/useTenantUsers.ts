'use client';

// Real tenant users — fetches `/api/tenants/me/users` once per session
// and maps each row to the `TaskUser`-compatible shape the
// Operations module consumers already expect (CreateTaskDrawer
// assignee picker, TaskDetail comment / cost / activity author
// lookups). Lets us drop `TASK_USERS` / `TASK_USER_BY_ID` from those
// surfaces without touching their render code.
//
// Mapping notes:
//   - `display_name` → `name`
//   - initials derived from display_name (same logic as
//     useDisplayedUser.ts so the avatar treatment is consistent)
//   - `avatarColor` hashed deterministically across an 8-colour palette
//   - `role` mapped from the GMS-side role (admin/manager/agent/staff)
//     to the FAD permissions role taxonomy
//   - Per-user FR-specific fields (homeZone, skills, weeklyConstraints,
//     notificationChannel) come back undefined — those aren't on the
//     tenant users row yet and the consumers tolerate undefined.
//
// Sibling hooks live in the same _data/ folder following the same
// module-cache + subscriber pattern: useEnabledModules,
// useTenantCurrency, useApiTasks.

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../components/types';
import type { TaskUser } from './tasks';

interface ServerUser {
  id: string;
  username: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  tenant_id: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

interface CacheState {
  users: TaskUser[];
  byId: Map<string, TaskUser>;
  loading: boolean;
  error: string | null;
  loaded: boolean;
}

let cache: CacheState = {
  users: [],
  byId: new Map(),
  loading: false,
  error: null,
  loaded: false,
};
let inFlight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((fn) => fn());
}

// 8-colour palette + deterministic hash — kept in sync with
// useDisplayedUser.ts so a user's avatar in the topbar matches the
// initials chip in the task assignee picker.
const AVATAR_PALETTE: string[] = [
  '#7c3aed', '#0ea5e9', '#f59e0b', '#10b981',
  '#ec4899', '#ef4444', '#6366f1', '#14b8a6',
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initialsFor(nameOrEmail: string): string {
  if (!nameOrEmail) return '?';
  const localPart = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail;
  const parts = localPart.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
  return AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length];
}

// GMS-side roles ↔ FAD permission taxonomy. The GMS role lives on
// the JWT + users row; the FAD app's permission gates (usePermissions
// .ts) work in a different vocabulary (director / commercial_marketing
// / ops_manager / field / external). 'admin' on a SaaS tenant maps to
// 'director' so the same permission paths fire. Defaults to
// 'ops_manager' so non-admin staff can be picked as assignees without
// elevated permissions.
function mapRole(gmsRole: string | null): TaskUser['role'] {
  switch (gmsRole) {
    case 'admin': return 'director';
    case 'manager': return 'ops_manager';
    case 'agent': return 'field';
    case 'staff': return 'field';
    default: return 'ops_manager';
  }
}

function mapUser(s: ServerUser): TaskUser {
  const name = s.display_name || s.username || s.email || 'Unknown';
  return {
    id: s.id,
    name,
    initials: initialsFor(s.display_name || s.username || s.email || ''),
    email: s.email || undefined,
    role: mapRole(s.role),
    homeZone: null,
    skills: undefined,
    weeklyConstraints: undefined,
    notificationChannel: 'fad_inbox',
    startDate: s.created_at?.slice(0, 10) || '',
    endDate: undefined,
    active: s.is_active,
    avatarColor: colorFor(name),
  };
}

async function load(): Promise<void> {
  if (inFlight) return inFlight;
  cache = { ...cache, loading: true, error: null };
  notify();
  inFlight = (async () => {
    try {
      const res = (await apiFetch('/api/tenants/me/users')) as ServerUser[];
      const users = (Array.isArray(res) ? res : []).map(mapUser);
      const byId = new Map(users.map((u) => [u.id, u]));
      cache = { users, byId, loading: false, error: null, loaded: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      cache = { ...cache, loading: false, error: msg, loaded: true };
    } finally {
      inFlight = null;
      notify();
    }
  })();
  return inFlight;
}

export interface UseTenantUsersResult {
  users: TaskUser[];
  byId: Map<string, TaskUser>;
  loading: boolean;
  error: string | null;
  loaded: boolean;
  refetch: () => void;
}

export function useTenantUsers(): UseTenantUsersResult {
  const [, force] = useState(0);

  useEffect(() => {
    const sub = () => force((v) => v + 1);
    subscribers.add(sub);
    if (!cache.loaded && !cache.loading) {
      void load();
    }
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  return {
    users: cache.users,
    byId: cache.byId,
    loading: cache.loading,
    error: cache.error,
    loaded: cache.loaded,
    refetch: () => { void load(); },
  };
}

/** Test/SSR escape hatch. */
export function _resetTenantUsersCacheForTests(): void {
  cache = { users: [], byId: new Map(), loading: false, error: null, loaded: false };
  inFlight = null;
}
