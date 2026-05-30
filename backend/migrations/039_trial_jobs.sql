-- 039_trial_jobs.sql
--
-- Trial-expiry enforcement scaffolding.
--
-- Adds:
--   1. tenants.subscription_status_changed_at — stamped by the trial-expiry
--      worker (backend/src/tenants/trial_jobs.js) every time it flips a
--      tenant's status. Lets us answer "how long has this tenant been past_due?"
--      cheaply (used for the 30-day safety-net cancellation) and gives support
--      a quick lifecycle audit trail without spinning up a separate events table.
--
--   2. trial_reminders_sent — dedupe ledger for the trial-ending-soon emails
--      the worker fires. Composite PK on (tenant_id, reminder_kind) means
--      "ON CONFLICT DO NOTHING" is the cheapest way to enforce "once per kind
--      per tenant". reminder_kind is free-text today ('trial_ending_3d', etc.)
--      so we can add new reminder cadences without a schema migration.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS subscription_status_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS trial_reminders_sent (
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reminder_kind  TEXT        NOT NULL,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, reminder_kind)
);

-- Index for the worker's "find tenants needing reminders" scan — filters
-- on sent_at to honour the 24h rate-limit even if reminder_kind changes.
CREATE INDEX IF NOT EXISTS trial_reminders_sent_sent_at_idx
  ON trial_reminders_sent (sent_at);
