-- 091_portal_tokens.sql
--
-- Portal v2 — slice 1 (claim endpoint). Mints an opaque `fsp_<rand>`
-- token when the friday-mu website calls `/api/public/threads/claim`
-- on form success. The token is the only thing the guest holds; the
-- portal resolver looks up its kind, thread/inquiry pointer, and
-- summary payload.
--
-- Idempotent on (tenant_id, kind, request_id): same request hitting
-- claim twice returns the existing token, never mints a second one.
-- This protects against double-clicks + retries + the website's own
-- best-effort recovery loop in lib/fad-client/portal-claim.ts.
--
-- Foreign keys land on either inbox_threads (most kinds) or
-- fad_inquiries (trip_inquiry). Per the website-side reply doc:
--
--   reservation        → inbox_threads + reservation via FK
--   booking_request    → inbox_threads + portal_booking_requests sidecar (mig 092)
--   contact            → inbox_threads (minimal)
--   trip_inquiry       → fad_inquiries
--   owner_enquiry      → inbox_threads (minimal)
--   experience_enquiry → inbox_threads (minimal)
--
-- The token is the source of truth for "what surface to render";
-- the joined thread/inquiry rows carry the actual content.

CREATE TABLE IF NOT EXISTS portal_tokens (
  token               TEXT PRIMARY KEY,
  tenant_id           UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                      REFERENCES tenants(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN (
                        'reservation', 'booking_request', 'contact',
                        'trip_inquiry', 'owner_enquiry', 'experience_enquiry'
                      )),
  request_id          TEXT NOT NULL,
  thread_id           UUID REFERENCES inbox_threads(id) ON DELETE SET NULL,
  inquiry_id          UUID REFERENCES fad_inquiries(id) ON DELETE SET NULL,
  guest_email         TEXT NOT NULL,
  guest_name          TEXT,
  guest_phone         TEXT,
  locale              TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fr')),
  -- The full original context payload from the website (listingSlug,
  -- listingTitle, subject, etc.). Kept verbatim so the resolver can
  -- build subjectLine + analytics without a second round-trip.
  context             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  last_resolved_at    TIMESTAMPTZ,
  CONSTRAINT portal_tokens_tenant_kind_request_unique
    UNIQUE (tenant_id, kind, request_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_tokens_thread
  ON portal_tokens(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_tokens_inquiry
  ON portal_tokens(inquiry_id) WHERE inquiry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_tokens_tenant_kind
  ON portal_tokens(tenant_id, kind);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_email
  ON portal_tokens(tenant_id, LOWER(guest_email));
