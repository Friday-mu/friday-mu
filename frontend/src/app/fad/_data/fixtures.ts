// Inbox + KPIs + calendar wire types. Inbox fixture arrays purged 2026-05-13
// (design-be-19); inbox should render real GMS data only — see Tier E
// roadmap items bw-7/bw-8/bw-9. Other arrays in this file (TASKS, KPIs etc)
// are out of scope for design-be-19 and still ship as fixtures.

export interface InboxMessage {
  from: 'them' | 'us';
  name: string;
  time: string;
  /** Displayed body. When the message arrived in a non-English language and
   *  GMS translated it, this is the English translation. */
  body: string;
  /** Original (untranslated) body when GMS detected a non-English source
   *  and produced a translation. Undefined when no translation exists
   *  (text was already English, or pre-translation rows). */
  bodyOriginal?: string;
  /** ISO 639-1 source-language code from GMS's detectLanguage(). */
  bodyLang?: string;
  /** How the message was sent — human-readable channel/system label
   *  (e.g. "WhatsApp", "Airbnb", "Guesty"). Used in the bubble meta
   *  line to show provenance for outbound messages. Undefined when
   *  we don't know (older rows without module_type / sent_via_system). */
  via?: string;
  /** Explicit system provenance for the tri-tag meta row. */
  viaSystem?: string;
  /** Guest-visible channel for the tri-tag meta row. */
  viaChannel?: string;
}

export type InboxEntity = 'guest' | 'owner' | 'vendor' | 'unclassified';
export type InboxChannel =
  | 'airbnb'
  | 'booking'
  | 'whatsapp'
  | 'email'
  | 'website'
  | 'owner_email'
  | 'owner_whatsapp'
  | 'vendor_breezeway'
  | 'vendor_driver'
  | 'vendor_chef';

/** Stay status — where the guest is in the reservation lifecycle.
 *  Drives Inbox filtering ("Currently staying", "Booked", etc.). */
export type StayStatus = 'inquiry' | 'booked' | 'currently_staying' | 'checked_out' | 'cancelled' | 'na';

/** Internal note attached to a guest/owner/vendor thread. Only visible to the team —
 *  the external party (guest, owner, vendor) never sees these. Supports @mentions. */
export interface InternalNote {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  body: string;
  /** TaskUser ids @mentioned in the note. */
  mentions: string[];
  createdAt: string;
}

export type DraftState =
  | 'friday_drafting'
  | 'draft_ready'
  | 'under_review'
  | 'approved'
  | 'sending'
  | 'sent'
  | 'rejected'
  | 'revision_requested'
  | 'superseded'
  | 'send_queued'
  | 'send_failed'
  | 'dismissed';

/** AI-generated draft from GMS, bundled in the thread-detail response. */
export interface InboxDraft {
  id: string;
  state: DraftState;
  /** English-language draft body (the canonical version GMS authored). */
  body: string;
  /** Translated body when guest's original language is not English.
   *  Translation happens at send-time in GMS; this is the version that
   *  will go on the wire if approved. */
  bodyTranslated?: string;
  /** 0..1; UI thresholds: ≥0.8 green, ≥0.6 amber, else red. */
  confidence?: number;
  /** 1 for the original draft; ++1 each time the operator revises. */
  revisionNumber?: number;
  /** Last revision request (for revision_requested state). */
  revisionInstruction?: string;
  modelUsed?: string;
  createdAt: string;
  /** Send-queue retry metadata for send_queued / send_failed states. */
  retryCount?: number;
  nextRetryAt?: string;
  /** Why this draft was rejected (for rejected state). */
  rejectionReason?: string;
}

export interface InboxThread {
  id: string;
  unread: boolean;
  urgent?: 'red' | 'amber' | 'neutral' | 'accent';
  guest: string;
  subject: string;
  preview: string;
  channel: string;
  entity: InboxEntity;
  channelKey: InboxChannel;
  property: string;
  time: string;
  /** Triage status — used by the Filter sheet (was the All/Unread/Review/Open/Done tabs). */
  triageStatus?: 'unread' | 'review' | 'open' | 'done';
  /** Stay status for guest threads. Owner/vendor threads are 'na'. */
  stayStatus?: StayStatus;
  /** Linked reservation in `_data/reservations.ts:RESERVATIONS`. */
  reservationId?: string;
  /** Whether the current user is @mentioned in this thread. */
  mentionsMe?: boolean;
  messages?: InboxMessage[];
  summary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'urgent';
  language?: 'EN' | 'FR' | 'PT' | 'IT' | 'NL';
  whatsappWindow?: { open: boolean; expiresInMinutes?: number; expiresAt?: string };
  /** Reservation context bundled in the thread-detail response. Optional —
   *  list view doesn't carry it, only the detail fetch does. */
  reservation?: InboxReservation;
  /** AI drafts from GMS. Detail view only (list doesn't carry them).
   *  Most-recent-first; DraftPanel renders the first one with state in
   *  {draft_ready, under_review}. */
  drafts?: InboxDraft[];
  /** Channel options for outbound send, from the detail bundle. Used by
   *  the send confirmation modal's channel selector. */
  availableChannels?: string[];
  /** Recommended channel for the next outbound message — usually matches
   *  the inbound channel unless the WA window is closed. */
  recommendedChannel?: string;
  /** Latest draft state — convenience field also surfaced on list rows
   *  (the list response returns this without bundling the full drafts
   *  array). Powers the Review tab filter. */
  latestDraftState?: DraftState;
  /** Latest draft confidence (0..1) — surfaced on list rows for the
   *  confidence pill in the list item. */
  latestDraftConfidence?: number;
}

/** Reservation detail flattened from GMS's bundled response. Only the fields
 *  the Inbox right panel needs are surfaced; the full Guesty reservation has
 *  many more, fetched on-demand from the Reservations module. */
export interface InboxReservation {
  id: string;
  guestyReservationId?: string;
  listingName?: string;
  status?: string;
  channel?: string;
  checkIn?: string;
  checkOut?: string;
  numberOfNights?: number;
  numGuests?: number;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  totalPrice?: number;
  currency?: string;
  cleaningFee?: number;
  nightlyRate?: number;
  specialRequests?: string;
}

// fixture data purged 2026-05-13 (design-be-19); inbox should render real
// GMS data only — see Tier E roadmap items bw-7/bw-8/bw-9. Live data
// flows through useLiveConversations()/useThreadDetail() in inboxClient.ts.
export const INBOX_THREADS: InboxThread[] = [];

// fixture data purged 2026-05-13 (design-be-19); inbox should render real
// GMS data only — see Tier E roadmap items bw-7/bw-8/bw-9. Internal notes
// will be wired through POST /api/inbox/threads/:id/notes (see comment in
// InboxModule.tsx::InternalNoteCompose).
export const INBOX_INTERNAL_NOTES: InternalNote[] = [];

export const INBOX_CHANNEL_TREE = {
  guest: [
    { key: 'airbnb' as InboxChannel, label: 'Airbnb' },
    { key: 'booking' as InboxChannel, label: 'Booking.com' },
    { key: 'whatsapp' as InboxChannel, label: 'WhatsApp' },
    { key: 'email' as InboxChannel, label: 'Email' },
  ],
  owner: [
    { key: 'owner_email' as InboxChannel, label: 'Email' },
    { key: 'owner_whatsapp' as InboxChannel, label: 'WhatsApp' },
  ],
  vendor: [
    { key: 'vendor_breezeway' as InboxChannel, label: 'Breezeway' },
    { key: 'vendor_driver' as InboxChannel, label: 'Driver' },
    { key: 'vendor_chef' as InboxChannel, label: 'Chef' },
  ],
};

export interface Task {
  id: string;
  status: 'todo' | 'progress' | 'done' | 'overdue';
  urgency: 'red' | 'amber' | 'neutral';
  title: string;
  property: string;
  assignee: string;
  due: string;
  source: string;
  done?: boolean;
}

export const TASKS: Task[] = [
  { id: 'k1', status: 'overdue', urgency: 'red', title: 'Confirm transfer driver for Marchand arrival Thu 15:20', property: 'Villa Azur', assignee: 'Bryan', due: 'Yesterday', source: 'Inbox' },
  { id: 'k2', status: 'progress', urgency: 'amber', title: 'Refund €180 tourist tax overcharge — Fonseca booking', property: 'Sable Noir', assignee: 'Mary', due: 'Today', source: 'Finance' },
  { id: 'k3', status: 'todo', urgency: 'amber', title: 'Pool pump replacement — parts arriving Wed', property: 'Blue Bay House', assignee: 'Alex', due: 'Today', source: 'Breezeway' },
  { id: 'k4', status: 'todo', urgency: 'neutral', title: 'Draft Airbnb reply for Linde chef menu question', property: 'Blue Bay House', assignee: 'Franny', due: 'Today', source: 'Inbox' },
  { id: 'k5', status: 'progress', urgency: 'neutral', title: 'Update owner statement template — May run', property: 'All', assignee: 'Mary', due: 'Tomorrow', source: 'Finance' },
  { id: 'k6', status: 'todo', urgency: 'neutral', title: 'Quarterly Breezeway cleaner rate review', property: 'All', assignee: 'Franny', due: 'Fri', source: 'Ops' },
  { id: 'k7', status: 'todo', urgency: 'neutral', title: 'Nitzana onboarding — collect property docs', property: 'Nitzana', assignee: 'Ishant', due: 'Mon', source: 'CRM' },
  { id: 'k8', status: 'done', urgency: 'neutral', title: 'Welcome pack delivered to Okonkwo party', property: 'Sable Noir', assignee: 'Bryan', due: 'Wed', source: 'Inbox', done: true },
  { id: 'k9', status: 'todo', urgency: 'neutral', title: 'Review Q1 occupancy report with Mathias', property: '—', assignee: 'Ishant', due: 'Next wk', source: 'Intel' },
];

// Legacy `Property` / `PROPERTIES` / `PROP_TABS` removed. Canonical Property
// namespace lives at `_data/properties.ts` (v0.2 LOCKED).

export interface KPI {
  label: string;
  value: string;
  sub: string;
  dir: 'up' | 'down' | null;
}

// @demo:data — Tag: PROD-DATA-44 — see frontend/DEMO_CRUFT.md
//   Legacy demo cluster: FIN_KPIS / FIN_TX / OPS_CLEANS / OPS_TICKETS /
//   LEGAL_CONTRACTS / OWNERS — all consumed only by StubModules.tsx (the
//   pre-Coming-Soon stub modules). Replace each with its respective real API
//   when those modules ship.
export const FIN_KPIS: KPI[] = [
  { label: 'Revenue MTD', value: '€ 184,220', sub: '+12% vs Apr LM', dir: 'up' },
  { label: 'Outstanding payouts', value: '€ 42,960', sub: '6 owners', dir: null },
  { label: 'Tourist tax owed', value: '€ 3,140', sub: 'Apr filing due May 7', dir: null },
  { label: 'Refunds processed', value: '€ 1,880', sub: '3 this month', dir: null },
];

export const FIN_TX = [
  { desc: 'Airbnb payout — Mar batch 2', meta: 'settled Apr 18 · ref AXB-8821', amount: '+€ 48,220' },
  { desc: 'Booking.com payout — Apr wk 2', meta: 'settled Apr 17 · ref BKG-2210', amount: '+€ 31,504' },
  { desc: 'Refund — Fonseca tourist tax overcharge', meta: 'processed Apr 16 · Mary', amount: '−€ 180' },
  { desc: 'Breezeway — April cleaner run', meta: 'due Apr 25 · invoice 4421', amount: '−€ 4,320' },
  { desc: 'Owner statement — Nitzana Estate', meta: 'pending release May 3', amount: '−€ 28,440' },
  { desc: 'Direct booking — Marchand (Thu)', meta: 'captured Apr 15 · VAZ', amount: '+€ 2,850' },
];

export const OPS_CLEANS = [
  { prop: 'Villa Azur', time: '10:00', status: 'in-progress', cleaner: 'Priya · Breezeway' },
  { prop: 'Blue Bay House', time: '11:30', status: 'scheduled', cleaner: 'Renuka · Breezeway' },
  { prop: 'Sable Noir', time: '12:00', status: 'scheduled', cleaner: 'Vimla · Breezeway' },
  { prop: 'La Casa Palm', time: '14:00', status: 'scheduled', cleaner: 'Priya · Breezeway' },
  { prop: 'Coral Reef Bungalow', time: '15:30', status: 'scheduled', cleaner: 'TBD' },
];

export const OPS_TICKETS = [
  { prop: 'Blue Bay House', title: 'Pool pump intermittent — parts arriving Wed', urgency: 'red' as const },
  { prop: 'Villa Azur', title: 'Guest reports AC noisy in master bedroom', urgency: 'amber' as const },
  { prop: 'Serenity Point', title: 'Replace entry mat — worn', urgency: 'neutral' as const },
  { prop: 'Domaine Tamassa', title: 'Schedule gardener — monthly', urgency: 'neutral' as const },
];

export const LEGAL_CONTRACTS = [
  { kind: 'Owner agreement', party: 'Nitzana Holdings SA', status: 'active', ends: 'Mar 2028' },
  { kind: 'Owner agreement', party: 'Beaumont Family Trust', status: 'active', ends: 'Nov 2026' },
  { kind: 'Property management', party: 'Blue Bay House · Harrington', status: 'renewal due', ends: 'May 2026' },
  { kind: 'Vendor — Breezeway', party: 'Breezeway Housekeeping Ltd', status: 'active', ends: 'Dec 2026' },
  { kind: 'Vendor — PM Grocery', party: 'Plein Sud Épicerie', status: 'draft', ends: '—' },
];

export const OWNERS = [
  { name: 'Nitzana Holdings SA', props: 1, ytd: '€ 142,500', next: 'May 3', status: 'current' },
  { name: 'Beaumont Family Trust', props: 2, ytd: '€ 88,200', next: 'May 3', status: 'current' },
  { name: 'Harrington, D.', props: 1, ytd: '€ 51,600', next: 'May 3', status: 'renewal' },
  { name: 'Chen, Y.', props: 1, ytd: '€ 34,100', next: 'May 3', status: 'current' },
  { name: 'Mauritius Coastal Ltd', props: 2, ytd: '€ 77,900', next: 'May 3', status: 'current' },
];

export interface CalEvent {
  /** Day index within the currently-visible window. Assigned at synthesis time. */
  day: number;
  /** Hour 0-23, or -1 if `allDay` is true (event has no specific time). */
  start: number;
  end: number;
  type: 'checkin' | 'checkout' | 'maint' | 'meeting' | 'task';
  title: string;
  /** No specific time — render in the all-day strip / "All day" group. */
  allDay?: boolean;
}

/** Static maintenance + meeting events keyed by absolute date so they survive
 *  calendar navigation. Check-in / check-out come from `_data/reservations.ts:RESERVATIONS`;
 *  task events come from `_data/tasks.ts:TASKS`. */
export interface FixedCalEvent {
  isoDate: string;
  start: number;
  end: number;
  type: 'maint' | 'meeting';
  title: string;
}

// @demo:data — Tag: PROD-DATA-30 — see frontend/DEMO_CRUFT.md
export const CAL_EVENTS: FixedCalEvent[] = [
  { isoDate: '2026-04-27', start: 11, end: 12, type: 'maint', title: 'Pool service · BBH' },
  { isoDate: '2026-04-28', start: 9, end: 10, type: 'meeting', title: 'Ops stand-up' },
  { isoDate: '2026-04-29', start: 10, end: 11, type: 'maint', title: 'Pump parts install · BBH' },
  { isoDate: '2026-04-29', start: 16, end: 17, type: 'meeting', title: 'Mary handover' },
  { isoDate: '2026-04-30', start: 15, end: 16, type: 'maint', title: 'Gardener · DMT' },
  { isoDate: '2026-05-01', start: 14, end: 15, type: 'meeting', title: 'Owner call · Nitzana' },
  { isoDate: '2026-05-03', start: 11, end: 12, type: 'maint', title: 'Deep clean · OCT' },
];

/* ───── Extended fixtures (tier-2 detail views) ───── */

export interface TaskDetail {
  description: string;
  links: { kind: string; label: string }[];
  comments: { who: string; time: string; body: string }[];
  activity: { time: string; text: string }[];
}

export const TASK_DETAIL: Record<string, TaskDetail> = {
  k1: {
    description:
      'Guest Thibault Marchand arrives Thursday 15:20 at SSR/Plaisance on MK 47 from Paris. Need to confirm driver + early check-in at Villa Azur. Family of 4, 2 young kids.',
    links: [
      { kind: 'Inbox thread', label: 'Marchand · Airbnb' },
      { kind: 'Reservation', label: 'VAZ-APR17' },
    ],
    comments: [
      { who: 'Ishant', time: 'Wed 16:40', body: 'Driver list from Plein Sud — Kamlesh unavailable. Asked Ravi to cover.' },
      { who: 'Bryan', time: 'Wed 17:12', body: 'Ravi confirmed verbally. Need written confirmation before 09:00 tomorrow.' },
    ],
    activity: [
      { time: 'Wed 08:14', text: 'Created from Inbox thread · Marchand' },
      { time: 'Wed 16:40', text: 'Assigned to Bryan · due yesterday' },
      { time: 'Thu 06:00', text: 'Marked overdue' },
    ],
  },
};

// @demo:data — Tag: PROD-DATA-48 — see frontend/DEMO_CRUFT.md
//   covers LEGAL_RENEWALS + LEGAL_LICENSES + LEGAL_COMPLIANCE + LEGAL_DOCS
//   (Legal & Admin module: renewals, licenses, compliance calendar, document store)
export const LEGAL_RENEWALS = [
  { party: 'Blue Bay House · Harrington', kind: 'Management agreement', ends: 'May 2026', action: 'draft renewal' },
  { party: 'Fonseca vendor (groceries)', kind: 'Annual supply', ends: 'Jun 2026', action: 'review T&Cs' },
  { party: 'Beaumont Trust · 2 props', kind: 'Owner agreement', ends: 'Nov 2026', action: 'plan outreach' },
];

export const LEGAL_LICENSES = [
  { name: 'Tourist Authority — classification', holder: 'Friday Retreats Ltd', ends: 'Oct 2026', status: 'active' },
  { name: 'Trade license (Port Louis)', holder: 'Friday Retreats Ltd', ends: 'Jun 2026', status: 'renewal due' },
  { name: 'VAT registration', holder: 'Friday Retreats Ltd', ends: '—', status: 'active' },
  { name: 'Tourism Fund levy registration', holder: 'Friday Retreats Ltd', ends: '—', status: 'active' },
];

export const LEGAL_COMPLIANCE = [
  { item: 'Tourist tax · Apr filing', due: 'May 7', owner: 'Mary', kind: 'Tax', status: 'open' },
  { item: 'Trade license renewal', due: 'Jun 30', owner: 'Mary', kind: 'License', status: 'open' },
  { item: 'MRA VAT return · Q2', due: 'Jul 20', owner: 'Mary', kind: 'Tax', status: 'open' },
  { item: 'PDPA data audit', due: 'Sep 15', owner: 'Ishant', kind: 'Privacy', status: 'scheduled' },
  { item: 'Owner K-1 statements · FY25', due: 'Apr 1', owner: 'Mary', kind: 'Reporting', status: 'done' },
];

export const FIN_PAYOUTS = [
  { id: 'p1', channel: 'Airbnb', period: 'Apr wk 2', amount: 48220, status: 'settled', date: 'Apr 18', ref: 'AXB-8821' },
  { id: 'p2', channel: 'Booking.com', period: 'Apr wk 2', amount: 31504, status: 'settled', date: 'Apr 17', ref: 'BKG-2210' },
  { id: 'p3', channel: 'Airbnb', period: 'Apr wk 3', amount: 38120, status: 'pending', date: 'Apr 25', ref: 'AXB-8822' },
  { id: 'p4', channel: 'Stripe', period: 'Apr wk 3', amount: 12680, status: 'pending', date: 'Apr 23', ref: 'STR-041' },
  { id: 'p5', channel: 'Booking.com', period: 'Apr wk 3', amount: 22840, status: 'pending', date: 'Apr 24', ref: 'BKG-2211' },
  { id: 'p6', channel: 'VRBO', period: 'Apr wk 2', amount: 8450, status: 'settled', date: 'Apr 19', ref: 'VR-334' },
];

export const FIN_REFUNDS = [
  { id: 'r1', guest: 'Fonseca', reason: 'Tourist tax overcharge', amount: 180, date: 'Apr 16', by: 'Mary', status: 'processed' },
  { id: 'r2', guest: 'Nguyen', reason: 'Early checkout — goodwill credit', amount: 1200, date: 'Apr 9', by: 'Mary', status: 'processed' },
  { id: 'r3', guest: 'Ito', reason: 'Cleaning fee adjustment', amount: 500, date: 'Apr 3', by: 'Mary', status: 'processed' },
  { id: 'r4', guest: 'Kalinski', reason: 'Plumbing disruption comp', amount: 320, date: 'Apr 22', by: 'Franny', status: 'pending' },
];

export const TOURIST_TAX = [
  { month: 'Jan', collected: 2860, refunded: 0, owed: 2860, filed: true, filedAt: 'Feb 6' },
  { month: 'Feb', collected: 3210, refunded: 120, owed: 3090, filed: true, filedAt: 'Mar 5' },
  { month: 'Mar', collected: 3480, refunded: 0, owed: 3480, filed: true, filedAt: 'Apr 2' },
  { month: 'Apr', collected: 3320, refunded: 180, owed: 3140, filed: false, filedAt: null },
];

export const OWNER_STATEMENTS = [
  { owner: 'Nitzana Holdings SA', period: 'Apr 2026', gross: 38400, fees: 9960, net: 28440, status: 'ready' },
  { owner: 'Beaumont Family Trust', period: 'Apr 2026', gross: 22100, fees: 5746, net: 16354, status: 'ready' },
  { owner: 'Harrington, D.', period: 'Apr 2026', gross: 14200, fees: 3692, net: 10508, status: 'ready' },
  { owner: 'Chen, Y.', period: 'Apr 2026', gross: 9400, fees: 2444, net: 6956, status: 'draft' },
  { owner: 'Mauritius Coastal Ltd', period: 'Apr 2026', gross: 21300, fees: 5538, net: 15762, status: 'draft' },
];

export const OPS_WEEK = [
  { day: 'Mon', cleans: 3, maint: 1 },
  { day: 'Tue', cleans: 5, maint: 2 },
  { day: 'Wed', cleans: 4, maint: 3 },
  { day: 'Thu', cleans: 5, maint: 1, today: true },
  { day: 'Fri', cleans: 6, maint: 0 },
  { day: 'Sat', cleans: 4, maint: 1 },
  { day: 'Sun', cleans: 2, maint: 0 },
];

export const OPS_ROSTER = [
  { name: 'Priya', role: 'Housekeeping lead', props: ['VAZ', 'LCA'], today: 2, week: 9, status: 'on-duty' },
  { name: 'Renuka', role: 'Housekeeping', props: ['BBH', 'SRT'], today: 1, week: 8, status: 'on-duty' },
  { name: 'Vimla', role: 'Housekeeping', props: ['SBN', 'DMT'], today: 1, week: 7, status: 'on-duty' },
  { name: 'Alex', role: 'Maintenance', props: ['All'], today: 2, week: 6, status: 'on-duty' },
  { name: 'Bryan', role: 'Field ops', props: ['All'], today: 3, week: 14, status: 'on-duty' },
  { name: 'Chef Aarav', role: 'Private chef (on-call)', props: ['BBH', 'VAZ'], today: 0, week: 2, status: 'off' },
  { name: 'Ravi', role: 'Driver (on-call)', props: ['All'], today: 1, week: 4, status: 'on-duty' },
];

export const LEGAL_DOCS = [
  { name: 'Villa Azur · title deed.pdf', kind: 'Title', size: '4.2 MB' },
  { name: 'Nitzana · owner agreement v3.pdf', kind: 'Contract', size: '890 KB' },
  { name: 'Breezeway · MSA 2026.pdf', kind: 'Vendor', size: '320 KB' },
  { name: 'Blue Bay · insurance certificate.pdf', kind: 'Insurance', size: '1.1 MB' },
  { name: 'MRA · VAT registration.pdf', kind: 'License', size: '210 KB' },
  { name: 'Tourism Authority · classification cert.pdf', kind: 'License', size: '480 KB' },
];

/**
 * Calendar week — Mon 2026-04-27 → Sun 2026-05-03. Mon is today.
 * Indices map to `CalEvent.day` (0 = Mon).
 */
export const CAL_DAYS = [
  { label: 'Mon', date: '27', today: true, isoDate: '2026-04-27' },
  { label: 'Tue', date: '28', today: false, isoDate: '2026-04-28' },
  { label: 'Wed', date: '29', today: false, isoDate: '2026-04-29' },
  { label: 'Thu', date: '30', today: false, isoDate: '2026-04-30' },
  { label: 'Fri', date: '01', today: false, isoDate: '2026-05-01' },
  { label: 'Sat', date: '02', today: false, isoDate: '2026-05-02' },
  { label: 'Sun', date: '03', today: false, isoDate: '2026-05-03' },
];
