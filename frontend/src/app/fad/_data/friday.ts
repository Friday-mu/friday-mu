// @demo:data — Friday-the-AI cards + prompts — GET /api/friday/*
// Tag: PROD-DATA-13 — see frontend/DEMO_CRUFT.md

import type { Resource } from './permissions';

export interface FridayStep {
  type: 'tool';
  name: string;
  args: string;
  ms: number;
}

export type FridayCard =
  | { type: 'action'; urgency: 'red' | 'amber' | 'neutral' | 'accent'; module: string; title: string; body: string; cta: string }
  | {
      type: 'tourist-tax-breakdown';
      period: string;
      rows: { label: string; value: number; negative?: boolean }[];
      total: { label: string; value: number };
      footer: string;
    }
  | {
      type: 'owner-pl';
      owner: string;
      gross: number;
      fees: number;
      net: number;
      months: { m: string; v: number; partial?: boolean }[];
    }
  | {
      type: 'checkins';
      rows: { day: string; date: string; guest: string; prop: string; flag?: string }[];
    }
  | {
      type: 'draft-reply';
      channel: string;
      guest: string;
      body: string;
      honors: string[];
    }
  | { type: 'bars'; rows: { label: string; pct: number; count: number }[] };

export interface FridayReply {
  text: string;
  cards: FridayCard[];
  followups: string[];
}

export interface FridayScript {
  match: (q: string) => boolean;
  /** Permission resource required before this scripted answer may disclose data. */
  resource?: Resource;
  steps: FridayStep[];
  reply: FridayReply;
}

export const FRIDAY_SCRIPTS: FridayScript[] = [
  {
    match: (q) => /attention|today|priority|triage|urgent/i.test(q),
    steps: [
      { type: 'tool', name: 'search.inbox', args: 'unread, urgency≥amber', ms: 400 },
      { type: 'tool', name: 'search.tasks', args: 'status=overdue OR due:today', ms: 450 },
      { type: 'tool', name: 'search.finance', args: 'pending this week', ms: 350 },
    ],
    reply: {
      text: 'Three things need your attention today.',
      cards: [
        {
          type: 'action',
          urgency: 'red',
          module: 'inbox',
          title: 'Marchand transfer not confirmed',
          body: 'Arrives Thu 15:20 at SSR. Driver verbal but not written. Bryan owns.',
          cta: 'Open thread',
        },
        {
          type: 'action',
          urgency: 'amber',
          module: 'operations',
          title: 'Blue Bay pool pump',
          body: 'Parts arriving Wed. Alex booked. No guest impact if installed before Fri checkin.',
          cta: 'Open ticket',
        },
        {
          type: 'action',
          urgency: 'amber',
          module: 'finance',
          title: 'Fonseca refund ready',
          body: '€180 tourist tax overcharge. Mary flagged — ready to process.',
          cta: 'Open Finance',
        },
      ],
      followups: [
        'Draft the Marchand reply',
        'Walk me through the pool pump situation',
        'Process the Fonseca refund',
      ],
    },
  },
  {
    match: (q) => /tourist tax|mra/i.test(q),
    resource: 'finance',
    steps: [
      { type: 'tool', name: 'query.finance', args: 'table=tourist_tax, period=Apr 2026', ms: 380 },
      { type: 'tool', name: 'compute.net', args: 'collected - refunded', ms: 200 },
    ],
    reply: {
      text: 'April collection is €3,320 against €180 refunded — so €3,140 owed. Filing is due May 7.',
      cards: [
        {
          type: 'tourist-tax-breakdown',
          period: 'Apr 2026',
          rows: [
            { label: 'Collected', value: 3320 },
            { label: 'Refunded', value: 180, negative: true },
          ],
          total: { label: 'Owed', value: 3140 },
          footer: 'Filing due May 7 · owner: Mary',
        },
      ],
      followups: [
        'Show YTD tourist tax by month',
        'Who refunded Fonseca and why?',
        'Open Finance → Tourist tax',
      ],
    },
  },
  {
    match: (q) => /nitzana|ytd|owner statement/i.test(q),
    resource: 'owners',
    steps: [
      { type: 'tool', name: 'search.owners', args: "name~'Nitzana'", ms: 280 },
      { type: 'tool', name: 'query.finance', args: 'payouts WHERE owner=Nitzana, ytd=2026', ms: 420 },
    ],
    reply: {
      text: 'Nitzana Holdings SA · YTD 2026. Soft-launch phase — calendar opens fully in May.',
      cards: [
        {
          type: 'owner-pl',
          owner: 'Nitzana Holdings SA',
          gross: 198400,
          fees: 55900,
          net: 142500,
          months: [
            { m: 'Jan', v: 28400 },
            { m: 'Feb', v: 33200 },
            { m: 'Mar', v: 41900 },
            { m: 'Apr', v: 38900, partial: true },
          ],
        },
      ],
      followups: [
        'Compare Nitzana to other premium owners',
        'Show Apr statement detail',
        'Who else is on the May statement run?',
      ],
    },
  },
  {
    match: (q) => /check.?in|arriving|this week|who's coming/i.test(q),
    resource: 'reservations',
    steps: [
      { type: 'tool', name: 'query.calendar', args: 'range=Apr 14..20, type=checkin', ms: 300 },
      { type: 'tool', name: 'enrich.guests', args: 'profile lookups', ms: 220 },
    ],
    reply: {
      text: 'Five check-ins this week. One returning guest (Marchand · 2nd stay).',
      cards: [
        {
          type: 'checkins',
          rows: [
            { day: 'Thu', date: 'Apr 17', guest: 'Marchand', prop: 'VAZ', flag: 'returning' },
            { day: 'Thu', date: 'Apr 17', guest: 'Linde', prop: 'BBH' },
            { day: 'Fri', date: 'Apr 18', guest: 'Beaumont', prop: 'SBN' },
            { day: 'Sat', date: 'Apr 19', guest: 'Chen', prop: 'LCA' },
            { day: 'Sun', date: 'Apr 20', guest: 'Okonkwo', prop: 'DMT' },
          ],
        },
      ],
      followups: ['Any unconfirmed transfers?', 'Show me only returning guests', 'Open Calendar'],
    },
  },
  {
    match: (q) => /draft.*repl|reply|marchand/i.test(q),
    resource: 'inbox_guest',
    steps: [
      { type: 'tool', name: 'read.thread', args: 'Marchand · Airbnb', ms: 260 },
      { type: 'tool', name: 'read.guest', args: 'Marchand profile · FR, 2nd stay', ms: 180 },
      { type: 'tool', name: 'read.brand-voice', args: 'Friday tone guide', ms: 160 },
    ],
    reply: {
      text: 'Drafted in your voice — warm, specific, one-action. Review and send.',
      cards: [
        {
          type: 'draft-reply',
          channel: 'Airbnb',
          guest: 'Thibault Marchand',
          body:
            "Bonjour Thibault,\n\nAll set for Thursday. Ravi will meet you at SSR arrivals at 15:20 with a Friday sign — he'll have a cold drink ready for the kids. We've also arranged 14:30 early check-in at Villa Azur, so you can settle straight in.\n\nYour welcome hamper is already in the fridge. Anything else you'd like waiting for you?\n\nÀ tout bientôt,\nFriday team",
          honors: ['French greeting (guest language)', 'Specific driver name', 'Acknowledges the kids'],
        },
      ],
      followups: ['Make it shorter', 'Send as-is', 'Switch to English'],
    },
  },
  {
    match: (q) => /occupancy|north|south|compare/i.test(q),
    resource: 'owners',
    steps: [{ type: 'tool', name: 'query.intelligence', args: 'occ, GROUP BY area, period=MTD', ms: 420 }],
    reply: {
      text: 'South is leading at 84% MTD; North is 76%. Blue Bay House (South) is the single driver of the gap.',
      cards: [
        {
          type: 'bars',
          rows: [
            { label: 'South', pct: 0.84, count: 3 },
            { label: 'West', pct: 0.8, count: 3 },
            { label: 'North', pct: 0.76, count: 3 },
          ],
        },
      ],
      followups: [
        'Break down by property',
        'What drove the North softness?',
        'Open Intelligence',
      ],
    },
  },
];

export const DEFAULT_REPLY: { resource?: Resource; steps: FridayStep[]; reply: FridayReply } = {
  steps: [{ type: 'tool', name: 'search.modules', args: 'scanning all', ms: 300 }],
  reply: {
    text: 'This demo ships with scripted responses — try one of the suggestions below to see Friday work through the modules available to your role.',
    cards: [],
    followups: [
      'What needs my attention today?',
      "Who's checking in this week?",
      'Any overdue tasks?',
    ],
  },
};

export function pickScript(q: string) {
  return FRIDAY_SCRIPTS.find((s) => s.match(q)) || DEFAULT_REPLY;
}

export const FRIDAY_PROMPTS_HOME = [
  {
    cat: 'Today',
    prompts: [
      'What needs my attention today?',
      "Who's checking in this week?",
      'Any overdue tasks?',
    ],
  },
  {
    cat: 'Finance',
    prompts: [
      'How much tourist tax do we owe for April?',
      'Show Nitzana YTD payouts',
      'List all pending refunds',
    ],
  },
  {
    cat: 'Guests',
    prompts: [
      'Draft a warm reply to Marchand about his transfer',
      'Any returning guests arriving this week?',
      'Summarize Villa Azur reviews this month',
    ],
  },
  {
    cat: 'Ops',
    prompts: [
      "What's the Breezeway roster for today?",
      'Any urgent maintenance across the portfolio?',
      'Compare occupancy: North vs South this month',
    ],
  },
];
