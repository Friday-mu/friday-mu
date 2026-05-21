'use client';

import { apiFetch } from '../../../components/types';

export interface OperationsStaffUser {
  id: string;
  name: string;
  email?: string;
  role?: string | null;
  initials: string;
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

export async function loadOperationsStaffUsers(): Promise<OperationsStaffUser[]> {
  const data = await apiFetch('/api/team/users') as TeamUserResponse;
  return (data.users || [])
    .filter((user) => typeof user.id === 'string' && user.id.length > 0)
    .map((user) => {
      const name = user.displayName || user.display_name || user.username || user.email || 'Unknown user';
      return {
        id: user.id as string,
        name,
        email: user.email,
        role: user.role ?? null,
        initials: initialsFor(name),
      };
    });
}
