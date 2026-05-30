'use client';

// Thin API client for the FAD inbox draft + compose endpoints. The main
// review/send paths are now FAD-native; only the dormant AI-compose
// compatibility mode can still pass through the backend's GMS bridge.
// Mirrors the patterns established in inboxClient.ts (apiFetch, neutral
// response shapes, no global state — callers own caching/refresh).
//
// Endpoint matrix (FAD path → GMS path):
//   POST /api/inbox/drafts/:id/approve  → /api/drafts/:id/approve
//   POST /api/inbox/drafts/:id/reject   → /api/drafts/:id/reject
//   POST /api/inbox/drafts/:id/revise   → FAD draft generator
//   POST /api/inbox/drafts/:id/retry    → /api/drafts/:id/retry
//   POST /api/inbox/drafts/:id/fail     → /api/drafts/:id/fail
//   POST /api/inbox/drafts/:id/dismiss  → /api/drafts/:id/dismiss
//   POST /api/outbound/send             → direct Guesty send for manual replies
//
// Errors: 4xx/5xx bubble up as thrown Error('<status>: <body>'); callers
// catch and surface to the UI. WhatsApp window-expired is a special 409
// shape — callers can `e.message?.includes('whatsapp_window_expired')`.

import { apiFetch } from '../../../components/types';

// ── Approve ────────────────────────────────────────────────────────────

export interface ApproveDraftOpts {
  /** Operator display name for attribution on the sent message. */
  reviewedBy?: string;
  /** Channel used for the send. Required when the GMS auto-pick would
   *  be wrong (e.g. recommended is WhatsApp but operator wants email). */
  sentVia?: 'whatsapp' | 'airbnb' | 'booking' | 'email' | 'website';
  /** If the operator edited the draft inline, send the final body here
   *  — server uses it instead of the persisted draft_body and creates
   *  the audit trail with the edited version. */
  draftBody?: string;
  /** Learning signal. 'learn' = save this approval as positive teaching;
   *  'no_learn' = don't propagate to future drafts. 'normal' = default. */
  learnMode?: 'learn' | 'no_learn' | 'normal';
  /** Scope for learn-mode teaching: global rule or scoped to property. */
  scope?: 'global' | 'property';
}

export interface ApproveDraftResp {
  ok: boolean;
  sent_at?: string;
  sent_via?: string;
  message_id?: string;
}

export async function approveDraft(id: string, opts: ApproveDraftOpts = {}): Promise<ApproveDraftResp> {
  const body: Record<string, unknown> = {};
  if (opts.reviewedBy) body.reviewed_by = opts.reviewedBy;
  if (opts.sentVia) body.sent_via = opts.sentVia;
  if (opts.draftBody !== undefined) body.draft_body = opts.draftBody;
  if (opts.learnMode) body.learnMode = opts.learnMode;
  if (opts.scope) body.scope = opts.scope;
  return apiFetch(`/api/inbox/drafts/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<ApproveDraftResp>;
}

// ── Reject ─────────────────────────────────────────────────────────────

export interface RejectDraftResp {
  ok: boolean;
}

/**
 * Reject the draft. With a non-empty `reason`, a learning event is
 * recorded; with an empty/missing reason it's a silent dismiss.
 */
export async function rejectDraft(id: string, reason?: string): Promise<RejectDraftResp> {
  const body: Record<string, unknown> = {};
  if (reason && reason.trim().length > 0) body.reason = reason.trim();
  return apiFetch(`/api/inbox/drafts/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<RejectDraftResp>;
}

// ── Revise ─────────────────────────────────────────────────────────────

export interface ReviseDraftOpts {
  /** Mode controls what's saved alongside the revision request:
   *    standard  — one-off revise, no persistence
   *    teach     — save this instruction as a teaching for future drafts
   *    one_time  — explicit single-use (skip the auto-learn heuristic) */
  mode?: 'standard' | 'teach' | 'one_time';
  scope?: 'global' | 'property';
}

export interface ReviseDraftResp {
  ok: boolean;
  /** ID of the new draft being generated when available. The current
   *  draft transitions to revision_requested and the next /:id GET will
   *  return the generated revision. */
  new_draft_id?: string;
  /** Revision number of the new draft (prev + 1). */
  revision_number?: number;
}

export async function reviseDraft(
  id: string,
  instruction: string,
  opts: ReviseDraftOpts = {},
): Promise<ReviseDraftResp> {
  const body: Record<string, unknown> = { revision_instruction: instruction };
  if (opts.mode) body.mode = opts.mode;
  if (opts.scope) body.scope = opts.scope;
  return apiFetch(`/api/inbox/drafts/${id}/revise`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<ReviseDraftResp>;
}

// ── Queue management (for send_queued / send_failed states) ────────────

export async function retryDraft(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/inbox/drafts/${id}/retry`, { method: 'POST' }) as Promise<{ ok: boolean }>;
}

export async function failDraft(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/inbox/drafts/${id}/fail`, { method: 'POST' }) as Promise<{ ok: boolean }>;
}

export async function dismissDraft(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/inbox/drafts/${id}/dismiss`, { method: 'POST' }) as Promise<{ ok: boolean }>;
}

// ── Compose (operator-initiated send, not draft-review path) ───────────

export interface ComposeOpts {
  /** Three modes per friday-gms/src/routes/compose.ts:
   *    manual      — legacy alias; FAD maps this to direct_send
   *    draft       — request AI to draft a reply (returns draft_id; no auto-send)
   *    direct_send — instruction → AI generate + auto-send (skip review) */
  mode: 'manual' | 'draft' | 'direct_send';
  /** Required for mode=manual. */
  body?: string;
  /** Required for mode=draft|direct_send. */
  instruction?: string;
  /** Channel selection (defaults to recommended_channel from detail bundle). */
  channel?: 'whatsapp' | 'airbnb' | 'booking' | 'email' | 'website';
}

export interface ComposeResp {
  ok: boolean;
  /** Present for mode=manual or mode=direct_send (the sent message). */
  message_id?: string;
  /** Present for mode=draft (the new draft awaiting review). */
  draft_id?: string;
}

export async function sendCompose(conversationId: string, opts: ComposeOpts): Promise<ComposeResp> {
  if (conversationId.startsWith('web-')) {
    const webId = conversationId.slice(4);
    if (opts.mode === 'draft') {
      const r = await apiFetch(`/api/inbox/website/threads/${encodeURIComponent(webId)}/drafts`, {
        method: 'POST',
        body: JSON.stringify({
          instruction: opts.instruction || opts.body || '',
        }),
      }) as { ok?: boolean; draft_id?: string; state?: string };
      return {
        ok: !!r.ok,
        draft_id: r.draft_id,
      };
    }
    const r = await apiFetch(`/api/inbox/website/threads/${encodeURIComponent(webId)}/reply`, {
      method: 'POST',
      body: JSON.stringify({
        body: opts.body || opts.instruction || '',
        channel: opts.channel || 'email',
      }),
    }) as { ok?: boolean; message_id?: string };
    return {
      ok: !!r.ok,
      message_id: r.message_id,
    };
  }

  // Routes through the unified /api/outbound/send abstraction per
  // locked decision §2 (2026-05-17). Backend's guest branch hits GMS
  // /api/conversations/:id/compose — same downstream as legacy.
  const { outboundSend } = await import('./outboundClient');
  const mode = opts.mode === 'manual' ? 'direct_send' : opts.mode;
  const meta: Record<string, unknown> = { mode };
  if (opts.instruction !== undefined) meta.instruction = opts.instruction;
  if (opts.mode === 'manual' && opts.body !== undefined) meta.instruction = opts.body;
  const r = await outboundSend({
    audience: 'guest',
    channel: opts.channel === 'website' ? 'email' : (opts.channel || 'whatsapp'),
    contextId: conversationId,
    body: opts.body ?? '',
    meta,
  });
  return {
    ok: r.ok,
    message_id: r.messageId ?? undefined,
    draft_id: r.draftId ?? undefined,
  };
}

export async function approveWebsiteDraft(
  threadId: string,
  draftId: string,
  opts: { draftBody?: string; sentVia?: string } = {},
): Promise<ApproveDraftResp> {
  const body: Record<string, unknown> = {
    channel: opts.sentVia === 'website' ? 'website' : 'email',
  };
  if (opts.draftBody !== undefined) body.draft_body = opts.draftBody;
  const r = await apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/drafts/${encodeURIComponent(draftId)}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as { ok?: boolean; message_id?: string; sent_at?: string; sent_via?: string };
  return {
    ok: !!r.ok,
    message_id: r.message_id,
    sent_at: r.sent_at,
    sent_via: r.sent_via,
  };
}

export async function reviseWebsiteDraft(
  threadId: string,
  draftId: string,
  instruction: string,
): Promise<ReviseDraftResp> {
  return apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/drafts/${encodeURIComponent(draftId)}/revise`, {
    method: 'POST',
    body: JSON.stringify({ revision_instruction: instruction }),
  }) as Promise<ReviseDraftResp>;
}

export async function rejectWebsiteDraft(
  threadId: string,
  draftId: string,
  reason?: string,
): Promise<RejectDraftResp> {
  return apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/drafts/${encodeURIComponent(draftId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || '' }),
  }) as Promise<RejectDraftResp>;
}

export async function takeOverWebsiteAI(
  threadId: string,
  reason = 'human_takeover',
): Promise<{ ok: boolean; takeoverState?: string; aiMayReply?: boolean; handoffId?: string }> {
  return apiFetch(`/api/inbox/website/threads/${encodeURIComponent(threadId)}/ai-takeover`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }) as Promise<{ ok: boolean; takeoverState?: string; aiMayReply?: boolean; handoffId?: string }>;
}

export async function sendWhatsAppTemplate(
  conversationId: string,
  opts: { templateId: string; variables?: Record<string, unknown> },
): Promise<{ ok?: boolean; state?: 'sent' | 'blocked'; message?: string; error?: string; manualAction?: string }> {
  return apiFetch(`/api/inbox/conversations/${conversationId}/send-template`, {
    method: 'POST',
    body: JSON.stringify({
      templateId: opts.templateId,
      variables: opts.variables || {},
    }),
  }) as Promise<{ ok?: boolean; state?: 'sent' | 'blocked'; message?: string; error?: string; manualAction?: string }>;
}

// ── Conversation mutations (used by other UI surfaces, parked here for
//    one-stop discoverability) ──────────────────────────────────────────

export async function markRead(conversationId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/inbox/conversations/${conversationId}/read`, { method: 'PATCH' }) as Promise<{ ok: boolean }>;
}

export async function markUnread(conversationId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/inbox/conversations/${conversationId}/unread`, { method: 'PATCH' }) as Promise<{ ok: boolean }>;
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Map a `latest_draft_state` flag to whether the operator should be
 * shown the DraftPanel (i.e., a draft is awaiting review).
 */
export function isReviewReady(state: string | undefined | null): boolean {
  return state === 'draft_ready' || state === 'under_review';
}

/**
 * Categorise confidence into the three-tier visual signal used by the
 * confidence pill in DraftPanel + the list-item indicator.
 */
export function confidenceTier(confidence: number | undefined | null): 'high' | 'mid' | 'low' {
  if (typeof confidence !== 'number') return 'low';
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'mid';
  return 'low';
}
