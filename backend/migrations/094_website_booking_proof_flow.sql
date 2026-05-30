-- 094_website_booking_proof_flow.sql
--
-- Friday Website booking/proof contract 2026-05-26.
--
-- Proof upload is evidence only. It means "proof received / verify
-- bank funds", not "funds received" and not "reservation confirmed".

ALTER TABLE fad_portal_booking_requests
  ADD COLUMN IF NOT EXISTS proof_url TEXT,
  ADD COLUMN IF NOT EXISTS proof_viewer_url TEXT,
  ADD COLUMN IF NOT EXISTS proof_file_name TEXT,
  ADD COLUMN IF NOT EXISTS proof_file_type TEXT,
  ADD COLUMN IF NOT EXISTS proof_file_size BIGINT,
  ADD COLUMN IF NOT EXISTS proof_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proof_source TEXT,
  ADD COLUMN IF NOT EXISTS proof_event_id UUID REFERENCES inbox_events(id) ON DELETE SET NULL;

ALTER TABLE fad_portal_booking_requests
  DROP CONSTRAINT IF EXISTS fad_portal_booking_requests_status_check;

ALTER TABLE fad_portal_booking_requests
  ADD CONSTRAINT fad_portal_booking_requests_status_check
  CHECK (status IN (
    'pending_review',
    'awaiting_payment',
    'proof_received',
    'confirmed',
    'declined'
  ));

CREATE INDEX IF NOT EXISTS idx_fad_portal_booking_requests_proof_event
  ON fad_portal_booking_requests(proof_event_id)
  WHERE proof_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fad_portal_booking_requests_request_thread
  ON fad_portal_booking_requests(tenant_id, request_id, thread_id);
