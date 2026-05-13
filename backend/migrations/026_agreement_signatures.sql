-- Migration 026 — in-portal digital signing (Tier A pilot blocker #3).
--
-- Owners receive a magic-link to the agreement preview at
-- /portal/projects/:slug. v0.1 lets them only view the agreement.
-- This migration backs the signature workflow:
--
--   1. Owner draws their signature on a canvas (and optionally types
--      initials per page).
--   2. Frontend POSTs the signature as a data:URL + the owner's
--      typed name + IP/User-Agent to the portal endpoint.
--   3. Backend writes a design_agreement_signatures row tying the
--      signature image + audit metadata to the agreement.
--   4. Agreement row gets status='signed_by_client' + signed_at
--      timestamp via the same handler, atomic in one transaction.
--
-- The evidence bundle (PDF the agreement + audit metadata) is rendered
-- on-demand from the row at /api/design/agreements/:id/evidence-pdf
-- (server-side rendering, not stored — re-deriving is cheap and keeps
-- the row size small).

-- Note: design_agreements has no separate `id` column — its PK is
-- project_id (one agreement per project). So the signature row links
-- by project_id only; agreement_project_id is the FK and the table
-- has at most one ACTIVE row per project (see unique index below).
CREATE TABLE IF NOT EXISTS design_agreement_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_project_id UUID NOT NULL REFERENCES design_agreements(project_id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  -- Signature image as a data:URL (image/png base64) — the canvas
  -- bitmap is small (typically < 50 KB) so storing inline is fine.
  -- If volume grows, migrate to S3 + url column.
  signature_data_url TEXT NOT NULL,
  -- Typed full name — owner re-types their legal name as a second
  -- factor of intent (industry-standard "click-to-sign" doesn't have
  -- this; we add it for a stronger audit trail).
  typed_name TEXT NOT NULL,
  -- Owner's email at the time of signing — captured from the magic-
  -- link context, NOT user-supplied at sign time. Pins the signing
  -- party even if the counterparty record is later renamed.
  owner_email TEXT,
  owner_name TEXT,
  -- Audit metadata.
  ip_address INET,
  user_agent TEXT,
  -- Token used to sign (for traceability — which magic link issued
  -- the session). NOT a credential, just an audit pointer.
  magic_link_id UUID REFERENCES design_magic_links(id) ON DELETE SET NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Free-form audit notes. Reserved for incident response (e.g.,
  -- "voided by Ishant — see ticket FRD-42").
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One signed-state per agreement. If a second signature is needed
-- (e.g., owner re-signs after amendment), we'd void+re-issue rather
-- than allow multiple signatures on the same agreement_id. Partial
-- unique index — voided rows are excluded so the constraint doesn't
-- block a legitimate re-sign cycle.
CREATE UNIQUE INDEX IF NOT EXISTS uq_design_agreement_signatures_active
  ON design_agreement_signatures(agreement_project_id)
  WHERE notes IS NULL OR notes NOT LIKE 'VOIDED:%';

CREATE INDEX IF NOT EXISTS idx_design_agreement_signatures_project
  ON design_agreement_signatures(project_id, signed_at DESC);
