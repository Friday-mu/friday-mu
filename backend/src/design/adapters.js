'use strict';

// Row → API-shape adapters for the Design module. Centralises the
// snake_case → camelCase mapping so route handlers stay tidy, and so the
// frontend `designClient` swap in design-be-6 hits a stable contract.
//
// The shape functions intentionally pass JSONB columns through unchanged
// (they were authored as JSON on insert and remain JSON on read).

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Strip retail / negotiated / internal-work cost from a budget item row.
// Used for owner-portal reads per the B3.1 disclosure rule. Owners see
// the unit cost they pay, not Friday's margin or vendor pricing.
function stripSensitiveBudgetItem(row) {
  if (!row) return row;
  const { retail_cost_minor: _r, negotiated_cost_minor: _n, internal_work: _w, ...rest } = row;
  return rest;
}

function shapeCounterparty(row) {
  if (!row) return null;
  return {
    id: row.id,
    entity_id: row.entity_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeProperty(row) {
  if (!row) return null;
  return {
    id: row.id,
    entity_id: row.entity_id,
    counterparty_id: row.counterparty_id,
    guesty_listing_id: row.guesty_listing_id,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    zipcode: row.zipcode,
    sqft: row.sqft,
    construction_type: row.construction_type,
    year_built: row.year_built,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeVendor(row) {
  if (!row) return null;
  return {
    id: row.id,
    entity_id: row.entity_id,
    name: row.name,
    category: row.category,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    entity_id: row.entity_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    status: row.status,
    owner_user_id: row.owner_user_id,
    converted_project_id: row.converted_project_id,
    staleness_days: row.staleness_days,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// node-postgres serialises BIGINT columns as JS strings (to preserve
// precision for values > Number.MAX_SAFE_INTEGER = 2^53-1). For the
// Mauritius MUR amounts we store, no individual value will overflow
// JS Number — Friday's biggest legit EPC is well under 2^53 cents. So
// we coerce BIGINT-returned strings to numbers here so the frontend
// can safely do arithmetic (sum, compare) without string-concatenation
// bugs. Returns null if the input is null/undefined.
function toNumberOrNull(v) {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function shapeProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    entity_id: row.entity_id,
    name: row.name,
    slug: row.slug,
    counterparty_id: row.counterparty_id,
    property_id: row.property_id,
    classification: row.classification,
    tier: row.tier,
    lead_source: row.lead_source,
    // BIGINT → number coercion (see toNumberOrNull comment above).
    epc_minor: toNumberOrNull(row.epc_minor),
    design_fee_minor: toNumberOrNull(row.design_fee_minor),
    procurement_fee_minor: toNumberOrNull(row.procurement_fee_minor),
    design_fee_minor_override: toNumberOrNull(row.design_fee_minor_override),
    procurement_fee_minor_override: toNumberOrNull(row.procurement_fee_minor_override),
    budget_expectation_minor: toNumberOrNull(row.budget_expectation_minor),
    goals: row.goals || [],
    outcomes: row.outcomes || [],
    urgency: row.urgency,
    pm_link: row.pm_link,
    design_lead_user_id: row.design_lead_user_id,
    current_stage: row.current_stage,
    stage_status: row.stage_status,
    blocker: row.blocker,
    next_action: row.next_action,
    // design-be-23: 'design_only' | 'design_and_execution'. NOT NULL
    // at the DB level with default 'design_and_execution' (migration
    // 018), so the ?? is belt-and-braces for rows materialised before
    // the column existed.
    engagement_scope: row.engagement_scope ?? 'design_and_execution',
    lifecycle_status: row.lifecycle_status,
    paused_at: row.paused_at,
    paused_reason: row.paused_reason,
    paused_by_user_id: row.paused_by_user_id,
    cancelled_at: row.cancelled_at,
    cancelled_reason: row.cancelled_reason,
    cancelled_by_user_id: row.cancelled_by_user_id,
    cancel_transfer_to_inventory: row.cancel_transfer_to_inventory,
    start_date: row.start_date,
    estimated_completion: row.estimated_completion,
    // Pinned by POST /api/design/ai_images/generate-floor-plan when called
    // with set_as_project_plan: true. Null on fresh projects. FK to
    // design_assets.sha256 via migration 009 (column renamed to
    // floor_plan_image_id by migration 010).
    floor_plan_image_id: row.floor_plan_image_id ?? null,
    // Pinned by POST /api/design/ai_images/generate-furnished-floor-plan
    // when called with set_as_project_plan: true. The "furnished" pass
    // overlays furniture/fixtures onto the clean floor plan using an
    // approved moodboard as a style reference. Null until that pass has
    // run. FK to design_assets.sha256 via migration 011.
    floor_plan_furnished_image_id: row.floor_plan_furnished_image_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeStage(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    stage_key: row.stage_key,
    status: row.status,
    entered_at: row.entered_at,
    completed_at: row.completed_at,
    owner_user_id: row.owner_user_id,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    doc_type: row.doc_type,
    name: row.name,
    url: row.url,
    version: row.version,
    signed_by: row.signed_by,
    signed_at: row.signed_at,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
  };
}

function shapeDecision(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    decision_key: row.decision_key,
    value: row.value,
    decided_at: row.decided_at,
    decided_by: row.decided_by,
  };
}

function shapeActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    actor_user_id: row.actor_user_id,
    actor_name: row.actor_name,
    action: row.action,
    payload: row.payload,
    visibility: row.visibility,
    created_at: row.created_at,
  };
}

function shapeSiteVisit(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    visit_date: row.visit_date,
    visited_at: row.visited_at || null,
    visited_by_user_id: row.visited_by_user_id || null,
    walkthrough_video_url: row.walkthrough_video_url || null,
    marketing_photo_consent: row.marketing_photo_consent,
    status: row.status || 'in_progress',
    duration_min: row.duration_min,
    attendees: row.attendees || [],
    notes: row.notes,
    photos_collected: row.photos_collected,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeRoom(row) {
  if (!row) return null;
  return {
    id: row.id,
    property_id: row.property_id,
    name: row.name,
    sqft: row.sqft,
    usage_kind: row.usage_kind,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapePhoto(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    room_id: row.room_id,
    kind: row.kind,
    caption: row.caption,
    url: row.url,
    uploaded_at: row.uploaded_at,
  };
}

function shapePreferences(row) {
  if (!row) return null;
  return {
    project_id: row.project_id,
    preferences: row.preferences,
    notes: row.notes,
    updated_at: row.updated_at,
  };
}

function shapeRoughBudget(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    category_code: row.category_code,
    description: row.description,
    unit_cost_minor: toNumberOrNull(row.unit_cost_minor),
    quantity: row.quantity != null ? Number(row.quantity) : null,
    notes: row.notes,
    catalog_source_id: row.catalog_source_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeAgreement(row) {
  if (!row) return null;
  return {
    project_id: row.project_id,
    status: row.status,
    sent_at: row.sent_at,
    signed_at: row.signed_at,
    signed_by: row.signed_by,
    design_fee_percent: row.design_fee_percent != null ? Number(row.design_fee_percent) : null,
    procurement_fee_percent: row.procurement_fee_percent != null ? Number(row.procurement_fee_percent) : null,
    contingency_percent: row.contingency_percent != null ? Number(row.contingency_percent) : null,
    annex_b: row.annex_b,
    updated_at: row.updated_at,
  };
}

function shapePaymentGate(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    gate_id: row.gate_id,
    // Two-ledger split (migration 006). ledger_type partitions the table
    // into fee_invoice (Friday revenue) vs project_fund (owner escrow).
    // direction is debit/credit, used by the reconciliation rollup.
    ledger_type: row.ledger_type || 'fee_invoice',
    direction: row.direction || 'credit',
    status: row.status,
    amount_minor: toNumberOrNull(row.amount_minor),
    due_date: row.due_date,
    received_at: row.received_at,
    received_amount_minor: toNumberOrNull(row.received_amount_minor),
    received_note: row.received_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeMoodboard(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    version_number: row.version_number,
    status: row.status,
    name: row.name,
    links: row.links || [],
    notes: row.notes,
    sent_at: row.sent_at,
    approved_at: row.approved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapePack(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    version_number: row.version_number,
    status: row.status,
    room_label: row.room_label,
    pdf_url: row.pdf_url,
    image_ids: row.image_ids || [],
    sent_at: row.sent_at,
    approved_at: row.approved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeSelection(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    pack_id: row.pack_id,
    room_id: row.room_id || null,
    category_code: row.category_code || null,
    title: row.title,
    status: row.status,
    options: row.options || [],
    picked_option_id: row.picked_option_id,
    change_request_comment: row.change_request_comment,
    sent_at: row.sent_at,
    picked_at: row.picked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeChangeOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title || null,
    co_number: row.co_number != null ? Number(row.co_number) : null,
    status: row.status,
    line_items: row.line_items || [],
    reason: row.reason,
    sent_at: row.sent_at,
    decided_at: row.decided_at,
    decided_by: row.decided_by,
    decision_note: row.decision_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeBudgetItem(row, canSeeSensitive) {
  if (!row) return null;
  const base = {
    id: row.id,
    project_id: row.project_id,
    stage_key: row.stage_key,
    category_code: row.category_code,
    description: row.description,
    unit_cost_minor: toNumberOrNull(row.unit_cost_minor),
    quantity: row.quantity != null ? Number(row.quantity) : null,
    actual_paid_minor: toNumberOrNull(row.actual_paid_minor),
    vendor_id: row.vendor_id,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (canSeeSensitive) {
    base.retail_cost_minor = toNumberOrNull(row.retail_cost_minor);
    base.negotiated_cost_minor = toNumberOrNull(row.negotiated_cost_minor);
    base.internal_work = row.internal_work;
  }
  return base;
}

function shapeCloseoutBinder(row) {
  if (!row) return null;
  return {
    project_id: row.project_id,
    status: row.status,
    warranties: row.warranties || [],
    maintenance: row.maintenance || [],
    snags: row.snags || [],
    sent_at: row.sent_at,
    sign_off_at: row.sign_off_at,
    signed_by: row.signed_by,
    updated_at: row.updated_at,
  };
}

function shapeTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    stage_key: row.stage_key,
    title: row.title,
    assignee_user_id: row.assignee_user_id,
    due_date: row.due_date,
    status: row.status,
    notes: row.notes,
    completed_at: row.completed_at,
    category: row.category ?? 'general',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function shapeApproval(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    type: row.type,
    target_id: row.target_id,
    sent_at: row.sent_at,
    respondent_user_id: row.respondent_user_id,
    respondent_name: row.respondent_name,
    status: row.status,
  };
}

function shapeApprovalEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    approval_id: row.approval_id,
    respondent_user_id: row.respondent_user_id,
    respondent_name: row.respondent_name,
    decision: row.decision,
    comment: row.comment,
    responded_at: row.responded_at,
  };
}

function shapeMagicLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    // token_hash deliberately omitted — the raw token is returned ONCE at mint
    // time, then only the hash lives in DB. Frontend never needs the hash.
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
    issued_by_user_id: row.issued_by_user_id,
    delivery_channel: row.delivery_channel,
  };
}

function shapePortalLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    event_type: row.event_type,
    payload: row.payload,
    magic_link_id: row.magic_link_id,
    user_agent: row.user_agent,
    created_at: row.created_at,
  };
}

function shapeAnnexA(row) {
  if (!row) return null;
  return {
    tenant_id: row.tenant_id,
    annex_a: row.annex_a,
    updated_at: row.updated_at,
    updated_by_user_id: row.updated_by_user_id,
  };
}

function shapeAsset(row) {
  if (!row) return null;
  return {
    sha256: row.sha256,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    storage_url: row.storage_url,
    source: row.source,
    generator_prompt: row.generator_prompt,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
  };
}

module.exports = {
  DEFAULT_TENANT_ID,
  stripSensitiveBudgetItem,
  shapeCounterparty,
  shapeProperty,
  shapeVendor,
  shapeLead,
  shapeProject,
  shapeStage,
  shapeDocument,
  shapeDecision,
  shapeActivity,
  shapeSiteVisit,
  shapeRoom,
  shapePhoto,
  shapePreferences,
  shapeRoughBudget,
  shapeAgreement,
  shapePaymentGate,
  shapeMoodboard,
  shapePack,
  shapeSelection,
  shapeChangeOrder,
  shapeBudgetItem,
  shapeCloseoutBinder,
  shapeTask,
  shapeApproval,
  shapeApprovalEvent,
  shapeMagicLink,
  shapePortalLog,
  shapeAnnexA,
  shapeAsset,
};
