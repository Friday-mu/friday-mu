// @demo:data — GMS conversations — verify mock vs. real GMS backend
// Tag: PROD-DATA-8 — see frontend/DEMO_CRUFT.md

export interface Teaching {
  id: string;
  instruction: string;
  scope: { kind: 'global' | 'property' | 'property_group'; targets?: string[] };
  channel: 'any' | 'airbnb' | 'booking' | 'whatsapp' | 'email';
  source: 'manual' | 'auto_pattern' | 'approved_reply';
  status: 'active' | 'draft' | 'retired';
  taughtBy: string;
  age: string;
  applications: number;
}

export const TEACHINGS: Teaching[] = [
  {
    id: 't1',
    instruction:
      'For Nitzana properties, always confirm pool heating schedule in the first reply — owners charge separately and want guests to know.',
    scope: { kind: 'property_group', targets: ['NTZ-04', 'NTZ-12', 'NTZ-19'] },
    channel: 'any',
    source: 'manual',
    status: 'active',
    taughtBy: 'Mathias',
    age: '14d ago',
    applications: 6,
  },
  {
    id: 't2',
    instruction:
      'Open guest replies with "Bonjour [name]" when the booking language is FR or guest name pattern suggests French.',
    scope: { kind: 'global' },
    channel: 'any',
    source: 'auto_pattern',
    status: 'active',
    taughtBy: 'system',
    age: '4d ago',
    applications: 23,
  },
  {
    id: 't3',
    instruction:
      'When confirming an early check-in, specify whether driver is included and the exact meet-point at SSR arrivals.',
    scope: { kind: 'global' },
    channel: 'any',
    source: 'approved_reply',
    status: 'active',
    taughtBy: 'Franny',
    age: '9d ago',
    applications: 11,
  },
  {
    id: 't4',
    instruction:
      'For WhatsApp replies outside business hours, never start with "I\'m checking on this" — jump straight to substance.',
    scope: { kind: 'global' },
    channel: 'whatsapp',
    source: 'auto_pattern',
    status: 'active',
    taughtBy: 'system',
    age: '2d ago',
    applications: 4,
  },
  {
    id: 't5',
    instruction:
      'Villa Azur: when guests mention kids, proactively offer the travel cot and highlight the low pool fence.',
    scope: { kind: 'property', targets: ['VAZ'] },
    channel: 'any',
    source: 'manual',
    status: 'active',
    taughtBy: 'Ishant',
    age: '28d ago',
    applications: 8,
  },
  {
    id: 't6',
    instruction:
      'Nitzana soft-launch: never quote a rate over €850/night without confirming with Mathias first.',
    scope: { kind: 'property_group', targets: ['NTZ-04', 'NTZ-12', 'NTZ-19'] },
    channel: 'any',
    source: 'manual',
    status: 'active',
    taughtBy: 'Mathias',
    age: '6d ago',
    applications: 2,
  },
  {
    id: 't7',
    instruction:
      'Stop saying "I will reach out to the team" — Ishant flagged this twice, it reads as deferral.',
    scope: { kind: 'global' },
    channel: 'any',
    source: 'auto_pattern',
    status: 'retired',
    taughtBy: 'system',
    age: '45d ago',
    applications: 0,
  },
];

export interface LearningCandidate {
  id: string;
  summary: string;
  evidence: { thread: string; edit: string }[];
  confidence: number;
  proposedBy: 'system';
  age: string;
  status: 'pending' | 'approved' | 'rejected';
}

export const LEARNING_QUEUE: LearningCandidate[] = [
  {
    id: 'c1',
    summary:
      'When a guest asks about cleaning frequency on a 7+ night stay, staff consistently reply with "mid-stay refresh on day 4 at no extra cost" — make this the default.',
    evidence: [
      { thread: 'Marchand · Apr 14', edit: 'Added mid-stay refresh note' },
      { thread: 'Linde · Apr 8', edit: 'Added mid-stay refresh note' },
      { thread: 'Okonkwo · Mar 31', edit: 'Added mid-stay refresh note' },
      { thread: 'Iyer · Mar 22', edit: 'Added mid-stay refresh note' },
    ],
    confidence: 0.92,
    proposedBy: 'system',
    age: '2d ago',
    status: 'pending',
  },
  {
    id: 'c2',
    summary:
      'Apologies to Booking.com guests are 40% shorter than apologies to Airbnb guests — possibly platform-appropriate; flagging for brand decision.',
    evidence: [
      { thread: 'Fonseca · Apr 13', edit: 'Shortened apology paragraph' },
      { thread: 'Bernard · Apr 8', edit: 'Shortened apology paragraph' },
    ],
    confidence: 0.71,
    proposedBy: 'system',
    age: '5d ago',
    status: 'pending',
  },
  {
    id: 'c3',
    summary:
      'When guests mention boat charter, reply within 30 minutes and always include the trusted vendor name (Captain Rajen).',
    evidence: [
      { thread: 'Ricci · Apr 5', edit: 'Added Captain Rajen contact' },
      { thread: 'Perrin · Mar 12', edit: 'Added Captain Rajen contact' },
      { thread: 'Bhaskar · Mar 2', edit: 'Added Captain Rajen contact' },
    ],
    confidence: 0.84,
    proposedBy: 'system',
    age: '11d ago',
    status: 'pending',
  },
  {
    id: 'c4',
    summary:
      'Franny\'s last 5 cleaning-complaint responses all include "we\'ve briefed the housekeeping lead" — extract as default apology frame.',
    evidence: [
      { thread: 'Solheim · Apr 11', edit: 'Template match' },
      { thread: 'Kalinski · Apr 22', edit: 'Template match' },
    ],
    confidence: 0.66,
    proposedBy: 'system',
    age: '1d ago',
    status: 'pending',
  },
];

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: 'Property' | 'Policy' | 'Brand' | 'Vendor' | 'Legal';
  body: string;
  lastUpdated: string;
  maintainer: string;
}

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'k1',
    title: 'Villa Azur · access + quirks',
    category: 'Property',
    body: 'Gate code rotates monthly. Pool heat on request (€40/day). Outdoor kitchen gas tank beside garage. Wi-Fi: "FridayVAZ_2024".',
    lastUpdated: 'Apr 12 · Ishant',
    maintainer: 'Ishant',
  },
  {
    id: 'k2',
    title: 'Check-in / check-out policy',
    category: 'Policy',
    body: 'Standard check-in 15:00, check-out 11:00. Early/late on request — always confirm with housekeeping before approving. No-shows: hold property 24h then release.',
    lastUpdated: 'Mar 28 · Mathias',
    maintainer: 'Mathias',
  },
  {
    id: 'k3',
    title: 'Tone guide — guest messaging',
    category: 'Brand',
    body: 'Warm, specific, one-action. Never corporate. Open with the guest\'s first name. End with "À tout bientôt, Friday team" (FR) or "Warmly, Friday team" (EN).',
    lastUpdated: 'Feb 14 · Ishant',
    maintainer: 'Ishant',
  },
  {
    id: 'k4',
    title: 'Breezeway escalation ladder',
    category: 'Vendor',
    body: 'Routine ticket: Bryan or Catherine within 4h. Urgent (guest-impacting): Franny + field lead within 30m. Safety issue: Ishant + 999/Police.',
    lastUpdated: 'Mar 14 · Franny',
    maintainer: 'Franny',
  },
  {
    id: 'k5',
    title: 'Tourist tax rates',
    category: 'Legal',
    body: '€18/night per adult for 3+ star classification. Collected on checkout, remitted monthly by the 7th to MRA.',
    lastUpdated: 'Apr 1 · Mary',
    maintainer: 'Mary',
  },
  {
    id: 'k6',
    title: 'Nitzana premium expectations',
    category: 'Property',
    body: 'Welcome hamper from local producers (Chamarel rum, Mahebourg spices). Daily fresh towels. Turn-down evening service. Private chef on 48h notice.',
    lastUpdated: 'Apr 6 · Mathias',
    maintainer: 'Mathias',
  },
];

// @demo:data — Tag: PROD-DATA-47 — see frontend/DEMO_CRUFT.md
//   covers BRAND_VOICE principles + good/bad examples + tones (Training · Brand voice tab)
export const BRAND_VOICE = {
  principles: [
    { title: 'Warm, not corporate', detail: 'Guests are at a villa on vacation. Drop the formal ladders. Use their first name.' },
    { title: 'Specific, not generic', detail: 'Don\'t say "the team will be in touch". Say "Ravi will meet you at 15:20 with a Friday sign".' },
    { title: 'One action per message', detail: 'Every reply closes with exactly one next step — not a menu of three options.' },
    { title: 'Voice follows language', detail: 'FR: open with "Bonjour". EN: open with first name only. Never mix.' },
  ],
  examples: {
    good: [
      'Bonjour Thibault — all set for Thursday. Ravi will meet you at SSR arrivals at 15:20 with a Friday sign. Anything else you\'d like waiting?',
      'Linde, the chef will prep a 4-course tasting for Saturday night at 19:30. Shall I lock that in?',
    ],
    bad: [
      'Dear valued guest, we have received your inquiry and our team will be in touch shortly with more information.',
      'Thank you for contacting Friday Retreats. We offer a variety of options for your stay. Please review the attached and let us know which works best.',
    ],
  },
  tones: [
    { situation: 'Confirmation / upbeat', tone: 'Warm and specific' },
    { situation: 'Apology / service recovery', tone: 'Own it, action it, move on' },
    { situation: 'Upsell (chef, boat, spa)', tone: 'Confident, one-line, easy yes/no' },
    { situation: 'Owner update', tone: 'Factual, numbered, no filler' },
  ],
};

export interface Automation {
  id: string;
  trigger: string;
  action: string;
  tier: 'auto' | 'internal' | 'external';
  confidence: number;
  active: boolean;
  lastFired: string;
  fires30d: number;
}

export interface LearningSource {
  id: string;
  time: string;
  origin: 'Inbox' | 'Tasks' | 'Owners' | 'Reviews' | 'Guests' | 'Finance' | 'Calendar' | 'System';
  action: string;
  teachingCreated?: string;
  teachingId?: string;
  staff?: string;
}

// @demo:data — Tag: PROD-DATA-45 — see frontend/DEMO_CRUFT.md
//   covers LEARNING_SOURCES + LEARNING_SOURCE_SUMMARY (Training · Sources tab)
export const LEARNING_SOURCES: LearningSource[] = [
  { id: 'ls1', time: '14m ago', origin: 'Inbox', action: 'Franny approved reply to Marchand with French greeting', teachingCreated: 'Open FR guest replies with "Bonjour"', teachingId: 't2', staff: 'Franny' },
  { id: 'ls2', time: '42m ago', origin: 'Inbox', action: 'Mathias rephrased compensation message, Friday noted pattern', staff: 'Mathias' },
  { id: 'ls3', time: '2h ago', origin: 'Tasks', action: 'Ishant tagged 4 similar tasks as "Breezeway-priority" consecutively', teachingCreated: 'Draft · Breezeway priority tag auto-applies to safety-issue tasks', staff: 'Ishant' },
  { id: 'ls4', time: '4h ago', origin: 'Owners', action: 'Mary added "statement questions" tag to Harrington thread', staff: 'Mary' },
  { id: 'ls5', time: '1d ago', origin: 'Reviews', action: 'Franny drafted 3 similar apology openings for service recovery', teachingCreated: 'Draft · Start apology replies with specific issue acknowledgment', staff: 'Franny' },
  { id: 'ls6', time: '1d ago', origin: 'Inbox', action: 'System detected 5 early-check-in confirmations all follow same structure', teachingCreated: 'Always state driver name + meet-point in early-check-in confirmations', teachingId: 't3', staff: 'system' },
  { id: 'ls7', time: '2d ago', origin: 'Tasks', action: 'Mathias created manual rule · Nitzana rate ceiling', teachingCreated: 'Never quote Nitzana rates over €850/night without approval', teachingId: 't6', staff: 'Mathias' },
  { id: 'ls8', time: '3d ago', origin: 'Guests', action: 'Friday detected VIP returning-guest pattern in Marchand preferences', staff: 'system' },
  { id: 'ls9', time: '5d ago', origin: 'System', action: 'Weekly pattern synthesis: WhatsApp outside-hours replies are terser', teachingCreated: 'WhatsApp outside-hours replies jump straight to substance', teachingId: 't4', staff: 'system' },
];

export const LEARNING_SOURCE_SUMMARY = [
  { origin: 'Inbox', count: 4, teachings: 2 },
  { origin: 'Tasks', count: 2, teachings: 1 },
  { origin: 'Reviews', count: 1, teachings: 1 },
  { origin: 'Owners', count: 1, teachings: 0 },
  { origin: 'Guests', count: 1, teachings: 0 },
  { origin: 'System', count: 1, teachings: 1 },
];

export interface StaffPerformance {
  name: string;
  role: string;
  conversations: number;
  firstDraftAcceptance: number;
  teachingsContributed: number;
  avgResponseTime: string;
  creditSpend: number;
}

// @demo:data — Tag: PROD-DATA-46 — see frontend/DEMO_CRUFT.md
//   covers STAFF_PERFORMANCE + PERFORMANCE_KPI (Training · Performance tab)
export const STAFF_PERFORMANCE: StaffPerformance[] = [
  { name: 'Ishant', role: 'Admin', conversations: 142, firstDraftAcceptance: 0.78, teachingsContributed: 8, avgResponseTime: '18m', creditSpend: 142 },
  { name: 'Mathias', role: 'Manager', conversations: 388, firstDraftAcceptance: 0.84, teachingsContributed: 6, avgResponseTime: '11m', creditSpend: 312 },
  { name: 'Franny', role: 'Manager', conversations: 412, firstDraftAcceptance: 0.82, teachingsContributed: 5, avgResponseTime: '9m', creditSpend: 296 },
  { name: 'Mary', role: 'Manager', conversations: 94, firstDraftAcceptance: 0.69, teachingsContributed: 2, avgResponseTime: '2h 14m', creditSpend: 58 },
  { name: 'Bryan', role: 'Contributor', conversations: 48, firstDraftAcceptance: 0.62, teachingsContributed: 1, avgResponseTime: '42m', creditSpend: 28 },
];

export const PERFORMANCE_KPI = [
  { label: 'Avg first-draft acceptance', value: '79%', sub: '+4pp vs Mar · target 85%' },
  { label: 'Teachings applied · 30d', value: '412', sub: 'across 9 properties' },
  { label: 'Active teachings', value: '12', sub: '2 drafts · 1 retired' },
  { label: 'Credits spent · 30d', value: '€ 48.20', sub: '€0.004 / conversation' },
];

export const AUTOMATIONS: Automation[] = [
  {
    id: 'a1',
    trigger: 'New guest message (any channel)',
    action: 'Auto-tag thread: urgency, channel, guest-language. Summarize one-line.',
    tier: 'auto',
    confidence: 0.95,
    active: true,
    lastFired: '6m ago',
    fires30d: 412,
  },
  {
    id: 'a2',
    trigger: 'Guest asks about check-in time',
    action: 'Draft reply with property\'s standard 15:00 + "let me know if you need earlier".',
    tier: 'external',
    confidence: 0.9,
    active: true,
    lastFired: '42m ago',
    fires30d: 68,
  },
  {
    id: 'a3',
    trigger: 'Guest message contains "broken", "leaking", "flooded", "fire", "emergency"',
    action: 'Flag URGENT on inbox, draft acknowledgment, create Breezeway task, notify Franny via Slack.',
    tier: 'internal',
    confidence: 0.97,
    active: true,
    lastFired: '2d ago',
    fires30d: 4,
  },
  {
    id: 'a4',
    trigger: 'Negative review posted (<4★)',
    action: 'Summary + sentiment flag. Draft owner notification. Draft public response.',
    tier: 'external',
    confidence: 0.88,
    active: true,
    lastFired: '5d ago',
    fires30d: 3,
  },
  {
    id: 'a5',
    trigger: 'Checkout today but no cleaning task assigned',
    action: 'Alert Operations. WhatsApp Breezeway lead with property + time.',
    tier: 'internal',
    confidence: 0.91,
    active: true,
    lastFired: '1d ago',
    fires30d: 7,
  },
  {
    id: 'a6',
    trigger: 'New website lead form submitted',
    action: 'Create contact + lead record. Pipeline from form tag. Round-robin assign.',
    tier: 'internal',
    confidence: 0.93,
    active: true,
    lastFired: '4h ago',
    fires30d: 18,
  },
  {
    id: 'a7',
    trigger: 'Guest message received 22:00–07:00 (local)',
    action: 'Hold draft until 08:00 unless urgency keywords present.',
    tier: 'auto',
    confidence: 0.9,
    active: true,
    lastFired: '9h ago',
    fires30d: 34,
  },
  {
    id: 'a8',
    trigger: 'Reservation cancelled',
    action: 'Update Calendar + Finance. Alert owner via email. Draft apology/rebook reply.',
    tier: 'external',
    confidence: 0.86,
    active: true,
    lastFired: '11d ago',
    fires30d: 2,
  },
  {
    id: 'a9',
    trigger: 'Owner statement month-end',
    action: 'Generate statement PDF. Draft cover email referencing YTD performance.',
    tier: 'external',
    confidence: 0.82,
    active: false,
    lastFired: 'never',
    fires30d: 0,
  },
];
