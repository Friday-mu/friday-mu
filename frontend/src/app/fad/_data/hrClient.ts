'use client';

// HR module client — live data from /api/hr/* backed by FAD-owned tables
// in gmsdb. Mirrors the pattern of reviewsClient/inboxClient: typed
// fetchers + thin React hooks with refetch.

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../components/types';

export interface Staff {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  department?: string;
  zone?: string;
  hire_date?: string;
  status: 'active' | 'archived';
  last_worked_date?: string;
  leave_reason?: string;
  leave_notes?: string;
  archived_at?: string;
  notes?: string;
  user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TimeOffRequest {
  id: string;
  staff_id: string;
  staff_name?: string;
  start_date: string;       // YYYY-MM-DD (cast to text server-side)
  end_date: string;
  type: 'annual' | 'sick' | 'unpaid' | 'family' | 'other';
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
}

// ─── Staff: reads ───

export async function loadStaff(status?: 'active' | 'archived'): Promise<Staff[]> {
  const path = status ? `/api/hr/staff?status=${status}` : '/api/hr/staff';
  const data = await apiFetch(path) as { results: Staff[] };
  return data.results || [];
}

export interface UseStaffResult {
  staff: Staff[] | null;
  loading: boolean;
  isRevalidating: boolean;
  error: string | null;
  refetch: () => void;
}

export function useStaff(status?: 'active' | 'archived'): UseStaffResult {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stale-while-revalidate. Refetches keep the visible roster on screen.
  const refetch = useCallback(() => {
    setIsRevalidating(true);
    setError(null);
    loadStaff(status)
      .then(setStaff)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load staff'))
      .finally(() => { setLoading(false); setIsRevalidating(false); });
  }, [status]);

  useEffect(() => { refetch(); }, [refetch]);

  return { staff, loading, isRevalidating, error, refetch };
}

// ─── Staff: mutations ───

export async function createStaff(payload: {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  department?: string;
  zone?: string;
  hire_date?: string;
  notes?: string;
}): Promise<Staff> {
  return apiFetch('/api/hr/staff', { method: 'POST', body: JSON.stringify(payload) }) as Promise<Staff>;
}

export async function updateStaff(id: string, patch: Partial<Staff>): Promise<Staff> {
  return apiFetch(`/api/hr/staff/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<Staff>;
}

export async function archiveStaff(id: string, payload: {
  last_worked_date: string;
  leave_reason: string;
  leave_notes?: string;
}): Promise<Staff> {
  return apiFetch(`/api/hr/staff/${id}/archive`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<Staff>;
}

export async function reactivateStaff(id: string): Promise<Staff> {
  return apiFetch(`/api/hr/staff/${id}/reactivate`, { method: 'POST' }) as Promise<Staff>;
}

// ─── Time-off: reads ───

export async function loadTimeOffRequests(opts: { status?: string; staff_id?: string } = {}): Promise<TimeOffRequest[]> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.staff_id) qs.set('staff_id', opts.staff_id);
  const path = qs.toString() ? `/api/hr/time-off?${qs}` : '/api/hr/time-off';
  const data = await apiFetch(path) as { results: TimeOffRequest[] };
  return data.results || [];
}

export interface UseTimeOffResult {
  requests: TimeOffRequest[] | null;
  loading: boolean;
  isRevalidating: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTimeOffRequests(opts: { status?: string; staff_id?: string } = {}): UseTimeOffResult {
  const [requests, setRequests] = useState<TimeOffRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const optsKey = JSON.stringify(opts);

  const refetch = useCallback(() => {
    setIsRevalidating(true);
    setError(null);
    loadTimeOffRequests(opts)
      .then(setRequests)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load time-off requests'))
      .finally(() => { setLoading(false); setIsRevalidating(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optsKey]);

  useEffect(() => { refetch(); }, [refetch]);

  return { requests, loading, isRevalidating, error, refetch };
}

// ─── Time-off: mutations ───

export async function submitTimeOffRequest(payload: {
  start_date: string;
  end_date: string;
  type: TimeOffRequest['type'];
  reason?: string;
}): Promise<TimeOffRequest> {
  return apiFetch('/api/hr/time-off', { method: 'POST', body: JSON.stringify(payload) }) as Promise<TimeOffRequest>;
}

export async function decideTimeOffRequest(id: string, decision: {
  status: 'approved' | 'rejected';
  review_notes?: string;
}): Promise<TimeOffRequest> {
  return apiFetch(`/api/hr/time-off/${id}`, { method: 'PATCH', body: JSON.stringify(decision) }) as Promise<TimeOffRequest>;
}

export async function cancelTimeOffRequest(id: string): Promise<TimeOffRequest> {
  return apiFetch(`/api/hr/time-off/${id}/cancel`, { method: 'POST' }) as Promise<TimeOffRequest>;
}

// ─── Helpers ───

/** Derive initials from a name (e.g. "Ishant Ayadassen" → "IA"). */
export function initialsOf(name: string): string {
  return (
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
  );
}

/** Stable color from a string. Used for avatar tinting when the backend
 *  doesn't supply one (which is always for now). */
export function avatarColorFor(seed: string): string {
  const colors = ['#7c3aed', '#10b981', '#84cc16', '#0ea5e9', '#ec4899', '#ef4444', '#f59e0b', '#64748b'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h) + seed.charCodeAt(i);
  return colors[Math.abs(h) % colors.length];
}

// ─── Adapter: API Staff → fixture TaskUser shape ───
//
// The existing StaffPage / Roster / Operations modules render against the
// TaskUser type from _data/tasks.ts. Rather than rewrite all those callers,
// the adapter fills in API-derived fields and synthesizes the rest
// (initials, avatar colour) so live data drops in transparently.

import type { TaskUser } from './tasks';

const API_ROLE_TO_FIXTURE: Record<string, TaskUser['role']> = {
  director: 'director',
  admin: 'director',
  commercial: 'commercial_marketing',
  commercial_marketing: 'commercial_marketing',
  ops_manager: 'ops_manager',
  field: 'field',
  // No 'finance' or 'admin'-as-staff in TaskUser — collapse to 'field'
  // so list/filter UI still renders. Surfaces correctly via department text.
  finance: 'field',
  external: 'external',
};

/** Reverse map — fixture TaskUser role → API role. Used when the drawer
 *  sends form data back to the backend. */
export function fixtureRoleToApi(role: TaskUser['role']): string {
  if (role === 'commercial_marketing') return 'commercial';
  return role;
}

// ─── Adapter: API TimeOffRequest → fixture-shape with staff name baked in ───

import type { TimeOffRequest as FixtureTimeOff, TimeOffStatus, TimeOffType } from './timeOff';

const API_STATUS_TO_FIXTURE: Record<string, TimeOffStatus> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'declined',
  cancelled: 'declined',
};

export interface AdaptedTimeOff extends FixtureTimeOff {
  // Live-data extras the renderer prefers when present. Frontend code that
  // does TASK_USER_BY_ID[r.userId] will return undefined for live staff;
  // these fields let the UI render correctly anyway.
  _staffName?: string;
  _staffInitials?: string;
  _staffAvatarColor?: string;
  _apiStatus?: TimeOffRequest['status']; // 'rejected' / 'cancelled' detail
  _reviewerName?: string;
}

export function apiRequestToFixtureShape(r: TimeOffRequest): AdaptedTimeOff {
  const status = API_STATUS_TO_FIXTURE[r.status] ?? 'pending';
  return {
    id: r.id,
    userId: r.staff_id, // for lookup compatibility — falls through to _staffName
    startDate: r.start_date,
    endDate: r.end_date,
    type: r.type as TimeOffType,
    reason: r.reason,
    status,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    reviewNotes: r.review_notes,
    createdAt: r.created_at,
    _staffName: r.staff_name,
    _staffInitials: r.staff_name ? initialsOf(r.staff_name) : undefined,
    _staffAvatarColor: r.staff_id ? avatarColorFor(r.staff_id) : undefined,
    _apiStatus: r.status,
    _reviewerName: r.reviewed_by_name,
  };
}

export function staffToTaskUserLike(s: Staff): TaskUser {
  const role = API_ROLE_TO_FIXTURE[s.role || ''] ?? 'field';
  return {
    id: s.id,
    name: s.name,
    initials: initialsOf(s.name),
    email: s.email,
    role,
    notificationChannel: 'fad_inbox',
    startDate: s.hire_date || s.created_at.slice(0, 10),
    endDate: s.last_worked_date || undefined,
    active: s.status === 'active',
    avatarColor: avatarColorFor(s.id),
    homeZone: (s.zone === 'north' || s.zone === 'west') ? s.zone : undefined,
  };
}
