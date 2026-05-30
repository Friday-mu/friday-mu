'use strict';

// Trial-expiry worker.
//
// Runs every hour inside the fad-backend process. Three responsibilities,
// each independent and idempotent so a missed tick (process restart,
// interval skew) self-heals on the next pass:
//
//   1. EXPIRY              — trial whose trial_ends_at is in the past
//                            → flip subscription_status to 'past_due'
//   2. REMINDERS           — trial ending within the next 3 days,
//                            no reminder fired in the last 24h
//                            → send tplTrialEndingSoon via the email
//                              module (wave B2 — dynamic require, no-op
//                              if email isn't wired yet)
//   3. SAFETY-NET CANCEL   — past_due for ≥30 days
//                            → flip to 'cancelled'. Stops a never-paying
//                              tenant from sitting in past_due forever.
//
// Every status flip stamps tenants.subscription_status_changed_at so we
// can answer "how long has this tenant been past_due?" without a separate
// events table.
//
// Reminder dedupe lives in trial_reminders_sent (PK on tenant_id +
// reminder_kind). The 24h gate is enforced with a sent_at filter so we
// can add new reminder cadences in the future without conflicting on
// the existing PK row.

const { query } = require('../database/client');

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1h
const FIRST_POLL_DELAY_MS = 30_000;      // 30s after boot — let the rest of boot settle
const REMINDER_KIND_3D = 'trial_ending_3d';

let intervalHandle = null;
let pollInProgress = false;

// Dynamic require for the email module. Wave B2 hasn't landed it yet —
// when it does, expose `sendTemplate(tenantId, templateKey, vars)` or
// equivalent and this picks it up automatically without a code change
// here. Until then, every reminder attempt no-ops cleanly.
function _tryLoadEmailModule() {
  try {
    // eslint-disable-next-line global-require
    return require('../email');
  } catch (_e) {
    return null;
  }
}

// ── 1. Expiry: trial → past_due ──────────────────────────────────────
async function _expireOverdueTrials() {
  const { rows } = await query(
    `UPDATE tenants
        SET subscription_status = 'past_due',
            subscription_status_changed_at = NOW(),
            updated_at = NOW()
      WHERE subscription_status = 'trial'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at < NOW()
      RETURNING id, slug, trial_ends_at`,
  );
  for (const row of rows) {
    console.log(
      `[tenants/trial_jobs] EXPIRED trial → past_due: tenant=${row.id} (${row.slug}) trial_ends_at=${row.trial_ends_at?.toISOString?.() ?? row.trial_ends_at}`,
    );
  }
  return rows.length;
}

// ── 2. Reminders: 3-day ending-soon warning ─────────────────────────
async function _sendTrialEndingReminders() {
  const email = _tryLoadEmailModule();

  // Candidates: trial, ending within 3 days, no reminder of this kind
  // in the last 24h. LEFT JOIN against the dedupe ledger keeps it a
  // single round-trip.
  const { rows } = await query(
    `SELECT t.id, t.slug, t.name, t.billing_email, t.trial_ends_at
       FROM tenants t
       LEFT JOIN trial_reminders_sent r
              ON r.tenant_id = t.id
             AND r.reminder_kind = $1
             AND r.sent_at > NOW() - INTERVAL '24 hours'
      WHERE t.subscription_status = 'trial'
        AND t.trial_ends_at IS NOT NULL
        AND t.trial_ends_at < NOW() + INTERVAL '3 days'
        AND t.trial_ends_at > NOW()
        AND r.tenant_id IS NULL`,
    [REMINDER_KIND_3D],
  );

  if (rows.length === 0) return 0;

  let sent = 0;
  for (const row of rows) {
    try {
      if (email && typeof email.sendTemplate === 'function') {
        // eslint-disable-next-line no-await-in-loop
        await email.sendTemplate(row.id, 'tplTrialEndingSoon', {
          tenant_name: row.name,
          tenant_slug: row.slug,
          billing_email: row.billing_email,
          trial_ends_at: row.trial_ends_at,
        });
        console.log(
          `[tenants/trial_jobs] REMINDER sent (tplTrialEndingSoon): tenant=${row.id} (${row.slug})`,
        );
      } else {
        // No email module wired — log and still record the dedupe row
        // so we don't log-spam every hour for the same tenant.
        console.log(
          `[tenants/trial_jobs] REMINDER no-op (email module not loaded): tenant=${row.id} (${row.slug})`,
        );
      }

      // Upsert dedupe row regardless of whether email actually sent —
      // a failed send shouldn't queue an immediate retry every hour.
      // The 24h sent_at filter naturally re-arms the next cadence.
      // eslint-disable-next-line no-await-in-loop
      await query(
        `INSERT INTO trial_reminders_sent (tenant_id, reminder_kind, sent_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (tenant_id, reminder_kind) DO UPDATE
           SET sent_at = EXCLUDED.sent_at`,
        [row.id, REMINDER_KIND_3D],
      );
      sent += 1;
    } catch (e) {
      console.error(
        `[tenants/trial_jobs] reminder failed for tenant=${row.id}:`, e.message,
      );
    }
  }
  return sent;
}

// ── 3. Safety net: past_due ≥30d → cancelled ────────────────────────
async function _cancelStalePastDue() {
  const { rows } = await query(
    `UPDATE tenants
        SET subscription_status = 'cancelled',
            subscription_status_changed_at = NOW(),
            updated_at = NOW()
      WHERE subscription_status = 'past_due'
        AND subscription_status_changed_at IS NOT NULL
        AND subscription_status_changed_at < NOW() - INTERVAL '30 days'
      RETURNING id, slug, subscription_status_changed_at`,
  );
  for (const row of rows) {
    console.log(
      `[tenants/trial_jobs] CANCELLED stale past_due → cancelled: tenant=${row.id} (${row.slug}) past_due_since=${row.subscription_status_changed_at?.toISOString?.() ?? row.subscription_status_changed_at}`,
    );
  }
  return rows.length;
}

async function pollOnce() {
  if (pollInProgress) return;
  pollInProgress = true;
  try {
    const expired = await _expireOverdueTrials();
    const reminded = await _sendTrialEndingReminders();
    const cancelled = await _cancelStalePastDue();
    if (expired || reminded || cancelled) {
      console.log(
        `[tenants/trial_jobs] tick done — expired=${expired} reminded=${reminded} cancelled=${cancelled}`,
      );
    }
  } catch (err) {
    // Don't crash the interval — log and move on. Next tick retries.
    console.error('[tenants/trial_jobs] poll error:', err.message);
  } finally {
    pollInProgress = false;
  }
}

function startTrialExpiryWorker() {
  if (intervalHandle) return;
  // Delay first tick so boot stays fast and we don't hammer the DB while
  // other workers are also warming up.
  setTimeout(() => { pollOnce().catch(() => {}); }, FIRST_POLL_DELAY_MS);
  intervalHandle = setInterval(() => { pollOnce().catch(() => {}); }, POLL_INTERVAL_MS);
  console.log(
    `[tenants/trial_jobs] worker started (interval=${POLL_INTERVAL_MS}ms)`,
  );
}

function stopTrialExpiryWorker() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startTrialExpiryWorker,
  stopTrialExpiryWorker,
  pollOnce,
};
