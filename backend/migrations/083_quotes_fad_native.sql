-- 083_quotes_fad_native.sql
--
-- Quote builder backend (T4.40 · Phase 7). Persists generated quote
-- links so we can track conversion (sent → opened → converted) without
-- relying on the recipient's email service to surface clicks.
--
-- v1 share_url points at the Friday Website Vercel preview with
-- ?codes=… query params; the website's existing search UI takes it from
-- there. v2 will mint a tenant-branded landing page.

CREATE TABLE IF NOT EXISTS fad_quotes (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                    UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                               REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id           TEXT,
  property_codes               TEXT[] NOT NULL,
  check_in                     DATE NOT NULL,
  check_out                    DATE NOT NULL,
  guests_adults                INTEGER NOT NULL DEFAULT 1,
  guests_children              INTEGER NOT NULL DEFAULT 0,
  share_url                    TEXT NOT NULL,
  expires_at                   TIMESTAMPTZ,
  status                       TEXT NOT NULL DEFAULT 'sent'
                               CHECK (status IN ('draft', 'sent', 'opened', 'converted', 'expired')),
  opened_at                    TIMESTAMPTZ,
  converted_reservation_id     UUID REFERENCES fad_reservations(id) ON DELETE SET NULL,
  metadata                     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fad_quotes_tenant_recent
  ON fad_quotes (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fad_quotes_tenant_status
  ON fad_quotes (tenant_id, status)
  WHERE status IN ('sent', 'opened');

DROP TRIGGER IF EXISTS trg_fad_quotes_updated_at ON fad_quotes;
CREATE TRIGGER trg_fad_quotes_updated_at
  BEFORE UPDATE ON fad_quotes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();
