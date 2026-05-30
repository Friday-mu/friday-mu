-- Migration 006 — two-ledger split on design_payment_gates
--
-- The Notion FAD scoping pack v0.1 (LOCKED) defines TWO distinct ledgers
-- that the current schema conflates into a single table:
--
--   1. fee_invoice — Friday revenue: design fee + procurement fee, billable
--      per Annex A milestones (agreement_signed, design_fee_60/40,
--      execution_fee_t1/t2, final_balance). One row per (project, gate),
--      moving pending → received | waived.
--
--   2. project_fund — Owner-deposited EPC funds held in escrow, debited as
--      expenses post (gate_id = 'project_funds'). NOT Friday revenue — it
--      is the owner's money parked with Friday for procurement. Append-only:
--      top-ups (credit) + drawdowns (debit), many rows per project.
--
-- This migration is additive: no rows are dropped, no columns are renamed.
-- The existing UNIQUE(project_id, gate_id) constraint moves to a PARTIAL
-- index that only covers fee_invoice rows, allowing many project_fund
-- movement rows per project (top-ups, drawdowns).
--
-- Reconciliation report at handover joins both ledgers via the new
-- /reconciliation endpoint (see backend/src/design/payment_gates.js).

-- ledger_type — partitions the table into the two ledgers above.
ALTER TABLE design_payment_gates
  ADD COLUMN IF NOT EXISTS ledger_type TEXT NOT NULL DEFAULT 'fee_invoice';

ALTER TABLE design_payment_gates
  DROP CONSTRAINT IF EXISTS design_payment_gates_ledger_type_check;

ALTER TABLE design_payment_gates
  ADD CONSTRAINT design_payment_gates_ledger_type_check
  CHECK (ledger_type IN ('fee_invoice', 'project_fund'));

-- direction — used by the reconciliation rollup. fee_invoice rows are
-- always credit (Friday earning revenue). project_fund top-ups are credit
-- (owner depositing) and drawdowns are debit (procurement spending it).
ALTER TABLE design_payment_gates
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'credit';

ALTER TABLE design_payment_gates
  DROP CONSTRAINT IF EXISTS design_payment_gates_direction_check;

ALTER TABLE design_payment_gates
  ADD CONSTRAINT design_payment_gates_direction_check
  CHECK (direction IN ('debit', 'credit'));

-- Backfill: existing rows with gate_id = 'project_funds' belong to the
-- project_fund ledger; everything else stays fee_invoice (the column
-- default). Direction stays 'credit' for both — existing project_funds
-- rows in seed data represent owner deposits, not drawdowns.
UPDATE design_payment_gates
SET ledger_type = 'project_fund'
WHERE gate_id = 'project_funds'
  AND ledger_type = 'fee_invoice';

-- Drop the old whole-table unique constraint. project_fund movements need
-- multiple rows per (project_id, gate_id='project_funds'); fee_invoice
-- gates remain unique via the partial index below.
ALTER TABLE design_payment_gates
  DROP CONSTRAINT IF EXISTS design_payment_gates_unique;

-- Partial unique index — fee_invoice gates only. Keeps the idempotent
-- upsert behaviour of PUT /payment_gates/:project_id/:gate_id intact
-- while letting project_fund stay append-only.
CREATE UNIQUE INDEX IF NOT EXISTS design_payment_gates_fee_invoice_unique
  ON design_payment_gates (project_id, gate_id)
  WHERE ledger_type = 'fee_invoice';

-- Lookup index for the reconciliation rollup (filters by project_id +
-- ledger_type heavily).
CREATE INDEX IF NOT EXISTS idx_design_payment_gates_ledger
  ON design_payment_gates (project_id, ledger_type);
