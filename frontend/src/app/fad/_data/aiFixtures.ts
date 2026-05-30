// @demo:data — AI inference context — depends on AI integration shape
// Tag: PROD-DATA-15 — see frontend/DEMO_CRUFT.md

// AI fixture pools — Phase 1 stand-in for LLM responses.
// Each surface has a pool of 3-5 responses; selection is deterministic-but-varied
// by hour-of-day so reloads in the same hour show the same response, next hour
// shows different one. Phase 2 swaps these pools for real LLM calls.

export const DAILY_BRIEF_POOL: string[] = [
  '4 urgent today, 2 escalating. RC-15 cleaning at risk because guest checks in at 14:00 and access code is missing. LB-2 AC fix tracking on schedule (parts ETA 14:00).',
  'Quiet morning. 1 overdue maintenance at LB-2 needs Bryan\'s attention. 3 cleans on schedule. Owner walkthrough VV-47 confirmed for Saturday.',
  'Heavy day ahead — 12 tasks queued. Bryan covering north (4 maintenance jobs, 1 inspection). Catherine covering scheduled cleans with Ishant as west backup. Mary on linen station setup.',
  'Reservation churn: 3 checkouts today, 2 check-ins tomorrow. Cleaning + inspection scheduled, all on track. RC-15 welcome basket missing chocolates — Catherine flagged.',
  'Issue spike from inbox: 4 reports received in last 6 hours. 2 auto-triaged to maintenance, 2 awaiting your review in Reported Issues. LV-10 sulphur smell looks like dry trap, easy fix.',
];

export const RISK_FLAG_EXPLANATIONS: Record<string, string[]> = {
  overdue: [
    'Task due Apr 25, no progress logged since Apr 23. Last activity: Bryan set status to In Progress on Apr 23. Recommend: ping Bryan or reassign.',
    'Past due date by 5 days. Mathias on leave Mon-Tue per roster, suggest reassigning to Bryan who has north-zone capacity Wed.',
    'Task created Apr 15, due Apr 22, now 5 days late. Open scope change request on file — possibly blocking. Review approval queue.',
  ],
  no_progress: [
    'Task in "in_progress" status since Apr 23 with no comments or activity. Suggests blockage. Consider 1:1 sync with assignee.',
    'Status changed to paused 32 minutes ago without explanation. Likely waiting on external input (vendor quote, owner approval, etc.).',
  ],
  blocked_access: [
    'Comment thread mentions "no access code received" on Apr 26. Property profile shows no access code set. Recommend: contact owner before re-attempting.',
    'Field PM noted gate keypad battery dead. Replacement scheduled, but task currently un-actionable until fix complete.',
  ],
  over_time: [
    'Spent 144 min vs estimated 30 min — 4.8× over estimate. Likely a chase scenario (e.g., collecting payment, vendor follow-up). Consider adding @Ishant for escalation.',
    'Time-tracking shows 220 min on a task budgeted at 90. Worth reviewing requirements list — scope may have grown silently.',
  ],
  unassigned: [
    'AI-drafted task awaiting human assignment. Default suggested assignee not available this week — please pick replacement.',
    'No one currently assigned. Inbox source thread suggests guest is awaiting reply — recommend immediate triage.',
  ],
  reservation_imminent: [
    'Linked reservation checks in within 4h. Cleaning task must close by 60 min before check-in. If at risk, escalate or pull in standby staff.',
    'Guest arrival in < 24h. Pre-arrival inspection blocking. If not started by EOD, reservation team will need to pivot.',
  ],
};

export const ROSTER_DRAFT_RATIONALES: string[] = [
  'Bryan kept maintenance-first this week — 7 maintenance jobs at GBH-* + PT-3. Catherine handles cleaning/inspection blocks with Ishant as west backup. Mathias Mon-Fri only (no weekends per contract).',
  'Heavy west week — Catherine is flexed into scheduled cleans, with Ishant covering car/procurement gaps and Mary off Wed (childcare day). Bryan single standby Wed when work mix is lightest.',
  'Quiet week for cleans, heavier on inspections. Catherine + Bryan cover inspections cluster; Bryan covers maintenance on north. Mathias focused on guest-facing tasks Mon-Fri.',
];

/** Hour-of-day deterministic pool selector. Same hour → same pick. */
export function pickFromPool<T>(pool: T[], seed?: number): T {
  if (pool.length === 0) throw new Error('Empty AI fixture pool');
  const s = seed ?? new Date().getHours();
  return pool[s % pool.length];
}

/** Pick a random *different* index from the previously shown one. Used by Regenerate. */
export function pickDifferent<T>(pool: T[], previousIndex: number): { value: T; index: number } {
  if (pool.length <= 1) return { value: pool[0], index: 0 };
  let next = previousIndex;
  while (next === previousIndex) {
    next = Math.floor(Math.random() * pool.length);
  }
  return { value: pool[next], index: next };
}
