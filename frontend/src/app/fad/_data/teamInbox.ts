// Team-internal threads — channels + DMs + messages + scheduled calls.
// Real data source TBD (live wiring is part of Tier E roadmap items
// bw-7/bw-8/bw-9). Until then this file exposes empty arrays with the
// production type shapes so consumers compile and render empty states.
//
// fixture data purged 2026-05-13 (design-be-19); inbox should render real
// GMS data only — see Tier E roadmap items bw-7/bw-8/bw-9.

export type ChannelKey =
  // Public channels (everyone in tenant)
  | 'gm'             // daily good morning check-in
  | 'announce'       // company announcements + updates from Judith
  | 'random'         // non-work / miscellaneous
  | 'ops'            // operations (incl. guest comms execution)
  | 'reservations'   // listings / OTAs / pricing / website / new bookings
  | 'syndic'         // syndic work
  | 'agency'         // agency work
  | 'marketing'      // marketing campaigns + content
  | 'photoshoot'     // FULL-quality image storage; compression bypassed
  // Private channels (explicit membership)
  | 'finance'        // finance + accounting
  | 'admin'          // Stripe, bank accounts, legal-ops, accountant comms
  | 'refunds'        // refund decisions + paper trail
  | 'adjustments'    // pricing / reservation adjustments
  // Legacy — kept so older fixtures don't break the type check during
  // the rollout window. Backend never emits this; consumers can prune.
  | 'general';

export interface TeamChannel {
  id: string;
  key: ChannelKey;
  name: string;
  purpose: string;
  memberIds: string[];
  unread?: number;
}

// fixture data purged 2026-05-13 (design-be-19); inbox should render real
// GMS data only — see Tier E roadmap items bw-7/bw-8/bw-9.
export const TEAM_CHANNELS: TeamChannel[] = [];

export interface TeamDM {
  id: string;
  participantIds: string[]; // 2 user ids for 1:1, 3+ for group DM
  unread?: number;
}

// fixture data purged 2026-05-13 (design-be-19); inbox should render real
// GMS data only — see Tier E roadmap items bw-7/bw-8/bw-9.
export const TEAM_DMS: TeamDM[] = [];

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
  text: string;
  ts: string;
  mentions?: string[];         // user ids
  kind?: TeamMessageKind;
  /** for kind: 'task_link' */
  linkedTaskId?: string;
  /** for kind: 'call_scheduled' — fixture Meet URL */
  callMeta?: TeamCallMeta;
  /** for kind: 'finance_escalation' — see FinanceEscalationMeta */
  financeEscalation?: FinanceEscalationMeta;
  attachments?: number;
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

// fixture data purged 2026-05-13 (design-be-19); inbox should render real
// GMS data only — see Tier E roadmap items bw-7/bw-8/bw-9.
//
// Kept as `let` (not `const`) because Phase-1 mutators in breezeway.ts and
// ScheduleCallDrawer.tsx still call TEAM_MESSAGES.push(). Once the live
// wiring lands they become no-ops over an immutable wire-shape and the
// `let` can revert to `const [] as const`.
export const TEAM_MESSAGES: TeamMessage[] = [];

/** All scheduled calls extracted for any future "Upcoming calls" surface. */
export const SCHEDULED_CALLS: TeamCallMeta[] = TEAM_MESSAGES
  .filter((m): m is TeamMessage & { callMeta: TeamCallMeta } => !!m.callMeta)
  .map((m) => m.callMeta);
