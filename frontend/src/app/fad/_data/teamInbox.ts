// @demo:data — Team-internal threads — GET /api/inbox/team-threads
// Tag: PROD-DATA-11 — see frontend/DEMO_CRUFT.md

// Team Inbox fixtures — channels + DMs + messages + scheduled calls.
// Phase 1 fixture-only with optimistic local state (T3 wires UI).
// Replaces internal Slack at the FAD level.

export type ChannelKey =
  // Public channels (everyone in tenant)
  | 'gm'
  | 'announce'
  | 'random'
  | 'ops'
  | 'reservations'
  | 'syndic'
  | 'agency'
  | 'marketing'
  | 'photoshoot'
  | 'design'
  // Private channels (explicit membership)
  | 'finance'
  | 'admin'
  | 'refunds'
  | 'adjustments'
  // Legacy keys still used by existing fixture/demo surfaces.
  | 'general';

export interface TeamChannel {
  id: string;
  key: ChannelKey;
  name: string;
  purpose: string;
  memberIds: string[];
  unread?: number;
}

export const TEAM_CHANNELS: TeamChannel[] = [
  {
    id: 'tc-general',
    key: 'general',
    name: '#general',
    purpose: 'Whole-team announcements + watercooler.',
    memberIds: ['u-ishant', 'u-franny', 'u-mathias', 'u-mary', 'u-bryan', 'u-catherine'],
    unread: 1,
  },
  {
    id: 'tc-ops',
    key: 'ops',
    name: '#ops',
    purpose: 'Daily ops coordination · roster posts · field-PM updates.',
    memberIds: ['u-ishant', 'u-franny', 'u-mary', 'u-bryan', 'u-catherine'],
    unread: 3,
  },
  {
    id: 'tc-finance',
    key: 'finance',
    name: '#finance',
    purpose: 'Period close · approvals · reconciliation.',
    memberIds: ['u-ishant', 'u-franny', 'u-mathias', 'u-mary'],
  },
  {
    id: 'tc-syndic',
    key: 'syndic',
    name: '#syndic',
    purpose: 'GBH building syndic matters.',
    memberIds: ['u-ishant', 'u-franny'],
  },
  {
    id: 'tc-marketing',
    key: 'marketing',
    name: '#marketing',
    purpose: 'Listings · campaigns · brand work.',
    memberIds: ['u-ishant', 'u-mathias'],
  },
];

export interface TeamDM {
  id: string;
  participantIds: string[]; // 2 user ids for 1:1, 3+ for group DM
  unread?: number;
}

export const TEAM_DMS: TeamDM[] = [
  { id: 'dm-ishant-franny', participantIds: ['u-ishant', 'u-franny'], unread: 1 },
  { id: 'dm-ishant-mathias', participantIds: ['u-ishant', 'u-mathias'] },
  { id: 'dm-franny-bryan', participantIds: ['u-franny', 'u-bryan'] },
  { id: 'dm-franny-catherine', participantIds: ['u-franny', 'u-catherine'] },
  { id: 'dm-ishant-franny-bryan', participantIds: ['u-ishant', 'u-franny', 'u-bryan'], unread: 2 },
];

export type TeamMessageKind = 'text' | 'system' | 'call_scheduled' | 'task_link' | 'roster_publish' | 'finance_escalation';

/** Tier of a finance-escalation post. T1 = direct ask in #finance,
 *  T2 = phone-call escalation if T1 silent, T3 = fallback to Franny. */
export type FinanceEscalationTier = 't1_inbox' | 't2_phone_3cx' | 't3_fallback';

export interface FinanceEscalationMeta {
  /** Original requestor (e.g. Mathias). */
  requestorId: string;
  /** Who we're asking for approval right now. */
  recipientId: string;
  reservationId?: string;
  amountMinor: number;
  currency: 'MUR' | 'EUR' | 'USD';
  reason: string;
  urgent?: boolean;
  tier: FinanceEscalationTier;
  /** Stable id linking T1 → T2 → T3 messages for the same request. */
  requestId: string;
}

export interface TeamMessage {
  id: string;
  channelKey?: ChannelKey;     // present for channel posts
  dmId?: string;               // present for DMs
  authorId: string;
  /** Backend-captured display name for live TeamInbox messages. */
  authorName?: string;
  text: string;
  ts: string;
  mentions?: string[];         // user ids
  kind?: TeamMessageKind;
  /** for kind: 'task_link' */
  linkedTaskId?: string;
  /** for kind: 'task_link' task-comment bridge messages */
  taskComment?: {
    taskId: string;
    taskTitle: string;
    propertyCode: string;
    commentId: string;
    commentPreview: string;
  };
  /** for kind: 'call_scheduled' — fixture Meet URL */
  callMeta?: TeamCallMeta;
  /** for kind: 'finance_escalation' — see FinanceEscalationMeta */
  financeEscalation?: FinanceEscalationMeta;
  /** Optional Design project link inferred or selected at send time. */
  designProject?: {
    id: string;
    name: string;
    slug?: string | null;
    source?: 'manual' | 'inferred' | 'inherited' | string;
    confidence?: number;
  };
  attachments?: number;
  /** Attached files / images on this message. */
  attachmentList?: Array<{
    id: string;
    filename: string;
    mimeType: string | null;
    sizeBytes: number;
    url: string;
    width: number | null;
    height: number | null;
  }>;
  /** Slack-style flat threading. Set on replies; top-level messages are null. */
  parentMessageId?: string | null;
  threadCount?: number;
}

export interface TeamCallMeta {
  id: string;
  title: string;
  startAt: string; // ISO
  meetUrl: string;
  inviteeIds: string[];
  inviteeEmails?: string[];    // for non-FAD attendees
  organizerId: string;
}

export const TEAM_MESSAGES: TeamMessage[] = [
  // #general
  {
    id: 'tm-001',
    channelKey: 'general',
    authorId: 'u-ishant',
    text: 'New FAD modules landing this week — HR, Team Inbox, Tasks rebuild. Ping if anything looks off.',
    ts: '2026-04-27T08:30:00',
    kind: 'text',
  },
  {
    id: 'tm-002',
    channelKey: 'general',
    authorId: 'u-ishant',
    text: '🎉',
    ts: '2026-04-27T08:32:00',
    kind: 'text',
  },

  // #ops
  {
    id: 'tm-010',
    channelKey: 'ops',
    authorId: 'u-bryan',
    text: 'A/C at LB-2 is dead — guest reported overnight. @Mathias Duval coordinating parts ETA from Coolbreeze 14:00.',
    ts: '2026-04-27T08:15:00',
    mentions: ['u-mathias'],
    kind: 'text',
    threadCount: 4,
  },
  {
    id: 'tm-011',
    channelKey: 'ops',
    authorId: 'u-franny',
    text: 'Roster published for week of Apr 27 — May 3. Bryan kept on north all week (7 maintenance jobs).',
    ts: '2026-04-26T18:30:00',
    kind: 'roster_publish',
  },
  {
    id: 'tm-012',
    channelKey: 'ops',
    authorId: 'u-catherine',
    text: 'Welcome basket missing chocolates at RC-15. Drop now or wait for Kanarski check-in?',
    ts: '2026-04-27T09:38:00',
    kind: 'text',
    threadCount: 2,
  },
  {
    id: 'tm-013',
    channelKey: 'ops',
    authorId: 'u-franny',
    text: 'Drop now. Guest in 4hr.',
    ts: '2026-04-27T09:40:00',
    kind: 'text',
  },

  // #finance
  {
    id: 'tm-020',
    channelKey: 'finance',
    authorId: 'u-mary',
    text: 'Apr period close at Stage 5/8. MauBank PDF still missing — chasing Sumesh today.',
    ts: '2026-04-27T07:45:00',
    kind: 'text',
  },
  {
    id: 'tm-021',
    channelKey: 'finance',
    authorId: 'u-ishant',
    text: 'LC-9 roof: Rs 22.5k pending owner approval. Marchand replied "je regarde demain matin" — should land in inbox today.',
    ts: '2026-04-27T08:10:00',
    kind: 'text',
  },

  // #syndic
  {
    id: 'tm-030',
    channelKey: 'syndic',
    authorId: 'u-franny',
    text: 'GBH AGM scheduled May 12. Agenda draft incoming.',
    ts: '2026-04-26T15:00:00',
    kind: 'text',
  },

  // #marketing
  {
    id: 'tm-040',
    channelKey: 'marketing',
    authorId: 'u-mathias',
    text: 'BL-12 listing photos refresh tomorrow 09:00. Need Bryan to clear the deck and stage cushions.',
    ts: '2026-04-27T07:30:00',
    mentions: ['u-bryan'],
    kind: 'text',
  },

  // DM samples
  {
    id: 'tm-100',
    dmId: 'dm-ishant-franny',
    authorId: 'u-franny',
    text: 'Catherine submitted PTO for May 4 — single day. Approving.',
    ts: '2026-04-27T07:55:00',
    kind: 'text',
  },
  {
    id: 'tm-101',
    dmId: 'dm-ishant-franny',
    authorId: 'u-ishant',
    text: '👍',
    ts: '2026-04-27T07:56:00',
    kind: 'text',
  },
  {
    id: 'tm-110',
    dmId: 'dm-franny-catherine',
    authorId: 'u-franny',
    text: 'Glass quote for LB-2 looks fine — pushing approval through.',
    ts: '2026-04-26T16:30:00',
    kind: 'text',
  },
  {
    id: 'tm-120',
    dmId: 'dm-ishant-franny-bryan',
    authorId: 'u-ishant',
    text: 'Owner walkthrough VV-47 Saturday 10am. Confirmed with Smith.',
    ts: '2026-04-26T11:00:00',
    kind: 'text',
  },
  {
    id: 'tm-121',
    dmId: 'dm-ishant-franny-bryan',
    authorId: 'u-franny',
    text: 'Will pull together garden + pool service log beforehand.',
    ts: '2026-04-26T11:05:00',
    kind: 'text',
  },

  // Scheduled call sample (in #ops)
  {
    id: 'tm-200',
    channelKey: 'ops',
    authorId: 'u-franny',
    text: '📅 Call scheduled: Weekly ops sync — Mon 09:00',
    ts: '2026-04-27T07:00:00',
    kind: 'call_scheduled',
    callMeta: {
      id: 'call-001',
      title: 'Weekly ops sync',
      startAt: '2026-04-27T09:00:00',
      meetUrl: 'https://meet.google.com/fixture-abc-defg',
      inviteeIds: ['u-franny', 'u-ishant', 'u-bryan', 'u-catherine'],
      organizerId: 'u-franny',
    },
  },
];

/** All scheduled calls extracted for any future "Upcoming calls" surface. */
export const SCHEDULED_CALLS: TeamCallMeta[] = TEAM_MESSAGES
  .filter((m): m is TeamMessage & { callMeta: TeamCallMeta } => !!m.callMeta)
  .map((m) => m.callMeta);

const TASK_COMMENT_MESSAGES_KEY = 'fad:team-task-comment-messages';

function readTaskCommentMessages(): TeamMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TASK_COMMENT_MESSAGES_KEY);
    return raw ? JSON.parse(raw) as TeamMessage[] : [];
  } catch {
    return [];
  }
}

function writeTaskCommentMessages(messages: TeamMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TASK_COMMENT_MESSAGES_KEY, JSON.stringify(messages));
  } catch {
    // ignore storage failures; task comments remain canonical on the task.
  }
}

export function taskCommentTeamMessages(): TeamMessage[] {
  return readTaskCommentMessages();
}

export function allTeamMessages(): TeamMessage[] {
  const byId = new Map<string, TeamMessage>();
  [...TEAM_MESSAGES, ...readTaskCommentMessages()].forEach((message) => {
    if (!byId.has(message.id)) byId.set(message.id, message);
  });
  return Array.from(byId.values()).sort((a, b) => b.ts.localeCompare(a.ts));
}

export function recordTaskCommentTeamMessage(message: TeamMessage): boolean {
  const existing = readTaskCommentMessages();
  if (TEAM_MESSAGES.some((m) => m.id === message.id) || existing.some((m) => m.id === message.id)) {
    return false;
  }
  writeTaskCommentMessages([...existing, message]);
  return true;
}
