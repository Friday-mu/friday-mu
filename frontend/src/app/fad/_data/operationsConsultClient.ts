'use client';

import { apiFetch } from '../../../components/types';
import type { Task } from './tasks';
import type { OperationsStaffUser } from './operationsStaffClient';
import type { ScheduleReservation } from './reservationsClient';

export type OperationsConsultContext =
  | 'schedule'
  | 'roster'
  | 'task_triage'
  | 'maintenance'
  | 'cleaning'
  | 'supplies'
  | 'owner_approval'
  | 'general';

export interface OperationsConsultHistoryMessage {
  role: 'user' | 'friday';
  text: string;
}

export interface OperationsConsultActionSuggestion {
  type:
    | 'draft_schedule'
    | 'apply_schedule_draft'
    | 'clear_schedule_times'
    | 'clear_times_and_assignees'
    | 'undo_last_schedule_step'
    | 'create_task_draft'
    | 'request_owner_approval';
  label: string;
  reason: string | null;
  confidence: number | null;
}

export interface OperationsConsultPlanItem {
  taskId: string;
  title: string;
  propertyCode: string;
  dueDate: string;
  dueTime: string;
  assigneeIds: string[];
  reason: string;
}

export interface OperationsConsultRequest {
  text: string;
  context: OperationsConsultContext;
  selectedDate?: string;
  rangeStart?: string;
  rangeEnd?: string;
  plannerMode?: string;
  timelineScale?: string;
  scheduledTasks?: Task[];
  unscheduledTasks?: Task[];
  staff?: OperationsStaffUser[];
  reservations?: ScheduleReservation[];
  currentPlan?: OperationsConsultPlanItem[];
  history?: OperationsConsultHistoryMessage[];
  notes?: string;
}

export interface OperationsConsultResponse {
  response: string;
  model?: string;
  confidence?: number;
  action_suggestions?: OperationsConsultActionSuggestion[];
  metadata?: {
    surface?: string;
    loadedSkills?: string[];
    tokenEstimate?: number;
    propertyCode?: string | null;
  };
}

export function sendOperationsConsultMessage(payload: OperationsConsultRequest): Promise<OperationsConsultResponse> {
  return apiFetch('/api/operations/consult', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<OperationsConsultResponse>;
}
