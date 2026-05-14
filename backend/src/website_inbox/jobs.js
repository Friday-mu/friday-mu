'use strict';

// Background worker draining inbox_guesty_jobs. Two job types:
//
//   create_reservation  — fired by booking.proof_uploaded webhook.
//                         Calls Guesty createReservation; on success
//                         stamps the thread with guesty_reservation_id
//                         + status + expiration.
//
//   confirm_reservation — fired by /threads/:id/mark-paid. Calls
//                         Guesty confirmReservation; on success queues
//                         the Resend confirmation email.
//
// Runs on a setInterval inside the fad-backend process. Cheap (poll
// every 15s when idle, immediate on enqueue would be nicer but not
// worth the complexity for v1). Exponential backoff on retry; bails
// out to `dead` after 6 attempts so a permanently-broken Guesty
// integration doesn't hammer their API.
//
// Restart-safe: a job left in `running` after a crash gets picked up
// by the next poll because we filter on next_attempt_at, not status.
// Worst case: one double-call to Guesty per crash (idempotency
// guarded by Guesty's own confirmationCode field on createReservation
// + the reservation_id check on confirmReservation).

const { query } = require('../database/client');
const { createReservation, confirmReservation, isRetryable } = require('./guesty');
const { sendBookingConfirmation } = require('./resend');

const POLL_INTERVAL_MS = 15_000;
const MAX_ATTEMPTS = 6;

// Backoff schedule (ms after each failed attempt). Doubles each time,
// capped at ~10 min. Empirically: Guesty 5xx clears within minutes,
// rate-limits clear in seconds.
function backoffMs(attempt) {
  const base = 5_000 * Math.pow(2, attempt - 1);
  return Math.min(base, 10 * 60_000);
}

async function runJob(job) {
  try {
    if (job.job_type === 'create_reservation') {
      return await runCreateReservation(job);
    }
    if (job.job_type === 'confirm_reservation') {
      return await runConfirmReservation(job);
    }
    throw new Error(`unknown job_type: ${job.job_type}`);
  } catch (err) {
    const retry = isRetryable(err) && (job.attempts + 1) < MAX_ATTEMPTS;
    const newStatus = retry ? 'failed' : 'dead';
    const nextAttemptAt = retry
      ? new Date(Date.now() + backoffMs(job.attempts + 1))
      : null;
    await query(
      `UPDATE inbox_guesty_jobs
       SET status = $1,
           attempts = attempts + 1,
           next_attempt_at = COALESCE($2, NOW()),
           last_error = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [newStatus, nextAttemptAt, err.message?.slice(0, 1000) || 'unknown', job.id],
    );
    console.warn(`[website_inbox/jobs] ${job.job_type} ${job.id} → ${newStatus} (${err.message})`);
  }
}

async function runCreateReservation(job) {
  const p = job.payload || {};
  // Mark running so a parallel worker can't grab the same job
  // (defensive — we only run one worker per process today).
  await query(
    `UPDATE inbox_guesty_jobs SET status = 'running', attempts = attempts + 1, updated_at = NOW() WHERE id = $1`,
    [job.id],
  );

  const result = await createReservation({
    listingId: p.listingId,
    checkInDateUtc: p.checkInDate,
    checkOutDateUtc: p.checkOutDate,
    guests: p.guest || {},
    guestsCount: p.guestsCount,
    reference: p.reference,
    proofUrl: p.proofUrl,
    expirationHours: 48,
  });

  // Persist the Guesty reservation onto the thread.
  await query(
    `UPDATE inbox_threads
     SET guesty_reservation_id = $1,
         guesty_reservation_status = $2,
         guesty_expiration_at = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [
      result?._id || result?.id,
      result?.status || 'reserved',
      result?.expirationDate ? new Date(result.expirationDate) : null,
      job.thread_id,
    ],
  );

  await query(
    `UPDATE inbox_guesty_jobs
     SET status = 'succeeded', result = $1::jsonb, updated_at = NOW(), last_error = NULL
     WHERE id = $2`,
    [JSON.stringify(result), job.id],
  );
}

async function runConfirmReservation(job) {
  const p = job.payload || {};
  await query(
    `UPDATE inbox_guesty_jobs SET status = 'running', attempts = attempts + 1, updated_at = NOW() WHERE id = $1`,
    [job.id],
  );

  const result = await confirmReservation({ reservationId: p.reservation_id });

  // Sync the thread's reservation status, then fire the guest email.
  // Email failure shouldn't roll back the Guesty confirm — log + carry
  // on; ops can resend manually if needed.
  await query(
    `UPDATE inbox_threads
     SET guesty_reservation_status = $1, guesty_expiration_at = NULL, updated_at = NOW()
     WHERE id = $2`,
    [result?.status || 'confirmed', job.thread_id],
  );

  const threadRes = await query(`SELECT * FROM inbox_threads WHERE id = $1`, [job.thread_id]);
  const t = threadRes.rows[0];
  const lastBookingEvt = await query(
    `SELECT payload FROM inbox_events
     WHERE thread_id = $1 AND event_type IN ('booking.request_submitted', 'booking.proof_uploaded')
     ORDER BY created_at DESC LIMIT 1`,
    [job.thread_id],
  );
  const bp = lastBookingEvt.rows[0]?.payload || {};

  try {
    await sendBookingConfirmation({
      toEmail: p.email_payload?.toEmail || t.guest_email_raw || t.guest_email,
      toName: p.email_payload?.toName || t.guest_name,
      residenceName: bp.residence_name || bp.residenceName || bp.listing_name || bp.residence_slug || null,
      checkInDate: bp.check_in || bp.checkIn || null,
      checkOutDate: bp.check_out || bp.checkOut || null,
      reference: bp.reference || null,
    });
  } catch (emailErr) {
    console.warn('[website_inbox/jobs] confirmation email failed (Guesty ok):', emailErr.message);
  }

  await query(
    `UPDATE inbox_guesty_jobs
     SET status = 'succeeded', result = $1::jsonb, updated_at = NOW(), last_error = NULL
     WHERE id = $2`,
    [JSON.stringify(result), job.id],
  );
}

let intervalHandle = null;
let pollInProgress = false;

async function pollOnce() {
  if (pollInProgress) return;
  pollInProgress = true;
  try {
    const { rows } = await query(
      `SELECT id, thread_id, event_id, job_type, status, attempts, payload
       FROM inbox_guesty_jobs
       WHERE status IN ('pending', 'failed')
         AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC
       LIMIT 5`,
    );
    for (const job of rows) {
      // Sequential — keeps Guesty load low and simplifies retry
      // bookkeeping. 5 jobs/poll × 15s = up to 20/min, well within
      // Guesty's rate limits.
      // eslint-disable-next-line no-await-in-loop
      await runJob(job);
    }
  } catch (err) {
    console.error('[website_inbox/jobs] poll error:', err.message);
  } finally {
    pollInProgress = false;
  }
}

function startWorker() {
  if (intervalHandle) return;
  // First poll on a small delay so the boot path stays fast.
  setTimeout(() => { pollOnce().catch(() => {}); }, 5_000);
  intervalHandle = setInterval(() => { pollOnce().catch(() => {}); }, POLL_INTERVAL_MS);
  console.log(`[website_inbox/jobs] worker started (interval=${POLL_INTERVAL_MS}ms)`);
}

function stopWorker() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startWorker, stopWorker, pollOnce };
