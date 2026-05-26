// Time-off requests — feeds HR > Time-off sub-page.
// Approving a request optimistically flips the corresponding RosterDay cells
// in the affected week to availability: 'leave' with leaveType set (T5 wires this).

export type TimeOffType = 'annual' | 'sick' | 'personal';
export type TimeOffStatus = 'pending' | 'approved' | 'declined';

export interface TimeOffRequest {
  id: string;
  userId: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string;   // YYYY-MM-DD inclusive
  type: TimeOffType;
  reason?: string;
  status: TimeOffStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
}

// @demo:data — Tag: PROD-DATA-37 — see frontend/DEMO_CRUFT.md
export const TIME_OFF_REQUESTS: TimeOffRequest[] = [
  {
    id: 'to-001',
    userId: 'u-mary',
    startDate: '2026-05-15',
    endDate: '2026-05-17',
    type: 'annual',
    reason: 'Family trip to Reunion',
    status: 'approved',
    reviewedBy: 'u-franny',
    reviewedAt: '2026-04-23T14:00:00',
    reviewNotes: 'Approved — coverage Bryan + Catherine.',
    createdAt: '2026-04-22T10:30:00',
  },
  {
    id: 'to-002',
    userId: 'u-catherine',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    type: 'personal',
    reason: 'Doctor appointment, morning',
    status: 'pending',
    createdAt: '2026-04-26T16:00:00',
  },
  {
    id: 'to-003',
    userId: 'u-bryan',
    startDate: '2026-04-23',
    endDate: '2026-04-25',
    type: 'annual',
    reason: 'Wedding · Curepipe',
    status: 'declined',
    reviewedBy: 'u-franny',
    reviewedAt: '2026-04-15T11:00:00',
    reviewNotes: 'Too close to peak weekend (LB-2 + 3 north-zone arrivals). Reschedule for early May?',
    createdAt: '2026-04-14T09:30:00',
  },
  {
    id: 'to-005',
    userId: 'u-mathias',
    startDate: '2026-04-20',
    endDate: '2026-04-21',
    type: 'sick',
    reason: 'Flu',
    status: 'approved',
    reviewedBy: 'u-franny',
    reviewedAt: '2026-04-20T08:30:00',
    reviewNotes: 'Get well.',
    createdAt: '2026-04-20T07:15:00',
  },
];

export const TIME_OFF_TYPE_LABEL: Record<TimeOffType, string> = {
  annual: 'Annual leave',
  sick: 'Sick leave',
  personal: 'Personal',
};

export const TIME_OFF_STATUS_LABEL: Record<TimeOffStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
};
