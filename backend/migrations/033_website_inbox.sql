-- Migration 033 — friday.mu website inbox + Guesty orchestration.
--
-- See spec from Ishant 2026-05-14: friday.mu (public site, separate
-- repo) will POST customer events here. We normalise to one THREAD per
-- guest email + many EVENTS, then on booking.proof_uploaded
-- auto-create a 48h-expiring Guesty reservation. Ops marks-paid in
-- FAD → we flip the Guesty status to confirmed + send a Resend email.
-- DLQ table covers Guesty downtime so we never lose proof-uploaded
-- events.
--
-- This is INDEPENDENT of the GMS-owned conversations / messages
-- tables. GMS still owns guest messaging via Guesty polling; this
-- table is for inbound from our own website.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────── inbox_threads ─────────────────────
-- One row per (lower) guest_email. Multiple website events from the
-- same guest fold into one thread. last_event_at sorts the list view.
CREATE TABLE IF NOT EXISTS inbox_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lower-cased guest email — the natural collapse key. Stored as-typed
  -- in `guest_email_raw` so we can display the original casing if
  -- needed; the lookup unique index uses LOWER().
  guest_email TEXT NOT NULL,
  guest_email_raw TEXT,
  guest_name TEXT,
  guest_phone TEXT,

  -- Lifecycle: open (new) → in_progress (ops looking) → paid (Guesty
  -- confirmed + email sent) → closed (archived). We don't model
  -- intermediate Guesty states here; that's tracked on the row below.
  status TEXT NOT NULL DEFAULT 'open',

  -- Headline for the list view — last event's type + when it landed.
  last_event_type TEXT,
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Auto-created Guesty reservation (booking.proof_uploaded path).
  -- guesty_listing_id mirrors the listing we mapped on the slug so we
  -- don't have to re-resolve it later.
  guesty_reservation_id TEXT,
  guesty_listing_id TEXT,
  guesty_reservation_status TEXT,
  guesty_expiration_at TIMESTAMPTZ,

  -- When ops marked paid + by whom. Drives the confirmed-status flip
  -- on Guesty + the Resend confirmation email.
  paid_at TIMESTAMPTZ,
  paid_by_user_id UUID,
  paid_by_display_name TEXT,

  -- Free-form notes from ops (assigned-to, context, follow-up).
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inbox_threads_status_check
    CHECK (status IN ('open', 'in_progress', 'paid', 'closed'))
);

-- Email is the collapse key. UNIQUE on the lower-cased form so two
-- events from the same email (with different casing) hit the same row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_threads_email_unique
  ON inbox_threads(LOWER(guest_email));

-- The list view sorts by last_event_at DESC within status — partial
-- index keeps the open / in-progress page snappy as the closed
-- archive grows.
CREATE INDEX IF NOT EXISTS idx_inbox_threads_active_recent
  ON inbox_threads(last_event_at DESC)
  WHERE status IN ('open', 'in_progress');


-- ───────────────────── inbox_events ─────────────────────
-- Append-only event log per thread. Each event from friday.mu (or
-- future sources) lands here. The webhook handler dedups on
-- (reference, event_type) for idempotency.
CREATE TABLE IF NOT EXISTS inbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,

  -- friday.mu's own reference (FBR-XXXX-XXXX, FE-XXXX-XXXX, etc.).
  -- We use it as the idempotency key together with event_type.
  reference TEXT,

  -- 'booking.request_submitted' | 'booking.proof_uploaded' |
  -- 'experience.enquiry_submitted' | 'contact.form_submitted' |
  -- 'owner.enquiry_submitted'. Open set — future sources (WhatsApp,
  -- email) will add more.
  event_type TEXT NOT NULL,

  -- Origin label rendered in the inbox row chip.
  source TEXT NOT NULL DEFAULT 'website',

  -- Raw payload exactly as it arrived. Side panel renders this.
  payload JSONB NOT NULL,

  -- HMAC signature as received — kept for audit / debugging.
  signature TEXT,
  -- Timestamp from the X-Friday-Inbox-Timestamp header (anti-replay).
  signed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_events_thread_recent
  ON inbox_events(thread_id, created_at DESC);

-- Idempotency. Two webhooks with the same (reference, event_type) =
-- a retry, not a new event. Partial index because reference can be
-- NULL on event types that don't carry one (contact.form_submitted,
-- owner.enquiry_submitted).
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_events_dedup
  ON inbox_events(reference, event_type)
  WHERE reference IS NOT NULL;


-- ───────────────────── inbox_guesty_jobs ─────────────────────
-- DLQ / retry queue for Guesty API calls. We never want to lose a
-- proof-uploaded event because Guesty was slow; the webhook returns
-- 200 once the event is persisted, and a background worker drains
-- this queue with exponential backoff.
CREATE TABLE IF NOT EXISTS inbox_guesty_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
  event_id UUID REFERENCES inbox_events(id) ON DELETE SET NULL,

  -- 'create_reservation' | 'confirm_reservation'
  job_type TEXT NOT NULL,

  -- pending → running → succeeded | failed (retry) | dead (gave up)
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,

  -- Snapshot of what to send to Guesty. We don't re-derive from the
  -- event on retry because the underlying property mapping could
  -- change between attempts.
  payload JSONB NOT NULL,
  -- Guesty's response on success.
  result JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inbox_guesty_jobs_status_check
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'dead')),
  CONSTRAINT inbox_guesty_jobs_type_check
    CHECK (job_type IN ('create_reservation', 'confirm_reservation'))
);

-- Worker query: pull pending/failed jobs whose next_attempt is due.
CREATE INDEX IF NOT EXISTS idx_inbox_guesty_jobs_due
  ON inbox_guesty_jobs(next_attempt_at)
  WHERE status IN ('pending', 'failed');
