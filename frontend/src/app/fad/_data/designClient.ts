'use client';

// Design module client — live data from /api/design/* backed by the
// FAD-owned design_* tables in gmsdb. Mirrors the hrClient.ts pattern:
// snake_case API types, typed fetchers, React hooks with refetch, and
// adapters that convert API shape → fixture shape for callers that
// still render against the fixture types.
//
// Hydration strategy: the legacy designClient (in _data/design.ts) is
// synchronous and read-from-fixture-arrays. Rather than rewrite every
// one of the 32+ consumer files to async, this client mutates the
// fixture arrays IN PLACE on hydration so synchronous consumers
// automatically see live data on the next render. useHydrateDesign*
// hooks trigger the hydration + force a re-render via state increment.
//
// Owner portal endpoints are NOT covered here — they live in
// portalClient.ts because they use magic-link auth, not the staff JWT.

import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch, API_BASE, getToken, clearToken } from '../../../components/types';
import {
  PROJECTS as FIXTURE_PROJECTS,
  LEADS as FIXTURE_LEADS,
  COUNTERPARTIES as FIXTURE_COUNTERPARTIES,
  PROPERTIES as FIXTURE_PROPERTIES,
  VENDORS as FIXTURE_VENDORS,
  MOODBOARDS as FIXTURE_MOODBOARDS,
  DESIGN_PACKS as FIXTURE_PACKS,
  AGREEMENTS as FIXTURE_AGREEMENTS,
  PAYMENT_GATES as FIXTURE_PAYMENT_GATES,
  SELECTIONS as FIXTURE_SELECTIONS,
  CHANGE_ORDERS as FIXTURE_CHANGE_ORDERS,
  BUDGET_ITEMS as FIXTURE_BUDGET_ITEMS,
  ACTIVITY as FIXTURE_ACTIVITY,
  APPROVALS as FIXTURE_APPROVALS,
  ROOMS as FIXTURE_ROOMS,
  tierForEpc,
  designFeeForTier,
  procurementFeeForTier,
} from './design';
import type {
  DesignProject as FixtureProject,
  DesignLead as FixtureLead,
  Counterparty as FixtureCounterparty,
  DesignProperty as FixtureProperty,
  Vendor as FixtureVendor,
  MoodboardVersion as FixtureMoodboard,
  DesignPackVersion as FixturePack,
  Agreement as FixtureAgreement,
  PaymentGate as FixturePayment,
  ActivityLogEntry as FixtureActivity,
  DesignApproval as FixtureApproval,
  Room as FixtureRoom,
  StageId,
  StageStatus,
  LifecycleStatus,
  DesignTier,
  ProjectClassification,
  LeadSource,
  EngagementScope,
} from './design';

// ════════════════════════════════════════════════════════════════════
// API TYPES (snake_case — match the backend exactly)
// ════════════════════════════════════════════════════════════════════

export interface ApiCounterparty {
  id: string;
  entity_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiProperty {
  id: string;
  entity_id: string;
  counterparty_id: string | null;
  guesty_listing_id?: string | null;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  sqft?: number | null;
  construction_type?: string | null;
  year_built?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiVendor {
  id: string;
  entity_id: string;
  name: string;
  category?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiLead {
  id: string;
  entity_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status: 'lead' | 'qualified' | 'converted' | 'lost';
  owner_user_id?: string | null;
  converted_project_id?: string | null;
  staleness_days?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiProject {
  id: string;
  entity_id: string;
  name: string;
  slug: string;
  counterparty_id: string | null;
  property_id: string | null;
  classification?: string | null;
  tier?: number | null;
  lead_source?: string | null;
  epc_minor?: number | null;
  design_fee_minor?: number | null;
  procurement_fee_minor?: number | null;
  /**
   * Director-set override. When non-null, apiProjectToFixture uses this
   * instead of the tier-derived fee. NULL = no override → derive via
   * designFeeForTier(tier, epcMinor).
   */
  design_fee_minor_override?: number | null;
  /**
   * Director-set override for procurement fee. Same semantics as
   * design_fee_minor_override — when non-null bypasses the derivation
   * via procurementFeeForTier(tier, classification, epcMinor).
   */
  procurement_fee_minor_override?: number | null;
  budget_expectation_minor?: number | null;
  goals: string[];
  outcomes: string[];
  urgency?: string | null;
  pm_link?: string | null;
  design_lead_user_id?: string | null;
  current_stage: string;
  stage_status: string;
  blocker?: string | null;
  next_action?: string | null;
  /**
   * design-be-23: project-level engagement fork.
   *   'design_and_execution' — full project (default)
   *   'design_only' — moodboard + design pack only; owner buys + installs
   *
   * When 'design_only', apiProjectToFixture forces procurementFeeMinor to
   * 0 (regardless of any override) and stages 14-17 render out-of-scope.
   * Backed by design_projects.engagement_scope (migration 018).
   */
  engagement_scope?: 'design_only' | 'design_and_execution';
  lifecycle_status: 'active' | 'paused' | 'cancelled';
  paused_at?: string | null;
  paused_reason?: string | null;
  paused_by_user_id?: string | null;
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
  cancelled_by_user_id?: string | null;
  cancel_transfer_to_inventory?: boolean | null;
  start_date?: string | null;
  estimated_completion?: string | null;
  // sha256 of the canonical clean floor plan for this project. Set by
  // POST /api/design/ai_images/generate-floor-plan with
  // set_as_project_plan: true. Resolve to the asset row via
  // loadProjectFloorPlan(projectId).
  floor_plan_image_id?: string | null;
  // sha256 of the second-stage furnished floor plan (clean plan +
  // furniture overlay in the approved moodboard's aesthetic). Set by
  // POST /api/design/ai_images/generate-furnished-floor-plan with
  // set_as_project_plan: true. Resolve via
  // loadProjectFurnishedFloorPlan(projectId).
  floor_plan_furnished_image_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiStage {
  id: string;
  project_id: string;
  stage_key: string;
  status: 'pending' | 'in-progress' | 'waiting-on-owner' | 'blocked' | 'done' | 'skipped';
  entered_at?: string | null;
  completed_at?: string | null;
  owner_user_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiActivity {
  id: string;
  project_id: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  action: string;
  payload: Record<string, unknown>;
  visibility: 'internal' | 'portal';
  created_at: string;
}

export interface ApiMoodboard {
  id: string;
  project_id: string;
  version_number: number;
  status: 'draft' | 'sent' | 'approved' | 'changes_requested';
  name?: string | null;
  links: Array<{ url: string; caption?: string; image_id?: string }>;
  notes?: string | null;
  sent_at?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiPack {
  id: string;
  project_id: string;
  version_number: number;
  status: 'draft' | 'sent' | 'approved' | 'changes_requested';
  room_label?: string | null;
  pdf_url?: string | null;
  image_ids: string[];
  sent_at?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiAgreement {
  project_id: string;
  status: 'draft' | 'sent' | 'signed' | 'voided';
  sent_at?: string | null;
  signed_at?: string | null;
  signed_by?: string | null;
  design_fee_percent?: number | null;
  procurement_fee_percent?: number | null;
  contingency_percent?: number | null;
  annex_b: Record<string, unknown>;
  updated_at?: string | null;
}

export interface ApiPaymentGate {
  id: string;
  project_id: string;
  gate_id: string;
  status: 'pending' | 'received' | 'waived';
  amount_minor?: number | null;
  due_date?: string | null;
  received_at?: string | null;
  received_amount_minor?: number | null;
  received_note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiSelection {
  id: string;
  project_id: string;
  pack_id?: string | null;
  title: string;
  status: 'draft' | 'sent' | 'picked' | 'changes_requested';
  options: Array<Record<string, unknown>>;
  picked_option_id?: string | null;
  change_request_comment?: string | null;
  sent_at?: string | null;
  picked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiChangeOrder {
  id: string;
  project_id: string;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  line_items: Array<Record<string, unknown>>;
  reason?: string | null;
  sent_at?: string | null;
  decided_at?: string | null;
  decided_by?: string | null;
  decision_note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiBudgetItem {
  id: string;
  project_id: string;
  stage_key?: string | null;
  category_code?: string | null;
  description?: string | null;
  unit_cost_minor?: number | null;
  quantity?: number | null;
  /**
   * design-be-24: realised cash-out for the item. Populated by the
   * expense-capture stage; consumed by the bank reconciliation matcher.
   */
  actual_paid_minor?: number | null;
  retail_cost_minor?: number | null;
  negotiated_cost_minor?: number | null;
  internal_work?: boolean;
  vendor_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────── design-be-24: bank reconciliation ───────────────────────────

export type BankCode = 'mcb' | 'maubank';
export type BankParseStatus = 'pending' | 'parsed' | 'failed';
export type BankMatchStatus = 'suggested' | 'confirmed' | 'rejected';

export interface ApiBankStatement {
  id: string;
  project_id: string;
  account_label: string;
  bank_code: BankCode;
  statement_period_start: string;
  statement_period_end: string;
  uploaded_at: string;
  uploaded_by_user_id: string | null;
  raw_source_url: string | null;
  parse_status: BankParseStatus;
  parse_error: string | null;
  txn_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApiBankTransaction {
  id: string;
  statement_id: string;
  project_id: string;
  posted_date: string;
  value_date: string | null;
  amount_minor: number;
  descriptor: string;
  reference: string | null;
  balance_minor: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApiBankMatch {
  id: string;
  project_id: string;
  budget_item_id: string;
  transaction_id: string;
  status: BankMatchStatus;
  confidence: number | null;
  match_reason: string | null;
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Raw parsed-CSV transaction shape the backend accepts on POST. */
export interface BankTransactionInput {
  posted_date: string;
  value_date?: string | null;
  amount_minor: number;
  descriptor: string;
  reference?: string | null;
  balance_minor?: number | null;
}

export interface CreateBankStatementPayload {
  account_label: string;
  bank_code?: BankCode;
  statement_period_start: string;
  statement_period_end: string;
  raw_source_url?: string | null;
  transactions: BankTransactionInput[];
}

export interface CreateBankStatementResult {
  statement: ApiBankStatement;
  transactions: ApiBankTransaction[];
  matches: ApiBankMatch[];
}

export interface ApiCloseoutBinder {
  project_id: string;
  status: 'draft' | 'sent' | 'signed';
  warranties: Array<Record<string, unknown>>;
  maintenance: Array<Record<string, unknown>>;
  snags: Array<Record<string, unknown>>;
  sent_at?: string | null;
  sign_off_at?: string | null;
  signed_by?: string | null;
  updated_at?: string | null;
}

export type ApiTaskCategory = 'general' | 'blocker' | 'next_action';

export interface ApiTask {
  id: string;
  project_id: string;
  stage_key?: string | null;
  title: string;
  assignee_user_id?: string | null;
  due_date?: string | null;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  notes?: string | null;
  completed_at?: string | null;
  /**
   * design-be-18: discriminator. 'general' is the default; 'blocker' /
   * 'next_action' are surfaced as the two top-of-overview panels.
   */
  category: ApiTaskCategory;
  created_at: string;
  updated_at: string;
}

export interface ApiApproval {
  id: string;
  project_id: string;
  type: 'selection' | 'change_order' | 'agreement' | 'moodboard' | 'design_pack' | 'closeout';
  target_id: string;
  sent_at: string;
  respondent_user_id?: string | null;
  respondent_name?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  events?: Array<{
    id: string;
    approval_id: string;
    respondent_user_id?: string | null;
    respondent_name?: string | null;
    decision: 'approved' | 'rejected';
    comment?: string | null;
    responded_at: string;
  }>;
}

export interface ApiMagicLink {
  id: string;
  project_id: string;
  issued_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
  issued_by_user_id?: string | null;
  delivery_channel?: string | null;
}

export interface ApiAnnexA {
  tenant_id: string;
  annex_a: Record<string, unknown>;
  updated_at?: string | null;
  updated_by_user_id?: string | null;
}

// Shared asset shape returned by /api/design/ai_images/* and the
// /api/design/projects/:id/floor-plan join. Mirrors the backend
// `shapeAsset` adapter (sha256-keyed, source = 'upload' | 'nanobanana' |
// 'external'). Floor-plan responses additionally carry `kind: 'floor_plan'`
// and the generate-floor-plan endpoint stamps `project_updated` +
// `original_input_sha256`.
export interface ApiAsset {
  sha256: string;
  mime_type: string | null;
  byte_size: number | null;
  storage_url: string | null;
  source: 'upload' | 'nanobanana' | 'external' | null;
  generator_prompt: string | null;
  created_by_user_id: string | null;
  created_at: string;
  kind?: string | null;
}

export interface FloorPlanGenerationResult extends ApiAsset {
  stub?: boolean;
  duration_ms?: number | null;
  cached?: boolean;
  project_updated?: boolean;
  original_input_sha256?: string;
}

export interface GenerateFloorPlanPayload {
  project_id: string;
  source_image: { mimeType: string; base64: string };
  prompt_hint?: string;
  set_as_project_plan?: boolean;
}

// Second-stage floor-plan pass — furniture/fixtures overlaid on the clean
// plan in the approved moodboard's aesthetic. The endpoint resolves both
// source images server-side from sha256 / moodboard_id, so the caller
// only supplies references, not bytes.
export interface FurnishedFloorPlanGenerationResult extends ApiAsset {
  stub?: boolean;
  duration_ms?: number | null;
  cached?: boolean;
  project_updated?: boolean;
  source_floor_plan_sha256?: string;
  source_moodboard_id?: string;
  used_prompt?: string;
  prompt_source?: 'kimi' | 'template-fallback' | 'override' | string;
  prompt_style_notes?: string[];
  suggested_aspect_ratio?: string | null;
}

export interface GenerateFurnishedFloorPlanPayload {
  project_id: string;
  source_floor_plan_sha256?: string;
  moodboard_id?: string;
  prompt_hint?: string;
  set_as_project_plan?: boolean;
}

// ════════════════════════════════════════════════════════════════════
// FETCHERS
// ════════════════════════════════════════════════════════════════════

const unwrap = <T,>(r: { results: T[] }): T[] => r.results || [];

export const loadProjects = async (filters: { lifecycle_status?: string; current_stage?: string; counterparty_id?: string } = {}) => {
  const qs = new URLSearchParams();
  if (filters.lifecycle_status) qs.set('lifecycle_status', filters.lifecycle_status);
  if (filters.current_stage) qs.set('current_stage', filters.current_stage);
  if (filters.counterparty_id) qs.set('counterparty_id', filters.counterparty_id);
  const path = qs.toString() ? `/api/design/projects?${qs}` : '/api/design/projects';
  return unwrap(await apiFetch(path) as { results: ApiProject[] });
};

export const loadProject = (id: string) => apiFetch(`/api/design/projects/${id}`) as Promise<ApiProject>;
export const loadProjectBySlug = (slug: string) => apiFetch(`/api/design/projects/by-slug/${encodeURIComponent(slug)}`) as Promise<ApiProject>;

export const loadLeads = async (status?: string) => {
  const path = status ? `/api/design/leads?status=${status}` : '/api/design/leads';
  return unwrap(await apiFetch(path) as { results: ApiLead[] });
};
export const loadLead = (id: string) => apiFetch(`/api/design/leads/${id}`) as Promise<ApiLead>;

export const loadCounterparties = async () =>
  unwrap(await apiFetch('/api/design/counterparties') as { results: ApiCounterparty[] });
export const loadCounterparty = (id: string) => apiFetch(`/api/design/counterparties/${id}`) as Promise<ApiCounterparty>;

export const loadProperties = async (counterpartyId?: string) => {
  const path = counterpartyId ? `/api/design/properties?counterparty_id=${counterpartyId}` : '/api/design/properties';
  return unwrap(await apiFetch(path) as { results: ApiProperty[] });
};
export const loadProperty = (id: string) => apiFetch(`/api/design/properties/${id}`) as Promise<ApiProperty>;

export const loadVendors = async (category?: string) => {
  const path = category ? `/api/design/vendors?category=${encodeURIComponent(category)}` : '/api/design/vendors';
  return unwrap(await apiFetch(path) as { results: ApiVendor[] });
};
export const loadVendor = (id: string) => apiFetch(`/api/design/vendors/${id}`) as Promise<ApiVendor>;

export const loadStages = async (projectId: string) =>
  unwrap(await apiFetch(`/api/design/stages?project_id=${projectId}`) as { results: ApiStage[] });

export const loadActivities = async (projectId: string, visibility?: 'portal' | 'internal') => {
  const qs = new URLSearchParams({ project_id: projectId });
  if (visibility) qs.set('visibility', visibility);
  return unwrap(await apiFetch(`/api/design/activities?${qs}`) as { results: ApiActivity[] });
};

export const loadMoodboards = async (projectId: string) =>
  unwrap(await apiFetch(`/api/design/moodboards?project_id=${projectId}`) as { results: ApiMoodboard[] });

export const loadPacks = async (projectId: string) =>
  unwrap(await apiFetch(`/api/design/packs?project_id=${projectId}`) as { results: ApiPack[] });

export const loadAgreement = (projectId: string) =>
  apiFetch(`/api/design/agreements/${projectId}`) as Promise<ApiAgreement>;

export const loadPayments = async (projectId: string) =>
  unwrap(await apiFetch(`/api/design/payment_gates?project_id=${projectId}`) as { results: ApiPaymentGate[] });

export const loadSelections = async (projectId: string) =>
  unwrap(await apiFetch(`/api/design/selections?project_id=${projectId}`) as { results: ApiSelection[] });

export const loadChangeOrders = async (projectId: string) =>
  unwrap(await apiFetch(`/api/design/change_orders?project_id=${projectId}`) as { results: ApiChangeOrder[] });

export const loadBudgetItems = async (projectId: string, filters: { category_code?: string; vendor_id?: string } = {}) => {
  const qs = new URLSearchParams({ project_id: projectId });
  if (filters.category_code) qs.set('category_code', filters.category_code);
  if (filters.vendor_id) qs.set('vendor_id', filters.vendor_id);
  return unwrap(await apiFetch(`/api/design/budget_items?${qs}`) as { results: ApiBudgetItem[] });
};

export const loadCloseoutBinder = (projectId: string) =>
  apiFetch(`/api/design/closeout_binders/${projectId}`) as Promise<ApiCloseoutBinder>;

export const loadTasks = async (
  projectId: string,
  filters: { status?: string; assignee_user_id?: string; category?: ApiTaskCategory } = {},
) => {
  const qs = new URLSearchParams({ project_id: projectId });
  if (filters.status) qs.set('status', filters.status);
  if (filters.assignee_user_id) qs.set('assignee_user_id', filters.assignee_user_id);
  if (filters.category) qs.set('category', filters.category);
  return unwrap(await apiFetch(`/api/design/tasks?${qs}`) as { results: ApiTask[] });
};

/**
 * design-be-18: convenience wrapper for the BlockersPanel /
 * NextActionsPanel — one panel per category, single call site.
 */
export const listTasksByCategory = (projectId: string, category: ApiTaskCategory) =>
  loadTasks(projectId, { category });

export const loadApprovals = async (projectId: string, filters: { status?: string; type?: string } = {}) => {
  const qs = new URLSearchParams({ project_id: projectId });
  if (filters.status) qs.set('status', filters.status);
  if (filters.type) qs.set('type', filters.type);
  return unwrap(await apiFetch(`/api/design/approvals?${qs}`) as { results: ApiApproval[] });
};
export const loadApproval = (id: string) => apiFetch(`/api/design/approvals/${id}`) as Promise<ApiApproval>;

export const loadMagicLinks = async (projectId: string) =>
  unwrap(await apiFetch(`/api/design/magic_links?project_id=${projectId}`) as { results: ApiMagicLink[] });

export const loadAnnexA = () => apiFetch('/api/design/annex_a') as Promise<ApiAnnexA>;

// ── Bank reconciliation (design-be-24) ──
//
// All routes are project-scoped except confirm / reject / delete which take
// the match id directly. List endpoints return { results: [...] }; the
// helpers unwrap to the array shape consumers actually use.

export const listBankStatements = async (projectId: string): Promise<ApiBankStatement[]> =>
  unwrap(await apiFetch(`/api/design/projects/${projectId}/bank-statements`) as { results: ApiBankStatement[] });

export const createBankStatement = (projectId: string, payload: CreateBankStatementPayload) =>
  apiFetch(`/api/design/projects/${projectId}/bank-statements`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<CreateBankStatementResult>;

export const listBankTransactions = async (projectId: string, opts: { statement_id?: string } = {}): Promise<ApiBankTransaction[]> => {
  const qs = opts.statement_id ? `?statement_id=${encodeURIComponent(opts.statement_id)}` : '';
  return unwrap(await apiFetch(`/api/design/projects/${projectId}/bank-transactions${qs}`) as { results: ApiBankTransaction[] });
};

export const listBankMatches = async (projectId: string, opts: { status?: BankMatchStatus } = {}): Promise<ApiBankMatch[]> => {
  const qs = opts.status ? `?status=${encodeURIComponent(opts.status)}` : '';
  return unwrap(await apiFetch(`/api/design/projects/${projectId}/bank-matches${qs}`) as { results: ApiBankMatch[] });
};

export const confirmBankMatch = (id: string) =>
  apiFetch(`/api/design/bank-matches/${id}/confirm`, { method: 'POST' }) as Promise<ApiBankMatch>;

export const rejectBankMatch = (id: string) =>
  apiFetch(`/api/design/bank-matches/${id}/reject`, { method: 'POST' }) as Promise<ApiBankMatch>;

export const createManualBankMatch = (projectId: string, payload: { budget_item_id: string; transaction_id: string; notes?: string | null }) =>
  apiFetch(`/api/design/projects/${projectId}/bank-matches`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<ApiBankMatch>;

export const deleteBankMatch = (id: string) =>
  apiFetch(`/api/design/bank-matches/${id}`, { method: 'DELETE' }) as Promise<{ ok: true; id: string }>;

export const loadTimeInStage = (days = 90) =>
  apiFetch(`/api/design/analytics/time-in-stage?days=${days}`) as Promise<{ window_days: number; results: Array<{ stage_key: string; completed_count: number; mean_days: number }> }>;

export const loadFunnel = () =>
  apiFetch('/api/design/analytics/funnel') as Promise<{ leads_by_status: Record<string, number>; projects_by_lifecycle: Record<string, number>; projects_by_stage: Record<string, number> }>;

export const loadSpendCurve = (days = 90) =>
  apiFetch(`/api/design/analytics/spend-curve?days=${days}`) as Promise<{ window_days: number; results: Array<{ day: string; spend_minor: number }> }>;

export const loadRevenueCurve = (days = 180) =>
  apiFetch(`/api/design/analytics/revenue-curve?days=${days}`) as Promise<{ window_days: number; results: Array<{ day: string; revenue_minor: number }> }>;

export const loadVendorPerformance = () =>
  apiFetch('/api/design/analytics/vendor-performance') as Promise<{ results: Array<{ vendor_id: string; vendor_name: string; category: string; item_count: number; total_spend_minor: number; internal_work_count: number }> }>;

// ════════════════════════════════════════════════════════════════════
// MUTATIONS
// ════════════════════════════════════════════════════════════════════

export const createProject = (payload: Partial<ApiProject> & { name: string; slug: string }) =>
  apiFetch('/api/design/projects', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiProject>;
export const updateProject = (id: string, patch: Partial<ApiProject>) =>
  apiFetch(`/api/design/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<ApiProject>;
export const pauseProject = (id: string, reason?: string) =>
  apiFetch(`/api/design/projects/${id}/pause`, { method: 'POST', body: JSON.stringify({ reason }) }) as Promise<ApiProject>;
export const resumeProject = (id: string) =>
  apiFetch(`/api/design/projects/${id}/resume`, { method: 'POST' }) as Promise<ApiProject>;
export const cancelProject = (id: string, payload: { reason?: string; transfer_to_inventory?: boolean }) =>
  apiFetch(`/api/design/projects/${id}/cancel`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiProject>;

export const createLead = (payload: Partial<ApiLead> & { name: string }) =>
  apiFetch('/api/design/leads', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiLead>;
export const updateLead = (id: string, patch: Partial<ApiLead>) =>
  apiFetch(`/api/design/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<ApiLead>;
export const convertLeadToProject = (id: string, projectPayload: { name?: string; slug?: string } = {}) =>
  apiFetch(`/api/design/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(projectPayload) }) as Promise<{ lead: ApiLead; project: ApiProject }>;

// ─────────────────────────── Rooms ───────────────────────────
// Rooms attach to properties (not directly to projects). The Site Visit
// stage uses these to anchor photos + measurements + design-pack layouts.
// Backend schema: design_rooms { id, property_id, name, sqft, usage_kind }.
export interface ApiRoom {
  id: string;
  property_id: string;
  name: string;
  sqft?: number | null;
  usage_kind?: string | null;
  created_at: string;
  updated_at: string;
}
export const listRooms = (propertyId: string) =>
  apiFetch(`/api/design/rooms?property_id=${encodeURIComponent(propertyId)}`)
    .then((r) => (r as { results: ApiRoom[] }).results);
export const createRoom = (payload: { property_id: string; name: string; sqft?: number | null; usage_kind?: string | null }) =>
  apiFetch('/api/design/rooms', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiRoom>;

export const createCounterparty = (payload: Partial<ApiCounterparty> & { name: string }) =>
  apiFetch('/api/design/counterparties', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiCounterparty>;
export const updateCounterparty = (id: string, patch: Partial<ApiCounterparty>) =>
  apiFetch(`/api/design/counterparties/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<ApiCounterparty>;

export const createProperty = (payload: Partial<ApiProperty> & { name: string }) =>
  apiFetch('/api/design/properties', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiProperty>;
export const updateProperty = (id: string, patch: Partial<ApiProperty>) =>
  apiFetch(`/api/design/properties/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<ApiProperty>;

export const createVendor = (payload: Partial<ApiVendor> & { name: string }) =>
  apiFetch('/api/design/vendors', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiVendor>;
export const updateVendor = (id: string, patch: Partial<ApiVendor>) =>
  apiFetch(`/api/design/vendors/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<ApiVendor>;

// design-be-18: task CRUD. category is part of the create payload so
// the BlockersPanel / NextActionsPanel can post tasks pre-categorised.
export type ApiTaskCreatePayload = Partial<ApiTask> & {
  project_id: string;
  title: string;
};
export const createTask = (payload: ApiTaskCreatePayload) =>
  apiFetch('/api/design/tasks', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiTask>;
export const updateTask = (id: string, patch: Partial<ApiTask>) =>
  apiFetch(`/api/design/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<ApiTask>;
export const deleteTask = (id: string) =>
  apiFetch(`/api/design/tasks/${id}`, { method: 'DELETE' }) as Promise<void>;

export const upsertStage = (projectId: string, stageKey: string, patch: Partial<ApiStage>) =>
  apiFetch(`/api/design/stages/${projectId}/${stageKey}`, { method: 'PUT', body: JSON.stringify(patch) }) as Promise<ApiStage>;

// design-be-10: stage rewind. Backend returns 409 with { locked_by: [...] }
// when a downstream document blocks the reopen — we surface that to the UI
// via a typed error so the toast can list the blocking artifacts.
export interface StageLockedItem { type: string; id: string; status: string }
export class StageReopenLockedError extends Error {
  readonly lockedBy: StageLockedItem[];
  constructor(message: string, lockedBy: StageLockedItem[]) {
    super(message);
    this.name = 'StageReopenLockedError';
    this.lockedBy = lockedBy;
  }
}
export async function reopenStage(
  projectId: string,
  stageKey: string,
): Promise<{ stage: ApiStage; project: ApiProject }> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/design/stages/${projectId}/${stageKey}/reopen`, {
    method: 'POST',
    headers,
  });
  if (res.status === 401) { clearToken(); throw new Error('Unauthorized'); }
  if (res.status === 409) {
    const body = await res.json().catch(() => ({})) as { error?: string; locked_by?: StageLockedItem[] };
    throw new StageReopenLockedError(
      body.error || 'Cannot reopen stage: downstream documents are locked',
      Array.isArray(body.locked_by) ? body.locked_by : [],
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const upsertAgreement = (projectId: string, patch: Partial<ApiAgreement>) =>
  apiFetch(`/api/design/agreements/${projectId}`, { method: 'PUT', body: JSON.stringify(patch) }) as Promise<ApiAgreement>;
export const sendAgreement = (projectId: string) =>
  apiFetch(`/api/design/agreements/${projectId}/send`, { method: 'POST' }) as Promise<ApiAgreement>;
export const signAgreement = (projectId: string, signedBy?: string) =>
  apiFetch(`/api/design/agreements/${projectId}/sign`, { method: 'POST', body: JSON.stringify({ signed_by: signedBy }) }) as Promise<ApiAgreement>;

export const upsertPaymentGate = (projectId: string, gateId: string, patch: Partial<ApiPaymentGate>) =>
  apiFetch(`/api/design/payment_gates/${projectId}/${gateId}`, { method: 'PUT', body: JSON.stringify(patch) }) as Promise<ApiPaymentGate>;
export const receivePayment = (projectId: string, gateId: string, payload: { amount_minor?: number; received_at?: string; note?: string }) =>
  apiFetch(`/api/design/payment_gates/${projectId}/${gateId}/receive`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiPaymentGate>;
export const waivePayment = (projectId: string, gateId: string, note?: string) =>
  apiFetch(`/api/design/payment_gates/${projectId}/${gateId}/waive`, { method: 'POST', body: JSON.stringify({ note }) }) as Promise<ApiPaymentGate>;

export const createMoodboard = (payload: Partial<ApiMoodboard> & { project_id: string }) =>
  apiFetch('/api/design/moodboards', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiMoodboard>;
export const updateMoodboard = (id: string, patch: Partial<ApiMoodboard>) =>
  apiFetch(`/api/design/moodboards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<ApiMoodboard>;
export const sendMoodboard = (id: string) =>
  apiFetch(`/api/design/moodboards/${id}/send`, { method: 'POST' }) as Promise<ApiMoodboard>;
export const approveMoodboard = (id: string) =>
  apiFetch(`/api/design/moodboards/${id}/approve`, { method: 'POST' }) as Promise<ApiMoodboard>;

export const createPack = (payload: Partial<ApiPack> & { project_id: string }) =>
  apiFetch('/api/design/packs', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiPack>;
export const updatePack = (id: string, patch: Partial<ApiPack>) =>
  apiFetch(`/api/design/packs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<ApiPack>;
export const sendPack = (id: string) =>
  apiFetch(`/api/design/packs/${id}/send`, { method: 'POST' }) as Promise<ApiPack>;
export const approvePack = (id: string) =>
  apiFetch(`/api/design/packs/${id}/approve`, { method: 'POST' }) as Promise<ApiPack>;

export const createSelection = (payload: Partial<ApiSelection> & { project_id: string; title: string }) =>
  apiFetch('/api/design/selections', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiSelection>;
export const updateSelection = (id: string, patch: Partial<ApiSelection>) =>
  apiFetch(`/api/design/selections/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<ApiSelection>;
export const sendSelection = (id: string) =>
  apiFetch(`/api/design/selections/${id}/send`, { method: 'POST' }) as Promise<ApiSelection>;
export const pickSelection = (id: string, pickedOptionId: string) =>
  apiFetch(`/api/design/selections/${id}/pick`, { method: 'POST', body: JSON.stringify({ picked_option_id: pickedOptionId }) }) as Promise<ApiSelection>;
export const requestSelectionChanges = (id: string, comment?: string) =>
  apiFetch(`/api/design/selections/${id}/request-changes`, { method: 'POST', body: JSON.stringify({ comment }) }) as Promise<ApiSelection>;

export const createChangeOrder = (payload: Partial<ApiChangeOrder> & { project_id: string }) =>
  apiFetch('/api/design/change_orders', { method: 'POST', body: JSON.stringify(payload) }) as Promise<ApiChangeOrder>;
export const updateChangeOrder = (id: string, patch: Partial<ApiChangeOrder>) =>
  apiFetch(`/api/design/change_orders/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<ApiChangeOrder>;
export const sendChangeOrder = (id: string) =>
  apiFetch(`/api/design/change_orders/${id}/send`, { method: 'POST' }) as Promise<ApiChangeOrder>;
export const approveChangeOrder = (id: string, note?: string) =>
  apiFetch(`/api/design/change_orders/${id}/approve`, { method: 'POST', body: JSON.stringify({ decision_note: note }) }) as Promise<ApiChangeOrder>;
export const rejectChangeOrder = (id: string, note?: string) =>
  apiFetch(`/api/design/change_orders/${id}/reject`, { method: 'POST', body: JSON.stringify({ decision_note: note }) }) as Promise<ApiChangeOrder>;

export const upsertCloseoutBinder = (projectId: string, patch: Partial<ApiCloseoutBinder>) =>
  apiFetch(`/api/design/closeout_binders/${projectId}`, { method: 'PUT', body: JSON.stringify(patch) }) as Promise<ApiCloseoutBinder>;
export const sendCloseoutBinder = (projectId: string) =>
  apiFetch(`/api/design/closeout_binders/${projectId}/send`, { method: 'POST' }) as Promise<ApiCloseoutBinder>;
export const signOffCloseoutBinder = (projectId: string, signedBy?: string) =>
  apiFetch(`/api/design/closeout_binders/${projectId}/sign-off`, { method: 'POST', body: JSON.stringify({ signed_by: signedBy }) }) as Promise<ApiCloseoutBinder>;

export const respondToApproval = (id: string, decision: 'approved' | 'rejected', comment?: string) =>
  apiFetch(`/api/design/approvals/${id}/respond`, { method: 'POST', body: JSON.stringify({ decision, comment }) }) as Promise<ApiApproval>;

export const updateAnnexA = (annexA: Record<string, unknown>) =>
  apiFetch('/api/design/annex_a', { method: 'PUT', body: JSON.stringify({ annex_a: annexA }) }) as Promise<ApiAnnexA>;

export const mintMagicLink = (projectId: string, opts: { delivery_channel?: string; expires_in_seconds?: number } = {}) =>
  apiFetch('/api/design/magic_links', { method: 'POST', body: JSON.stringify({ project_id: projectId, ...opts }) }) as Promise<ApiMagicLink & { token: string; portal_url: string }>;
export const revokeMagicLink = (id: string) =>
  apiFetch(`/api/design/magic_links/${id}/revoke`, { method: 'POST' }) as Promise<ApiMagicLink>;

// ── Floor plan ──
// loadProjectFloorPlan resolves the currently-pinned clean floor plan for
// a project via the FK join. Returns null on 404 (no plan set) — callers
// shouldn't need to special-case the missing-plan path with try/catch.
export const loadProjectFloorPlan = async (projectId: string): Promise<ApiAsset | null> => {
  try {
    return await apiFetch(`/api/design/projects/${projectId}/floor-plan`) as ApiAsset;
  } catch (e) {
    // The backend returns 404 with `{ error: 'No floor plan set for this project' }`
    // when floor_plan_image_id is null. apiFetch translates this into an
    // Error whose message starts with the backend's error text.
    if (e instanceof Error && /No floor plan|Project not found|HTTP 404/i.test(e.message)) return null;
    throw e;
  }
};

// generateFloorPlan POSTs the messy floor plan + optional hint to the
// floor-plan-cleanup endpoint. Returns the asset row plus the metadata
// the endpoint appends (project_updated, original_input_sha256, stub,
// duration_ms, cached). Callers typically set set_as_project_plan: true
// so the project's floor_plan_image_id is updated in the same call.
export const generateFloorPlan = (payload: GenerateFloorPlanPayload) =>
  apiFetch('/api/design/ai_images/generate-floor-plan', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<FloorPlanGenerationResult>;

// loadProjectFurnishedFloorPlan resolves the second-stage furnished floor
// plan via FK join. Returns null on 404 (no furnished plan pinned yet) so
// callers can render the empty-state without try/catch.
export const loadProjectFurnishedFloorPlan = async (projectId: string): Promise<ApiAsset | null> => {
  try {
    return await apiFetch(`/api/design/projects/${projectId}/floor-plan-furnished`) as ApiAsset;
  } catch (e) {
    if (e instanceof Error && /No furnished floor plan|Project not found|HTTP 404/i.test(e.message)) return null;
    throw e;
  }
};

// generateFurnishedFloorPlan kicks off the second-stage pass: backend
// resolves the project's clean floor plan + the latest approved moodboard
// (or the explicitly-passed override), runs Kimi to synthesise an
// architectural furnishing prompt, then calls Nanobanana with both
// images inline. Callers typically default set_as_project_plan: true so
// the result is immediately surfaced in the project shell.
export const generateFurnishedFloorPlan = (body: GenerateFurnishedFloorPlanPayload) =>
  apiFetch('/api/design/ai_images/generate-furnished-floor-plan', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<FurnishedFloorPlanGenerationResult>;

// ════════════════════════════════════════════════════════════════════
// HOOKS — simple list/detail wrappers around the fetchers above
// ════════════════════════════════════════════════════════════════════

function useResource<T>(loader: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    loader()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch };
}

export const useLiveDesignProjects = (filters: Parameters<typeof loadProjects>[0] = {}) =>
  useResource(() => loadProjects(filters), [JSON.stringify(filters)]);

export const useLiveDesignProject = (id: string | null) =>
  useResource(() => id ? loadProject(id) : Promise.resolve(null), [id]);

export const useLiveDesignProjectBySlug = (slug: string | null) =>
  useResource(() => slug ? loadProjectBySlug(slug) : Promise.resolve(null), [slug]);

export const useLiveDesignLeads = (status?: string) =>
  useResource(() => loadLeads(status), [status]);

export const useLiveDesignCounterparties = () =>
  useResource(() => loadCounterparties(), []);

export const useLiveDesignProperties = (counterpartyId?: string) =>
  useResource(() => loadProperties(counterpartyId), [counterpartyId]);

export const useLiveDesignVendors = (category?: string) =>
  useResource(() => loadVendors(category), [category]);

export const useLiveDesignStages = (projectId: string | null) =>
  useResource(() => projectId ? loadStages(projectId) : Promise.resolve([]), [projectId]);

export const useLiveDesignActivities = (projectId: string | null, visibility?: 'portal' | 'internal') =>
  useResource(() => projectId ? loadActivities(projectId, visibility) : Promise.resolve([]), [projectId, visibility]);

export const useLiveDesignMoodboards = (projectId: string | null) =>
  useResource(() => projectId ? loadMoodboards(projectId) : Promise.resolve([]), [projectId]);

export const useLiveDesignPacks = (projectId: string | null) =>
  useResource(() => projectId ? loadPacks(projectId) : Promise.resolve([]), [projectId]);

export const useLiveDesignAgreement = (projectId: string | null) =>
  useResource(() => projectId ? loadAgreement(projectId) : Promise.resolve(null), [projectId]);

export const useLiveDesignPayments = (projectId: string | null) =>
  useResource(() => projectId ? loadPayments(projectId) : Promise.resolve([]), [projectId]);

export const useLiveDesignSelections = (projectId: string | null) =>
  useResource(() => projectId ? loadSelections(projectId) : Promise.resolve([]), [projectId]);

export const useLiveDesignChangeOrders = (projectId: string | null) =>
  useResource(() => projectId ? loadChangeOrders(projectId) : Promise.resolve([]), [projectId]);

export const useLiveDesignBudgetItems = (projectId: string | null, filters: { category_code?: string; vendor_id?: string } = {}) =>
  useResource(() => projectId ? loadBudgetItems(projectId, filters) : Promise.resolve([]), [projectId, filters.category_code, filters.vendor_id]);

export const useLiveDesignCloseoutBinder = (projectId: string | null) =>
  useResource(() => projectId ? loadCloseoutBinder(projectId) : Promise.resolve(null), [projectId]);

export const useLiveDesignTasks = (projectId: string | null) =>
  useResource(() => projectId ? loadTasks(projectId) : Promise.resolve([]), [projectId]);

export const useLiveDesignApprovals = (projectId: string | null, status?: string) =>
  useResource(() => projectId ? loadApprovals(projectId, { status }) : Promise.resolve([]), [projectId, status]);

export const useLiveDesignMagicLinks = (projectId: string | null) =>
  useResource(() => projectId ? loadMagicLinks(projectId) : Promise.resolve([]), [projectId]);

export const useLiveDesignAnnexA = () => useResource(() => loadAnnexA(), []);

// ════════════════════════════════════════════════════════════════════
// ADAPTERS — API shape (snake_case) → fixture shape (camelCase)
// Used by components that still render against the fixture types so the
// live data drops in transparently. As consumers migrate to the API
// types directly these adapters can shrink.
// ════════════════════════════════════════════════════════════════════

export function apiProjectToFixture(api: ApiProject): FixtureProject {
  // Tier + fees derive from Annex A — the editable pricing schedule
  // in _data/design.ts (ANNEX_A_DEFAULT). EPC drives both. When the
  // backend hasn't persisted explicit values (common during onboarding)
  // we fall back to budget_expectation_minor as the EPC proxy.
  //
  // Annex A locks (current schedule):
  //   Tier 1 (EPC > Rs 1.5M):  3% of EPC for design
  //   Tier 2 (Rs 500K–1.5M):   flat Rs 45,000 for design
  //   Tier 3 (EPC < Rs 500K):  flat Rs 25,000 for design
  //   Procurement (renovation): T1 12.5% · T2 15% · T3 17.5% of EPC
  //   Procurement (furnishing): T1  7.5% · T2 10% · T3 12.5% of EPC
  //
  // Tier is derived from EPC each render — we deliberately ignore
  // api.tier even when persisted so the math stays correct after a
  // budget change. If you need to manually override tier (e.g. a
  // Director downgrade) wire a separate tier_override column.
  const classification = (api.classification as ProjectClassification) ?? 'mixed';
  const persistedEpc = api.epc_minor ?? 0;
  const budgetExpectation = api.budget_expectation_minor ?? 0;
  const effectiveEpc = persistedEpc > 0 ? persistedEpc : budgetExpectation;
  const tier: DesignTier = effectiveEpc > 0 ? tierForEpc(effectiveEpc) : ((api.tier as DesignTier) ?? 1);
  // design-be-15: explicit Director override columns take precedence
  // over tier derivation. Legacy design_fee_minor / procurement_fee_minor
  // flow through the API for backward-compat but are no longer the
  // override carrier — only the *_override columns drive the fixture.
  const designFeeOverride = api.design_fee_minor_override;
  const procurementFeeOverride = api.procurement_fee_minor_override;
  const designFee = designFeeOverride != null
    ? designFeeOverride
    : (effectiveEpc > 0 ? designFeeForTier(tier, effectiveEpc) : 0);
  // design-be-23: design-only engagements have no procurement scope, so
  // the procurement fee is masked to 0 here regardless of any Director
  // override. The helper (procurementFeeForTier) is preserved upstream
  // so the simulator + "what would the full-scope quote look like"
  // preview can still compute the hypothetical figure. Mask happens at
  // the read path so the database stays clean if scope is toggled back
  // to full.
  const engagementScope: EngagementScope = api.engagement_scope ?? 'design_and_execution';
  const procurementFee = engagementScope === 'design_only'
    ? 0
    : (procurementFeeOverride != null
        ? procurementFeeOverride
        : (effectiveEpc > 0 ? procurementFeeForTier(tier, classification, effectiveEpc) : 0));

  return {
    id: api.id,
    entityId: 'FD',
    name: api.name,
    slug: api.slug,
    counterpartyId: api.counterparty_id ?? '',
    propertyId: api.property_id ?? '',
    classification,
    tier,
    epcMinor: effectiveEpc,
    designFeeMinor: designFee,
    procurementFeeMinor: procurementFee,
    goals: api.goals || [],
    outcomes: api.outcomes || [],
    budgetExpectationMinor: api.budget_expectation_minor ?? null,
    urgency: api.urgency ?? null,
    pmLink: api.pm_link ?? null,
    designLeadUserId: api.design_lead_user_id ?? null,
    currentStage: (api.current_stage as StageId) ?? 'lead',
    stageStatus: (api.stage_status as StageStatus) ?? 'pending',
    blocker: api.blocker ?? null,
    nextAction: api.next_action ?? null,
    leadSource: (api.lead_source as LeadSource) ?? 'other',
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    startDate: api.start_date ?? null,
    estimatedCompletion: api.estimated_completion ?? null,
    lifecycleStatus: api.lifecycle_status as LifecycleStatus,
    pausedAt: api.paused_at ?? undefined,
    pausedReason: api.paused_reason ?? undefined,
    pausedByUserId: api.paused_by_user_id ?? undefined,
    cancelledAt: api.cancelled_at ?? undefined,
    cancelledReason: api.cancelled_reason ?? undefined,
    cancelledByUserId: api.cancelled_by_user_id ?? undefined,
    cancelTransferToInventory: api.cancel_transfer_to_inventory ?? undefined,
    floorPlanImageId: api.floor_plan_image_id ?? null,
    floorPlanFurnishedImageId: api.floor_plan_furnished_image_id ?? null,
    designFeeMinorOverride: api.design_fee_minor_override ?? null,
    procurementFeeMinorOverride: api.procurement_fee_minor_override ?? null,
    engagementScope,
    // design-be-23: pre-computed total fee. For design_only this is
    // just the design fee (procurement is out of scope and already
    // masked to 0 above). Components can read this directly without
    // having to re-derive the math.
    effectiveTotalFeeMinor: designFee + procurementFee,
  } as FixtureProject;
}

export function apiLeadToFixture(api: ApiLead): FixtureLead {
  // The legacy DesignLead fixture shape (counterpartyName, propertyHint, etc.)
  // is no longer used at runtime. Hydration writes the API shape directly into
  // the LEADS array and the Design Leads UI casts back to ApiLead. The
  // 'as unknown as FixtureLead' cast is preserved so the legacy fixture
  // typing on LEADS keeps compiling; the runtime shape mirrors ApiLead.
  return {
    id: api.id,
    name: api.name,
    email: api.email ?? null,
    phone: api.phone ?? null,
    source: (api.source as LeadSource) ?? 'other',
    status: api.status,
    staleness_days: typeof api.staleness_days === 'number' ? api.staleness_days : null,
    owner_user_id: api.owner_user_id ?? null,
    converted_project_id: api.converted_project_id ?? null,
    notes: api.notes ?? null,
    created_at: api.created_at,
    updated_at: api.updated_at,
  } as unknown as FixtureLead;
}

export function apiCounterpartyToFixture(api: ApiCounterparty): FixtureCounterparty {
  // fixture Counterparty fields: id, fullName, nic, kind, email, phone, entity_id.
  // The backend only stores name/email/phone — synthesize a reasonable kind
  // and leave nic blank until the schema extension lands.
  return {
    id: api.id,
    fullName: api.name,
    nic: '',
    kind: 'owner',
    email: api.email ?? '',
    phone: api.phone ?? '',
    entity_id: api.entity_id,
  } as unknown as FixtureCounterparty;
}

export function apiPropertyToFixture(api: ApiProperty): FixtureProperty {
  // fixture DesignProperty fields: id, pmPropertyId, name, address, region,
  // bedrooms, bathrooms. The backend doesn't track bedroom/bathroom counts
  // yet — leave as 0/null so the UI renders "—" placeholders.
  const region: 'North' | 'West' | 'South' | 'East' | 'Central' | null =
    api.city === 'Albion' ? 'West'
    : api.city === 'Grand Baie' || api.city === 'Mont Choisy' || api.city === 'Pereybere' ? 'North'
    : api.city === 'Flic en Flac' || api.city === 'Tamarin' ? 'West'
    : null;
  return {
    id: api.id,
    pmPropertyId: api.guesty_listing_id ?? null,
    name: api.name,
    address: api.address ?? '',
    region,
    bedrooms: 0,
    bathrooms: 0,
  } as unknown as FixtureProperty;
}

export function apiVendorToFixture(api: ApiVendor): FixtureVendor {
  // fixture Vendor: id, name, company, category, email, phone, paymentTerms,
  // notes, engagements (cross-project history — derived, leave empty until
  // the analytics endpoint feeds it back).
  return {
    id: api.id,
    name: api.name,
    company: api.name,
    category: api.category ?? '',
    email: api.email ?? '',
    phone: api.phone ?? '',
    paymentTerms: '',
    notes: api.notes ?? '',
    engagements: [],
    entity_id: api.entity_id,
  } as unknown as FixtureVendor;
}

export function apiMoodboardToFixture(api: ApiMoodboard): FixtureMoodboard {
  const links = api.links || [];
  // Surface the first image link as the fixture's coverImageUrl so the
  // existing MoodboardStage cover renderer can display it without
  // shape changes. The full `links` array is attached as an extra
  // field for the gallery view (cast via unknown lets us add it).
  return {
    id: api.id,
    projectId: api.project_id,
    versionNumber: api.version_number,
    version: api.version_number,
    status: api.status,
    state: api.status === 'changes_requested' ? 'revision_requested' : api.status,
    coverImageUrl: links[0]?.url ?? '',
    narrative: api.notes ?? '',
    inspiration: links.map((l) => ({ url: l.url, sourceLabel: l.caption ?? 'Image' })),
    palette: [],
    materials: [],
    designerNotes: null,
    sentAt: api.sent_at ?? null,
    approvedAt: api.approved_at ?? null,
    ownerComments: null,
    createdAt: api.created_at,
    links,
  } as unknown as FixtureMoodboard;
}

// Rooms attach to properties on the backend (one room row per property),
// but the fixture indexes by projectId since the synchronous consumers
// (SiteVisitStage, DesignPackStage, RoomDetail) all key off the active
// project. The mapping needs projectId from outside the API row.
//
// Fields the API doesn't yet expose (lengthM/widthM/heightM/windows/
// doors/conditionNotes/etc.) default to null; the rendering code has
// null guards so the panel renders even on a freshly-created row with
// just a name + usage_kind.
export function apiRoomToFixture(api: ApiRoom, projectId: string): FixtureRoom {
  return {
    id: api.id,
    projectId,
    name: api.name,
    lengthM: null,
    widthM: null,
    heightM: null,
    windows: null,
    doors: null,
    conditionNotes: null,
    issues: null,
    keepFurniture: null,
    removeFurniture: null,
    designOpportunity: null,
    accessNotes: null,
    utilitiesNotes: null,
    photoCount: 0,
  } as unknown as FixtureRoom;
}

export function apiPackToFixture(api: ApiPack): FixturePack {
  // Defensive defaults for fields the prod API doesn't yet populate.
  // Without these, consumers like DesignPackStage hit
  // "Cannot read properties of undefined (reading 'length')" on
  // v.rooms.length and the React error boundary kills the page.
  // Same root cause as the agreement events bug (see apiAgreementToFixture).
  // TODO: when the design_packs schema gains rooms/pdf_url/cover/etc.,
  // wire the real values + drop these fallbacks.
  return {
    id: api.id,
    projectId: api.project_id,
    versionNumber: api.version_number,
    version: api.version_number,
    status: api.status,
    state: api.status,
    createdAt: api.created_at,
    pdfUrl: null,
    coverImageUrl: '',
    narrative: '',
    rooms: [],
    sentAt: null,
    approvedAt: null,
  } as unknown as FixturePack;
}

export function apiAgreementToFixture(api: ApiAgreement): FixtureAgreement {
  return {
    id: api.project_id,
    projectId: api.project_id,
    status: api.status,
    sentAt: api.sent_at ?? null,
    signedAt: api.signed_at ?? null,
    signedBy: api.signed_by ?? null,
    designFeePercent: api.design_fee_percent ?? 0,
    procurementFeePercent: api.procurement_fee_percent ?? 0,
    contingency: api.contingency_percent ?? 0,
    annexB: api.annex_b,
    // events array isn't in the prod schema yet (added by the in-portal
    // signing feature, Tier A #3). Default to [] so consumers don't
    // crash on .length / .map. Remove the fallback once the column lands.
    events: [],
  } as unknown as FixtureAgreement;
}

export function apiPaymentToFixture(api: ApiPaymentGate): FixturePayment {
  return {
    id: api.id,
    projectId: api.project_id,
    gateId: api.gate_id,
    status: api.status,
    amount: api.amount_minor ?? 0,
    dueDate: api.due_date ?? null,
    receivedAt: api.received_at ?? null,
  } as unknown as FixturePayment;
}

// Fixture ActivityLogEntry.kind is a constrained enum; map the verb out of
// our flexible API `action` string. Falls back to 'update' for anything
// unrecognised so the renderer never crashes.
const API_ACTION_TO_KIND: Record<string, FixtureActivity['kind']> = {
  'project.created': 'create',
  'project.updated': 'update',
  'project.paused': 'pause',
  'project.cancelled': 'cancel',
  'project.resumed': 'resume',
  'stage.entered': 'stage_transition',
  'agreement.sent': 'send',
  'agreement.signed': 'approve',
  'payment.received': 'receive_payment',
  'payment.waived': 'override',
  'moodboard.sent': 'send',
  'moodboard.approved': 'approve',
  'design_pack.sent': 'send',
  'design_pack.approved': 'approve',
  'selection.sent': 'send',
  'selection.picked': 'approve',
  'selection.picked.by_owner': 'approve',
  'selection.changes_requested': 'reject',
  'selection.changes_requested.by_owner': 'reject',
  'change_order.sent': 'send',
  'change_order.approved': 'approve',
  'change_order.rejected': 'reject',
  'approval.approved': 'approve',
  'approval.rejected': 'reject',
  'approval.approved.by_owner': 'approve',
  'approval.rejected.by_owner': 'reject',
  'closeout_binder.sent': 'send',
  'closeout_binder.signed': 'approve',
};

function describeAction(action: string, payload: Record<string, unknown>): string {
  // Light-weight summary derivation. Falls back to the action verb itself
  // so the activity timeline always has something to render.
  if (action === 'stage.entered' && typeof payload?.stage === 'string') return `Entered ${payload.stage} stage`;
  if (action === 'payment.received' && typeof payload?.gate_id === 'string') return `Payment received: ${payload.gate_id}`;
  if (action === 'moodboard.sent' && typeof payload?.version_number === 'number') return `Moodboard v${payload.version_number} sent`;
  if (action === 'moodboard.approved' && typeof payload?.version_number === 'number') return `Moodboard v${payload.version_number} approved`;
  if (action === 'design_pack.sent' && typeof payload?.version_number === 'number') return `Design pack v${payload.version_number} sent`;
  if (action === 'design_pack.approved' && typeof payload?.version_number === 'number') return `Design pack v${payload.version_number} approved`;
  if (action === 'agreement.sent') return 'Agreement sent for signature';
  if (action === 'agreement.signed') return 'Agreement signed';
  if (action === 'project.created') return 'Project created';
  return action.replace(/[._]/g, ' ');
}

export function apiActivityToFixture(api: ApiActivity): FixtureActivity {
  return {
    id: api.id,
    projectId: api.project_id,
    at: api.created_at,
    userId: api.actor_user_id ?? null,
    kind: API_ACTION_TO_KIND[api.action] ?? 'update',
    summary: describeAction(api.action, api.payload || {}),
  } as unknown as FixtureActivity;
}

export function apiApprovalToFixture(api: ApiApproval): FixtureApproval {
  return {
    id: api.id,
    projectId: api.project_id,
    type: api.type,
    targetId: api.target_id,
    sentAt: api.sent_at,
    status: api.status,
    respondentUserId: api.respondent_user_id ?? null,
    respondentName: api.respondent_name ?? null,
  } as unknown as FixtureApproval;
}

// ════════════════════════════════════════════════════════════════════
// HYDRATION — splice live API data into the fixture arrays so the
// existing synchronous designClient + 30+ component consumers see
// real data without per-file rewrites.
// ════════════════════════════════════════════════════════════════════

function replaceArray<T>(target: T[], next: T[]): void {
  target.length = 0;
  target.push(...next);
}

function removeMatching<T>(target: T[], pred: (row: T) => boolean): void {
  for (let i = target.length - 1; i >= 0; i--) {
    if (pred(target[i])) target.splice(i, 1);
  }
}

/** Hydrate the top-level reference + project fixtures from the API.
 *  Per-project artifact arrays (moodboards, packs, payments, etc.) are
 *  cleared so stale fixture rows don't survive alongside live projects;
 *  per-project hydration (below) repopulates them on drill-down. */
export async function hydrateDesignTopLevel(): Promise<void> {
  const [projects, leads, counterparties, properties, vendors] = await Promise.all([
    loadProjects().catch(() => []),
    loadLeads().catch(() => []),
    loadCounterparties().catch(() => []),
    loadProperties().catch(() => []),
    loadVendors().catch(() => []),
  ]);

  replaceArray(FIXTURE_PROJECTS, projects.map(apiProjectToFixture));
  replaceArray(FIXTURE_LEADS, leads.map(apiLeadToFixture));
  replaceArray(FIXTURE_COUNTERPARTIES, counterparties.map(apiCounterpartyToFixture));
  replaceArray(FIXTURE_PROPERTIES, properties.map(apiPropertyToFixture));
  replaceArray(FIXTURE_VENDORS, vendors.map(apiVendorToFixture));

  // Clear all per-project fixture rows — they reference IDs from the
  // old fixture and would be orphaned alongside the new live projects.
  // hydrateDesignProject() repopulates per project on drill-down.
  const liveIds = new Set(projects.map((p) => p.id));
  removeMatching(FIXTURE_MOODBOARDS, (m) => !liveIds.has(m.projectId));
  removeMatching(FIXTURE_PACKS, (p) => !liveIds.has(p.projectId));
  removeMatching(FIXTURE_AGREEMENTS, (a) => !liveIds.has((a as { projectId: string }).projectId));
  removeMatching(FIXTURE_PAYMENT_GATES, (g) => !liveIds.has((g as { projectId: string }).projectId));
  removeMatching(FIXTURE_SELECTIONS, (s) => !liveIds.has((s as { projectId: string }).projectId));
  removeMatching(FIXTURE_CHANGE_ORDERS, (c) => !liveIds.has((c as { projectId: string }).projectId));
  removeMatching(FIXTURE_BUDGET_ITEMS, (b) => !liveIds.has((b as { projectId: string }).projectId));
  removeMatching(FIXTURE_APPROVALS, (a) => !liveIds.has((a as { projectId: string }).projectId));
  removeMatching(FIXTURE_ACTIVITY, (a) => !liveIds.has((a as { projectId: string }).projectId));
}

/** Hydrate per-project artifact arrays for a single project. Splices
 *  any existing rows for this project, then appends fresh live rows.
 *  Called lazily when the user opens a project drill-down. */
export async function hydrateDesignProject(projectId: string): Promise<void> {
  // Rooms live on the property (one room row per property_id), so we
  // resolve the project's propertyId from the already-hydrated
  // FIXTURE_PROJECTS list. If the project isn't found (race during
  // initial hydration) or has no property, we skip room loading and
  // the panel falls through to the hardcoded fixture / empty state.
  const project = FIXTURE_PROJECTS.find((p) => p.id === projectId);
  const propertyId = project?.propertyId ?? null;

  const [moodboards, packs, agreement, payments, selections, changeOrders, budgetItems, activities, approvals, rooms] = await Promise.all([
    loadMoodboards(projectId).catch(() => []),
    loadPacks(projectId).catch(() => []),
    loadAgreement(projectId).catch(() => null as ApiAgreement | null),
    loadPayments(projectId).catch(() => []),
    loadSelections(projectId).catch(() => []),
    loadChangeOrders(projectId).catch(() => []),
    loadBudgetItems(projectId).catch(() => []),
    loadActivities(projectId).catch(() => []),
    loadApprovals(projectId).catch(() => []),
    propertyId ? listRooms(propertyId).catch(() => [] as ApiRoom[]) : Promise.resolve([] as ApiRoom[]),
  ]);

  removeMatching(FIXTURE_MOODBOARDS, (m) => m.projectId === projectId);
  FIXTURE_MOODBOARDS.push(...moodboards.map(apiMoodboardToFixture));

  removeMatching(FIXTURE_PACKS, (p) => p.projectId === projectId);
  FIXTURE_PACKS.push(...packs.map(apiPackToFixture));

  removeMatching(FIXTURE_AGREEMENTS, (a) => (a as { projectId: string }).projectId === projectId);
  if (agreement) FIXTURE_AGREEMENTS.push(apiAgreementToFixture(agreement));

  removeMatching(FIXTURE_PAYMENT_GATES, (g) => (g as { projectId: string }).projectId === projectId);
  FIXTURE_PAYMENT_GATES.push(...payments.map(apiPaymentToFixture));

  removeMatching(FIXTURE_SELECTIONS, (s) => (s as { projectId: string }).projectId === projectId);
  // Selections fixture shape is rich (option ids, version, etc.); pass through unknown.
  FIXTURE_SELECTIONS.push(...(selections as unknown as Array<typeof FIXTURE_SELECTIONS[number]>));

  removeMatching(FIXTURE_CHANGE_ORDERS, (c) => (c as { projectId: string }).projectId === projectId);
  FIXTURE_CHANGE_ORDERS.push(...(changeOrders as unknown as Array<typeof FIXTURE_CHANGE_ORDERS[number]>));

  removeMatching(FIXTURE_BUDGET_ITEMS, (b) => (b as { projectId: string }).projectId === projectId);
  FIXTURE_BUDGET_ITEMS.push(...(budgetItems as unknown as Array<typeof FIXTURE_BUDGET_ITEMS[number]>));

  removeMatching(FIXTURE_ACTIVITY, (a) => (a as { projectId: string }).projectId === projectId);
  FIXTURE_ACTIVITY.push(...activities.map(apiActivityToFixture));

  removeMatching(FIXTURE_APPROVALS, (a) => (a as { projectId: string }).projectId === projectId);
  FIXTURE_APPROVALS.push(...approvals.map(apiApprovalToFixture));

  removeMatching(FIXTURE_ROOMS, (r) => r.projectId === projectId);
  FIXTURE_ROOMS.push(...rooms.map((r) => apiRoomToFixture(r, projectId)));
}

/** Hook: hydrate top-level fixtures on mount. Returns { hydrated,
 *  error, refetch, rev } where `rev` is a version counter that
 *  consumers can include in a useEffect/useMemo dep list to re-derive
 *  state after live data arrives. */
export function useHydrateDesignTopLevel(): { hydrated: boolean; loading: boolean; error: string | null; refetch: () => void; rev: number } {
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    hydrateDesignTopLevel()
      .then(() => { setHydrated(true); setRev((r) => r + 1); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { hydrated, loading, error, refetch, rev };
}

/** Hook: hydrate a single project's per-resource arrays. Returns
 *  { hydrated, error, refetch, rev } same as the top-level hook. */
export function useHydrateDesignProject(projectId: string | null): { hydrated: boolean; loading: boolean; error: string | null; refetch: () => void; rev: number } {
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const refetch = useCallback(() => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    hydrateDesignProject(projectId)
      .then(() => { setHydratedFor(projectId); setRev((r) => r + 1); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { hydrated: hydratedFor === projectId, loading, error, refetch, rev };
}

// useMemo import was added for completeness; current hooks do not
// require it but downstream wiring (e.g. project pickers, table sort
// memoisation) commonly does, so keep the import live.
void useMemo;
