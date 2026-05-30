-- Migration 019 — MCB bank statement reconciliation (design-be-24).
--
-- The reconciliation stage (#17) gates "finalize budget" on full bank
-- reconciliation. Staff uploads MCB CSV statements; the matcher suggests
-- pairings against design_budget_items.actual_paid_minor; staff confirms
-- each match explicitly.
--
-- v1 scope: MCB only (bank_code = 'mcb'). The bank_code CHECK is open
-- ('mcb', 'maubank') so Maubank can be added by extending the check
-- constraint when needed — table reshape not required.
--
-- Amount sign convention: SIGNED minor units. Negative = debit (money
-- out), positive = credit (money in). UI displays absolute amounts with a
-- Debit / Credit badge.

-- Add actual_paid_minor to design_budget_items — the matcher needs an
-- "actual paid" amount to score against. Migration 002 modelled approved
-- cost (retail / negotiated) but not realised cash-out, so this column
-- gets seeded NULL and is populated by the expense-capture stage. The
-- matcher skips rows where actual_paid_minor IS NULL.
ALTER TABLE design_budget_items
  ADD COLUMN IF NOT EXISTS actual_paid_minor BIGINT;

CREATE TABLE IF NOT EXISTS design_bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  account_label TEXT NOT NULL,             -- 'MCB Operating', 'MCB Owner Escrow', etc.
  bank_code TEXT NOT NULL DEFAULT 'mcb',   -- discriminator for future Maubank/etc.
  statement_period_start DATE NOT NULL,
  statement_period_end DATE NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by_user_id UUID,
  raw_source_url TEXT,                     -- pointer to the uploaded PDF/CSV (storage abstraction is out of scope; this is just a URL)
  parse_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'parsed' | 'failed'
  parse_error TEXT,
  txn_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_bank_statements_parse_status_check CHECK (parse_status IN ('pending', 'parsed', 'failed')),
  CONSTRAINT design_bank_statements_bank_code_check CHECK (bank_code IN ('mcb', 'maubank'))
);
CREATE INDEX IF NOT EXISTS idx_design_bank_statements_project ON design_bank_statements(project_id);

CREATE TABLE IF NOT EXISTS design_bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES design_bank_statements(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  posted_date DATE NOT NULL,
  value_date DATE,
  amount_minor BIGINT NOT NULL,             -- signed; negative for debits (money out), positive for credits (money in)
  descriptor TEXT NOT NULL,                 -- raw bank descriptor, e.g. "PAYMENT TO COURTS LTD"
  reference TEXT,                            -- bank's reference field
  balance_minor BIGINT,                     -- running balance after this txn, if available
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_bank_transactions_statement ON design_bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_design_bank_transactions_project_date ON design_bank_transactions(project_id, posted_date);

CREATE TABLE IF NOT EXISTS design_bank_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  budget_item_id UUID NOT NULL REFERENCES design_budget_items(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES design_bank_transactions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'suggested',  -- 'suggested' | 'confirmed' | 'rejected'
  confidence NUMERIC(4,2),                    -- 0.00-1.00, the matching algorithm's score
  match_reason TEXT,                          -- human-readable: "date+amount+vendor match"
  confirmed_at TIMESTAMPTZ,
  confirmed_by_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_bank_matches_status_check CHECK (status IN ('suggested', 'confirmed', 'rejected')),
  -- A single transaction can have at most one row per status. In practice that
  -- means at most one suggested row + at most one confirmed row + at most one
  -- rejected row per transaction. Active reconciliation logic enforces "one
  -- active (non-rejected) match per transaction" at the application layer.
  CONSTRAINT design_bank_matches_unique_active UNIQUE (transaction_id, status)
);
CREATE INDEX IF NOT EXISTS idx_design_bank_matches_project ON design_bank_matches(project_id);
CREATE INDEX IF NOT EXISTS idx_design_bank_matches_budget_item ON design_bank_matches(budget_item_id);
