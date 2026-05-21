'use client';

import { apiFetch } from '../../../components/types';
import type { Availability, RosterDay, Zone } from './roster';

export interface ApiRosterDay {
  id?: string;
  staff_id?: string;
  staff_name?: string | null;
  user_id?: string | null;
  date?: string;
  availability?: Availability;
  zone?: Zone | 'office' | null;
  leave_type?: RosterDay['leaveType'] | 'unpaid' | 'family' | 'other' | null;
  start_time?: string | null;
  end_time?: string | null;
  notes?: string | null;
  updated_at?: string | null;
}

export interface ApiRosterWeek {
  id?: string | null;
  week_start: string;
  week_end: string;
  status: 'draft' | 'published' | 'archived';
  notes?: string | null;
  published_at?: string | null;
  published_by?: string | null;
  published_by_name?: string | null;
  updated_at?: string | null;
  days: ApiRosterDay[];
}

interface RosterResponse {
  roster?: ApiRosterWeek;
}

export async function loadRosterWeek(weekStart: string): Promise<ApiRosterWeek> {
  const data = await apiFetch(`/api/hr/roster?week_start=${encodeURIComponent(weekStart)}`) as RosterResponse;
  if (!data.roster) throw new Error('Roster response was empty');
  return data.roster;
}

export async function saveRosterWeek(input: {
  weekStart: string;
  days: RosterDay[];
  notes?: string | null;
}): Promise<ApiRosterWeek> {
  const data = await apiFetch('/api/hr/roster', {
    method: 'PUT',
    body: JSON.stringify({
      week_start: input.weekStart,
      notes: input.notes ?? null,
      days: input.days.map((day) => ({
        staff_id: day.staffId || day.userId,
        date: day.date,
        availability: day.availability,
        zone: day.zone ?? null,
        leave_type: day.leaveType ?? null,
        start_time: day.startTime ?? null,
        end_time: day.endTime ?? null,
        notes: day.notes ?? null,
      })),
    }),
  }) as RosterResponse;
  if (!data.roster) throw new Error('Roster save response was empty');
  return data.roster;
}

export async function publishRosterWeek(weekStart: string): Promise<ApiRosterWeek> {
  const data = await apiFetch('/api/hr/roster/publish', {
    method: 'POST',
    body: JSON.stringify({ week_start: weekStart }),
  }) as RosterResponse;
  if (!data.roster) throw new Error('Roster publish response was empty');
  return data.roster;
}
