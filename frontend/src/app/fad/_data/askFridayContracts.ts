// Per-module Ask Friday contract registry — SPEC-Remaining §1.3.
//
// Each module's Ask Friday surface declares what it grounds in, what Friday may
// draft, which actions are approval-gated, and whether it cites sources. This is
// the FRONTEND half of AF4: modules pass `surfaceId` in the focus payload and
// render these as the "grounds in / can draft / gated" affordances. The backend
// already ENFORCES tool/action allowlists per surface (surface registry +
// merged validation PR) — this registry must stay a subset of that, never a
// superset. Mutations are approval-gated end-to-end (reservation/property tool
// contracts: writes go through `action_request` with `executionAllowed:false`).
//
// `surfaceId: null` = no published/draft context pack for this surface yet, so
// its Ask Friday renders draft/ungrounded (per the master-plan reconciliation:
// only Inbox/Ops/global have real packs today).
//
// Tag: PROD-AI-TRUST-1.

export interface AskFridayContract {
  /** Backend Ask Friday Core surface id, or null if no pack exists yet. */
  surfaceId: string | null;
  /** Entities / source systems this surface is grounded in. */
  groundsIn: string[];
  /** What Friday may draft here (never auto-commits). */
  canDraft: string[];
  /** Actions that require explicit operator approval before execution. */
  gatedActions: string[];
  /** Whether answers must cite their sources. */
  citations: boolean;
}

export const ASK_FRIDAY_CONTRACTS: Record<string, AskFridayContract> = {
  inbox: {
    surfaceId: 'fad_consult',
    groundsIn: ['guest threads', 'reservations', 'properties', 'saved replies'],
    canDraft: ['guest reply'],
    gatedActions: ['send message'],
    citations: true,
  },
  operations: {
    surfaceId: 'fad_ops_assistant',
    groundsIn: ['tasks', 'roster', 'availability', 'supplies'],
    canDraft: ['task note', 'assignment suggestion'],
    gatedActions: ['assign task', 'reschedule task'],
    citations: true,
  },
  reservations: {
    surfaceId: 'fad_reservations_calendar_assistant',
    groundsIn: ['guesty_reservations', 'fad_reservations', 'guesty_calendar'],
    canDraft: ['booking quote (draft)', 'reservation note'],
    // Per reservation/property tool contracts — all write through action_request.
    gatedActions: ['request_booking_quote', 'request_reservation_mutation', 'request_channel_visible_block'],
    citations: true,
  },
  calendar: {
    surfaceId: 'fad_reservations_calendar_assistant',
    groundsIn: ['guesty_calendar', 'fad_reservations'],
    canDraft: ['availability note'],
    gatedActions: ['request_channel_visible_block'],
    citations: true,
  },
  properties: {
    surfaceId: 'fad_properties_assistant',
    groundsIn: ['property facts (Guesty)', 'condition/ops (Breezeway)', 'reviews', 'guest history'],
    canDraft: ['property summary'],
    gatedActions: [],
    citations: true,
  },
  // Surfaces without a published/draft pack yet → render draft/ungrounded.
  finance: {
    surfaceId: null,
    groundsIn: ['ledger', 'periods', 'payouts'],
    canDraft: ['reconciliation (draft)'],
    gatedActions: ['post entry', 'close period'],
    citations: true,
  },
  owners: {
    surfaceId: null,
    groundsIn: ['owner statements', 'payouts', 'owner comms'],
    canDraft: ['statement summary', 'owner reply (draft)'],
    gatedActions: ['send statement'],
    citations: true,
  },
  agency: {
    surfaceId: null,
    groundsIn: ['listings', 'buyers', 'market comps (modeled)'],
    canDraft: ['valuation (draft)', 'match notes'],
    gatedActions: ['push to portal', 'send to client'],
    citations: true,
  },
  design: {
    surfaceId: null,
    groundsIn: ['projects', 'budget lines', 'comparable projects', 'property facts'],
    canDraft: ['stage suggestion', 'budget comparable'],
    gatedActions: ['share owner package', 'advance gated stage'],
    citations: true,
  },
  reviews: {
    surfaceId: null,
    groundsIn: ['channel reviews'],
    canDraft: ['review reply (draft)'],
    gatedActions: ['publish reply'],
    citations: true,
  },
  hr: {
    surfaceId: null,
    groundsIn: ['staff', 'leave requests', 'roster'],
    canDraft: ['coverage note'],
    gatedActions: ['approve leave'],
    citations: true,
  },
  marketing: {
    surfaceId: null,
    groundsIn: ['listing content', 'channels', 'promotions'],
    canDraft: ['listing copy (draft)', 'content improvement'],
    gatedActions: ['publish content', 'toggle promotion'],
    citations: true,
  },
  leads: {
    surfaceId: null,
    groundsIn: ['leads', 'sources', 'activity'],
    canDraft: ['first reply (draft)', 'qualification'],
    gatedActions: ['send reply', 'convert lead'],
    citations: true,
  },
  legal: {
    surfaceId: null,
    groundsIn: ['documents', 'signatures', 'compliance items'],
    canDraft: ['document summary'],
    gatedActions: ['send for signature'],
    citations: true,
  },
};

export function contractFor(moduleId: string): AskFridayContract | null {
  return ASK_FRIDAY_CONTRACTS[moduleId] ?? null;
}
