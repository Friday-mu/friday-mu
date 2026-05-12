-- Migration 004 — add ip_address column to design_portal_log.
--
-- Captures client IP on every portal event so the legal-evidence audit
-- trail required by Notion scoping §B3.7 is complete. Existing rows have
-- no IP and stay NULL; backfill is not feasible.

ALTER TABLE design_portal_log
  ADD COLUMN IF NOT EXISTS ip_address INET;

CREATE INDEX IF NOT EXISTS idx_design_portal_log_ip
  ON design_portal_log(ip_address) WHERE ip_address IS NOT NULL;
