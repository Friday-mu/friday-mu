'use client';

import { apiFetch } from '../../../components/types';

export interface OperationsStaffUser {
  id: string;
  staffId?: string;
  userId?: string;
  name: string;
  email?: string;
  role?: string | null;
  department?: string | null;
  zone?: string | null;
  status?: string | null;
  canAssign: boolean;
  initials: string;
}

interface HrStaffResponse {
  results?: Array<{
    id?: string;
    user_id?: string | null;
    name?: string;
    email?: string;
    role?: string | null;
    department?: string | null;
    zone?: string | null;
    status?: string | null;
  }>;
}

interface TeamUserResponse {
  users?: Array<{
    id?: string;
    displayName?: string;
    display_name?: string;
    username?: string;
    email?: string;
    role?: string | null;
  }>;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function mapHrStaff(data: HrStaffResponse): OperationsStaffUser[] {
  return (data.results || [])
    .filter((staff) => typeof staff.id === 'string' && typeof staff.name === 'string' && staff.name.trim().length > 0)
    .map((staff) => {
      const name = staff.name as string;
      const userId = typeof staff.user_id === 'string' && staff.user_id.length > 0 ? staff.user_id : undefined;
      return {
        id: userId || (staff.id as string),
        staffId: staff.id,
        userId,
        name,
        email: staff.email,
        role: staff.role ?? null,
        department: staff.department ?? null,
        zone: staff.zone ?? null,
        status: staff.status ?? null,
        canAssign: Boolean(userId),
        initials: initialsFor(name),
      };
    });
}

async function loadTeamUsersFallback(): Promise<OperationsStaffUser[]> {
  const data = await apiFetch('/api/team/users') as TeamUserResponse;
  return (data.users || [])
    .filter((user) => typeof user.id === 'string' && user.id.length > 0)
    .map((user) => {
      const name = user.displayName || user.display_name || user.username || user.email || 'Unknown user';
      return {
        id: user.id as string,
        userId: user.id,
        name,
        email: user.email,
        role: user.role ?? null,
        department: null,
        zone: null,
        status: 'active',
        canAssign: true,
        initials: initialsFor(name),
      };
    });
}

export async function loadOperationsStaffUsers(): Promise<OperationsStaffUser[]> {
  try {
    const staff = mapHrStaff(await apiFetch('/api/hr/staff?status=active') as HrStaffResponse);
    if (staff.length > 0) return staff;
  } catch (error) {
    // Fall back to tenant users when a non-HR route is the only readable source.
    // The caller surfaces the original error if this fallback also fails.
  }
  return loadTeamUsersFallback();
}
