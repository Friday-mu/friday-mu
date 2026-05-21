-- Migration 002 — FAD-owned Design module tables.
--
-- Friday Design OS (entity_id = 'FD') runs on the same shared gmsdb as HR
-- and the eventual GMS shutdown leaves these tables in place. Every
-- design_* table is FAD-owned: only FAD's backend reads/writes them.
--
-- Schema mirrors `frontend/src/app/fad/_data/design.ts` types so the
-- frontend swap in design-be-6 is a mechanical adapter pass, not a data
-- model refactor. Money in BIGINT minor units (MUR cents). Flexible
-- nested shapes (annex B schedules, line items, preferences, etc.) live
-- in JSONB so the schema is forward-compatible with v0.2 tweaks.
--
-- Tracked in fad_schema_migrations alongside 001_hr_tables.sql.

-- ─────────────────────────── REFERENCE DATA ───────────────────────────

CREATE TABLE IF NOT EXISTS design_counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  entity_id TEXT NOT NULL DEFAULT 'FD',
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_counterparties_tenant ON design_counterparties(tenant_id);

CREATE TABLE IF NOT EXISTS design_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  entity_id TEXT NOT NULL DEFAULT 'FD',
  counterparty_id UUID REFERENCES design_counterparties(id) ON DELETE SET NULL,
  -- Optional link to a Guesty listing when the same property is rental-managed.
  guesty_listing_id TEXT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zipcode TEXT,
  sqft INTEGER,
  construction_type TEXT,
  year_built INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_properties_tenant ON design_properties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_design_properties_counterparty ON design_properties(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_design_properties_guesty ON design_properties(guesty_listing_id) WHERE guesty_listing_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS design_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  entity_id TEXT NOT NULL DEFAULT 'FD',
  name TEXT NOT NULL,
  category TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_vendors_tenant ON design_vendors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_design_vendors_category ON design_vendors(tenant_id, category);

CREATE TABLE IF NOT EXISTS design_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  entity_id TEXT NOT NULL DEFAULT 'FD',
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT,         -- 'friday_outreach' | 'owner_referral' | 'website' | 'whatsapp' | 'existing_owner' | 'walk_in' | 'other'
  status TEXT NOT NULL DEFAULT 'lead', -- 'lead' | 'qualified' | 'converted' | 'lost'
  owner_user_id UUID,
  converted_project_id UUID,  -- set when status='converted'
  staleness_days INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_leads_status_check CHECK (status IN ('lead', 'qualified', 'converted', 'lost'))
);
CREATE INDEX IF NOT EXISTS idx_design_leads_tenant ON design_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_design_leads_status ON design_leads(tenant_id, status);

-- ─────────────────────────── PROJECT CORE ───────────────────────────

CREATE TABLE IF NOT EXISTS design_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  entity_id TEXT NOT NULL DEFAULT 'FD',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  counterparty_id UUID REFERENCES design_counterparties(id) ON DELETE SET NULL,
  property_id UUID REFERENCES design_properties(id) ON DELETE SET NULL,
  -- Classification & fees
  classification TEXT,           -- 'renovation' | 'furnishing' | 'mixed'
  tier INTEGER,                  -- 1 | 2 | 3
  lead_source TEXT,
  epc_minor BIGINT,              -- estimated project cost (minor units)
  design_fee_minor BIGINT,
  procurement_fee_minor BIGINT,
  budget_expectation_minor BIGINT,
  -- Brief
  goals TEXT[] NOT NULL DEFAULT '{}',
  outcomes TEXT[] NOT NULL DEFAULT '{}',
  urgency TEXT,
  pm_link TEXT,
  design_lead_user_id UUID,
  -- Workflow state
  current_stage TEXT NOT NULL DEFAULT 'lead',
  stage_status TEXT NOT NULL DEFAULT 'pending',
  blocker TEXT,
  next_action TEXT,
  -- Lifecycle (orthogonal to stage)
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  paused_at TIMESTAMPTZ,
  paused_reason TEXT,
  paused_by_user_id UUID,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  cancelled_by_user_id UUID,
  cancel_transfer_to_inventory BOOLEAN,
  -- Dates
  start_date DATE,
  estimated_completion DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_projects_lifecycle_check CHECK (lifecycle_status IN ('active', 'paused', 'cancelled')),
  CONSTRAINT design_projects_classification_check CHECK (classification IS NULL OR classification IN ('renovation', 'furnishing', 'mixed')),
  CONSTRAINT design_projects_tier_check CHECK (tier IS NULL OR tier IN (1, 2, 3))
);
CREATE INDEX IF NOT EXISTS idx_design_projects_tenant ON design_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_design_projects_slug ON design_projects(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_design_projects_lifecycle ON design_projects(tenant_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_design_projects_stage ON design_projects(tenant_id, current_stage);
CREATE INDEX IF NOT EXISTS idx_design_projects_counterparty ON design_projects(counterparty_id);

-- Add the FK from leads to projects now that both exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'design_leads_converted_project_fk'
  ) THEN
    ALTER TABLE design_leads
      ADD CONSTRAINT design_leads_converted_project_fk
      FOREIGN KEY (converted_project_id) REFERENCES design_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Per-project stage state. Sparse — only rows for stages that have been
-- touched. Fresh project = no rows; current_stage on the project carries
-- the cursor. A stage row appears when entered, updated when status changes.
CREATE TABLE IF NOT EXISTS design_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL,         -- StageId from fixture (17 stages)
  status TEXT NOT NULL DEFAULT 'pending',
  entered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  owner_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_stages_status_check CHECK (status IN ('pending', 'in-progress', 'waiting-on-owner', 'blocked', 'done', 'skipped')),
  CONSTRAINT design_stages_unique UNIQUE (project_id, stage_key)
);
CREATE INDEX IF NOT EXISTS idx_design_stages_project ON design_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_design_stages_status ON design_stages(project_id, status);

-- Documents (drawings, contracts, quotes, signed annexes). Stored as URL
-- refs — actual blob storage is external (S3/etc) and out of scope for v0.1.
CREATE TABLE IF NOT EXISTS design_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,           -- 'drawing' | 'quote' | 'contract' | 'annex' | 'photo' | 'other'
  name TEXT NOT NULL,
  url TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  signed_by UUID,
  signed_at TIMESTAMPTZ,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_documents_project ON design_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_design_documents_type ON design_documents(project_id, doc_type);

-- Decisions log — material picks, room moves, exemptions. JSONB value is
-- the decision payload (free-shape per decision_key).
CREATE TABLE IF NOT EXISTS design_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  decision_key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by UUID
);
CREATE INDEX IF NOT EXISTS idx_design_decisions_project ON design_decisions(project_id);

-- Activity feed — per-project audit trail. Used for the owner portal
-- "Activity" tab and the internal project changelog.
CREATE TABLE IF NOT EXISTS design_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  actor_user_id UUID,
  actor_name TEXT,         -- denormalised for owner-portal display when user_id is internal-only
  action TEXT NOT NULL,    -- 'project.created' | 'stage.entered' | 'moodboard.sent' | etc
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility TEXT NOT NULL DEFAULT 'internal',  -- 'internal' | 'portal' (owner-visible)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_activities_visibility_check CHECK (visibility IN ('internal', 'portal'))
);
CREATE INDEX IF NOT EXISTS idx_design_activities_project ON design_activities(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_activities_portal ON design_activities(project_id, visibility, created_at DESC);

-- ─────────────────────────── BRIEF & DISCOVERY ───────────────────────────

CREATE TABLE IF NOT EXISTS design_site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  duration_min INTEGER,
  attendees TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  photos_collected INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_site_visits_project ON design_site_visits(project_id, visit_date DESC);

CREATE TABLE IF NOT EXISTS design_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES design_properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sqft INTEGER,
  usage_kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_rooms_property ON design_rooms(property_id);

CREATE TABLE IF NOT EXISTS design_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  room_id UUID REFERENCES design_rooms(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,            -- 'exterior' | 'interior' | 'detail' | 'concept' | 'as-built'
  caption TEXT,
  url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_photos_kind_check CHECK (kind IN ('exterior', 'interior', 'detail', 'concept', 'as-built'))
);
CREATE INDEX IF NOT EXISTS idx_design_photos_project ON design_photos(project_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_photos_room ON design_photos(room_id) WHERE room_id IS NOT NULL;

-- Preferences — 16 areas (palette, lighting, layout, furnishing, ...) per
-- fixture. Stored as a single JSONB blob keyed by area, since the shape
-- evolves. One row per project (PK is project_id).
CREATE TABLE IF NOT EXISTS design_preferences (
  project_id UUID PRIMARY KEY REFERENCES design_projects(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS design_rough_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  category_code TEXT,
  description TEXT,
  unit_cost_minor BIGINT,
  quantity NUMERIC(12, 2),
  notes TEXT,
  catalog_source_id UUID,    -- self-ref to a previous budget item, used by "where used" lookups
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_rough_budgets_project ON design_rough_budgets(project_id);
CREATE INDEX IF NOT EXISTS idx_design_rough_budgets_catalog ON design_rough_budgets(catalog_source_id) WHERE catalog_source_id IS NOT NULL;

-- ─────────────────────────── AGREEMENT & PAYMENT ───────────────────────────

-- One agreement per project (PK is project_id).
CREATE TABLE IF NOT EXISTS design_agreements (
  project_id UUID PRIMARY KEY REFERENCES design_projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signed_by UUID,
  design_fee_percent NUMERIC(5, 2),
  procurement_fee_percent NUMERIC(5, 2),
  contingency_percent NUMERIC(5, 2),
  annex_b JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_agreements_status_check CHECK (status IN ('draft', 'sent', 'signed', 'voided'))
);

-- 7 gate types per fixture: agreement_signed, design_fee_60, design_fee_40,
-- execution_fee_t1, execution_fee_t2, project_funds, final_balance.
CREATE TABLE IF NOT EXISTS design_payment_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  gate_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_minor BIGINT,
  due_date DATE,
  received_at TIMESTAMPTZ,
  received_amount_minor BIGINT,
  received_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_payment_gates_status_check CHECK (status IN ('pending', 'received', 'waived')),
  CONSTRAINT design_payment_gates_unique UNIQUE (project_id, gate_id)
);
CREATE INDEX IF NOT EXISTS idx_design_payment_gates_project ON design_payment_gates(project_id);

-- ─────────────────────────── DESIGN ARTIFACTS ───────────────────────────

CREATE TABLE IF NOT EXISTS design_moodboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  name TEXT,
  links JSONB NOT NULL DEFAULT '[]'::jsonb,    -- array of {url, caption, image_id?}
  notes TEXT,
  sent_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_moodboards_status_check CHECK (status IN ('draft', 'sent', 'approved', 'changes_requested')),
  CONSTRAINT design_moodboards_version_unique UNIQUE (project_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_design_moodboards_project ON design_moodboards(project_id);

CREATE TABLE IF NOT EXISTS design_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  room_label TEXT,
  pdf_url TEXT,
  image_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_packs_status_check CHECK (status IN ('draft', 'sent', 'approved', 'changes_requested')),
  CONSTRAINT design_packs_version_unique UNIQUE (project_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_design_packs_project ON design_packs(project_id);

-- Owner picker. Options stored as JSONB array of {id, description,
-- vendor_id?, cost_minor, estimated_delivery?}.
CREATE TABLE IF NOT EXISTS design_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES design_packs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  picked_option_id TEXT,
  change_request_comment TEXT,
  sent_at TIMESTAMPTZ,
  picked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_selections_status_check CHECK (status IN ('draft', 'sent', 'picked', 'changes_requested'))
);
CREATE INDEX IF NOT EXISTS idx_design_selections_project ON design_selections(project_id);

-- Scope deltas — line_items as JSONB so frontend can author the array
-- and we don't shard into a child table for v0.1.
CREATE TABLE IF NOT EXISTS design_change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT,
  sent_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  decided_by UUID,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_change_orders_status_check CHECK (status IN ('draft', 'sent', 'approved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS idx_design_change_orders_project ON design_change_orders(project_id);

-- Budget line items — full procurement detail. retail_cost / negotiated_cost
-- / internal_work are owner-stripped on the portal read paths (B3.1 disclosure).
CREATE TABLE IF NOT EXISTS design_budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  stage_key TEXT,
  category_code TEXT,
  description TEXT,
  unit_cost_minor BIGINT,
  quantity NUMERIC(12, 2),
  retail_cost_minor BIGINT,
  negotiated_cost_minor BIGINT,
  internal_work BOOLEAN NOT NULL DEFAULT FALSE,
  vendor_id UUID REFERENCES design_vendors(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_budget_items_project ON design_budget_items(project_id);
CREATE INDEX IF NOT EXISTS idx_design_budget_items_vendor ON design_budget_items(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_design_budget_items_category ON design_budget_items(project_id, category_code);

-- One closeout binder per project. warranties/maintenance/snags as JSONB
-- arrays — schema evolves per real-world workflow.
CREATE TABLE IF NOT EXISTS design_closeout_binders (
  project_id UUID PRIMARY KEY REFERENCES design_projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  warranties JSONB NOT NULL DEFAULT '[]'::jsonb,
  maintenance JSONB NOT NULL DEFAULT '[]'::jsonb,
  snags JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ,
  sign_off_at TIMESTAMPTZ,
  signed_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_closeout_binders_status_check CHECK (status IN ('draft', 'sent', 'signed'))
);

-- ─────────────────────────── TASKS & APPROVALS ───────────────────────────

CREATE TABLE IF NOT EXISTS design_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  stage_key TEXT,
  title TEXT NOT NULL,
  assignee_user_id UUID,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'todo',
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_tasks_status_check CHECK (status IN ('todo', 'in_progress', 'blocked', 'done'))
);
CREATE INDEX IF NOT EXISTS idx_design_tasks_project ON design_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_design_tasks_assignee ON design_tasks(assignee_user_id) WHERE assignee_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS design_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,           -- 'selection' | 'change_order' | 'agreement' | 'moodboard' | 'design_pack' | 'closeout'
  target_id UUID NOT NULL,      -- FK to one of the above tables (polymorphic, no DB constraint)
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  respondent_user_id UUID,
  respondent_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  CONSTRAINT design_approvals_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  CONSTRAINT design_approvals_type_check CHECK (type IN ('selection', 'change_order', 'agreement', 'moodboard', 'design_pack', 'closeout'))
);
CREATE INDEX IF NOT EXISTS idx_design_approvals_project ON design_approvals(project_id, status);
CREATE INDEX IF NOT EXISTS idx_design_approvals_target ON design_approvals(target_id);

CREATE TABLE IF NOT EXISTS design_approval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES design_approvals(id) ON DELETE CASCADE,
  respondent_user_id UUID,
  respondent_name TEXT,
  decision TEXT NOT NULL,
  comment TEXT,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_approval_events_decision_check CHECK (decision IN ('approved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS idx_design_approval_events_approval ON design_approval_events(approval_id);

-- ─────────────────────────── PORTAL ───────────────────────────

-- Magic-link tokens. v0.1: HS256 JWT minted in-process; only the hash
-- stored here for revocation tracking. v0.2 wires real expiry + rotation.
CREATE TABLE IF NOT EXISTS design_magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  issued_by_user_id UUID,
  delivery_channel TEXT,        -- 'whatsapp' | 'email' | 'manual'
  CONSTRAINT design_magic_links_token_hash_unique UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS idx_design_magic_links_project ON design_magic_links(project_id);

-- Portal activity (views, comments, approvals). Separate from internal
-- design_activities so portal traffic doesn't pollute the staff feed.
CREATE TABLE IF NOT EXISTS design_portal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,        -- 'view' | 'comment' | 'approval' | 'download'
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  magic_link_id UUID REFERENCES design_magic_links(id) ON DELETE SET NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_portal_log_project ON design_portal_log(project_id, created_at DESC);

-- ─────────────────────────── SETTINGS ───────────────────────────

-- Annex A — fee/tier reference data editable by director. Single row per
-- tenant; updates are retroactive (the live config is what's read by every
-- project's fee calculator).
CREATE TABLE IF NOT EXISTS design_annex_a (
  tenant_id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  annex_a JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID
);

-- ─────────────────────────── ASSETS (image dedup) ───────────────────────────

-- sha256-keyed asset table. Nanobanana-generated images + uploaded photos
-- both land here. v0.1: just refs (no actual storage backend wired);
-- design-be-7 wires Nanobanana once API key arrives.
CREATE TABLE IF NOT EXISTS design_assets (
  sha256 TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  mime_type TEXT,
  byte_size BIGINT,
  storage_url TEXT,
  source TEXT,             -- 'upload' | 'nanobanana' | 'external'
  generator_prompt TEXT,   -- only set for source='nanobanana'
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_assets_tenant ON design_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_design_assets_source ON design_assets(tenant_id, source);
