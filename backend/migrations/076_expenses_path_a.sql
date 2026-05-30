-- 076 — Expense capture, Path A (from a Task).
--
-- Minimum viable subset of the locked FAD Finance capture form design
-- (Notion 34e43ca8849281fa8085f120b211c689). Targets Ishant's request
-- 2026-05-23: "every Task that likely has an expense attached should
-- have an expense capture thing." Path B (admin direct entry) reuses
-- the same `expenses` table but is deferred to a later slice — only
-- the Path A columns + the receipt OCR plumbing land here.
--
-- Deferred to subsequent slices:
--   - recurring_expenses (Path B feature)
--   - category_billto_defaults (Path A computes inline from category)
--   - labour_rates (internal labour rate-card; Phase 1.5 per design)
--   - DO Spaces storage backend (receipts inline-base64 for now)
--   - exceeded_user_cap + spending_authority_cap_minor (audit slice)
--   - vendor autocomplete seeding (needs Mary's CSV)
--
-- Multi-tenant: tenant_id defaults to FR for the seed but every row
-- carries it so future tenants land in their own slice.

BEGIN;

-- ─── expense_categories ─────────────────────────────────────────────
-- Static reference table seeded with the minimum FR set. Extending it
-- is a SQL UPDATE — no migration needed.
CREATE TABLE IF NOT EXISTS expense_categories (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_bill_to TEXT NOT NULL DEFAULT 'internal_fr',
  applies_to_path TEXT NOT NULL DEFAULT 'both'
    CHECK (applies_to_path IN ('path_a', 'path_b', 'both')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO expense_categories (code, name, default_bill_to, applies_to_path, sort_order) VALUES
  ('FR-OPS-CLEAN',  'Cleaning supplies',       'internal_fr', 'both',   10),
  ('FR-OPS-MAINT',  'Maintenance / repairs',   'internal_fr', 'both',   20),
  ('FR-OPS-GARDEN', 'Garden / pool',           'internal_fr', 'both',   30),
  ('FR-OPS-CONSUM', 'Consumables / amenities', 'internal_fr', 'both',   40),
  ('FR-OPS-FUEL',   'Fuel / petrol',           'internal_fr', 'both',   50),
  ('FR-OPS-OTHER',  'Other operations',        'internal_fr', 'both',   90),
  ('FR-ADM-SAAS',   'Software / SaaS',         'internal_fr', 'path_b', 100),
  ('FR-ADM-LEGAL',  'Legal / accounting',      'internal_fr', 'path_b', 110),
  ('FR-ADM-BANK',   'Bank fees',               'internal_fr', 'path_b', 120),
  ('FR-ADM-INSUR',  'Insurance',               'internal_fr', 'path_b', 130),
  ('FR-ADM-OTHER',  'Other admin',             'internal_fr', 'path_b', 190)
ON CONFLICT (code) DO NOTHING;

-- ─── vendors ────────────────────────────────────────────────────────
-- Minimal table. Autocomplete + alternate_names dedup come in a later
-- slice once Mary's CSV is imported.
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  canonical_name TEXT NOT NULL,
  alternate_names TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_tenant_name ON vendors (tenant_id, canonical_name);

-- ─── expenses ───────────────────────────────────────────────────────
-- Path A focus. Path B columns (recurring_parent_id, etc.) are added
-- in the next slice when the Path B drawer ships.
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  entity_id TEXT NOT NULL DEFAULT 'FR',
  entry_mode TEXT NOT NULL CHECK (entry_mode IN ('path_a', 'path_b')),

  -- Path A linkage (required when entry_mode='path_a'; NULL for path_b).
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  -- Property context. Auto-populated from task in Path A; optional + manual in Path B.
  property_code TEXT,

  -- Vendor — either FK to canonical OR a free-text name when the operator
  -- types something we don't have. vendor_unrecognized = TRUE flags it
  -- for Manager triage later.
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name_freetext TEXT,
  vendor_unrecognized BOOLEAN NOT NULL DEFAULT FALSE,

  -- Amount in minor units (cents). MUR/EUR/USD only per locked design.
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'MUR' CHECK (currency IN ('MUR', 'EUR', 'USD')),

  -- Category drives default_bill_to + approval rules downstream.
  category_code TEXT NOT NULL REFERENCES expense_categories(code),

  -- Bill-to chip. Smart default from category; overridden flag is audit only.
  bill_to TEXT NOT NULL DEFAULT 'internal_fr',
  bill_to_overridden BOOLEAN NOT NULL DEFAULT FALSE,

  description TEXT NOT NULL,

  -- Internal labour (Bryan / maintenance toggle). When present, vendor +
  -- receipt are not required — the entry represents in-house hours.
  labour_hours_numeric NUMERIC(8,2),
  labour_work_type TEXT,

  -- State machine per locked design. Defaults to 'submitted' for v1 (we'll
  -- add approval routing in slice 3).
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft','submitted','pending_approval','approved','rejected','posted')),

  -- Audit
  capturer_user_id UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Vendor OR labour: one of the two paths must be filled.
  CONSTRAINT expenses_vendor_or_labour CHECK (
    vendor_id IS NOT NULL
    OR vendor_name_freetext IS NOT NULL
    OR labour_hours_numeric IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_expenses_task     ON expenses(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_property ON expenses(property_code);
CREATE INDEX IF NOT EXISTS idx_expenses_status   ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant   ON expenses(tenant_id, created_at DESC);

-- ─── expense_receipts ───────────────────────────────────────────────
-- Receipt storage metadata. storage_kind='inline_base64' for now —
-- swap to 'do_spaces' once the bucket lands in a future slice.
CREATE TABLE IF NOT EXISTS expense_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  storage_kind TEXT NOT NULL DEFAULT 'inline_base64'
    CHECK (storage_kind IN ('inline_base64', 'do_spaces')),
  storage_ref TEXT,    -- DO Spaces key when storage_kind='do_spaces'
  inline_base64 TEXT,  -- raw bytes when storage_kind='inline_base64'
  file_name TEXT,
  content_type TEXT,
  byte_size INTEGER,
  sha256_hash TEXT NOT NULL,
  ocr_extracted JSONB,  -- Last LLM OCR output (vendor / amount / date / line items)
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT receipts_storage_data CHECK (
    (storage_kind = 'inline_base64' AND inline_base64 IS NOT NULL) OR
    (storage_kind = 'do_spaces' AND storage_ref IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_receipts_expense ON expense_receipts(expense_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_hash_per_expense
  ON expense_receipts(expense_id, sha256_hash);

COMMIT;
