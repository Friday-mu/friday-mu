'use strict';

// Auth-gated read/write endpoints for the website-inbox UI.
//
// GET    /threads                 list with status + type filters
// GET    /threads/:id             detail + all events (chronological)
// PATCH  /threads/:id             update status / notes
// POST   /threads/:id/mark-paid   flip Guesty status to confirmed +
//                                 queue Resend email
//
// `requireAuth` here is the existing FAD auth middleware (Authorization
// header → GMS-issued JWT). attachIdentity isn't strictly needed for
// reads but mark-paid stamps `paid_by_user_id` / display name so we
// include it on the mutating routes.

const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { confirmReservation } = require('./guesty');
const { sendEmail } = require('./resend');

function mountThreads(router) {
  // ── LIST ──────────────────────────────────────────────────────
  router.get('/threads', async (req, res) => {
    try {
      const { status, q } = req.query;
      const filters = [];
      const params = [];
      if (status && ['open', 'in_progress', 'paid', 'closed'].includes(status)) {
        params.push(status);
        filters.push(`status = $${params.length}`);
      } else {
        // Default to active (not closed) so the inbox doesn't show
        // archived threads on first load.
        filters.push(`status <> 'closed'`);
      }
      if (typeof q === 'string' && q.trim().length > 0) {
        params.push(`%${q.trim().toLowerCase()}%`);
        filters.push(`(LOWER(guest_email) LIKE $${params.length} OR LOWER(COALESCE(guest_name, '')) LIKE $${params.length})`);
      }
      const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
      const { rows } = await query(
        `
        SELECT
          t.id, t.guest_email, t.guest_email_raw, t.guest_name, t.guest_phone,
          t.status, t.last_event_type, t.last_event_at,
          t.guesty_reservation_id, t.guesty_listing_id, t.guesty_reservation_status,
          t.guesty_expiration_at, t.paid_at, t.notes,
          (SELECT COUNT(*) FROM inbox_events e WHERE e.thread_id = t.id) AS event_count
        FROM inbox_threads t
        ${where}
        ORDER BY t.last_event_at DESC
        LIMIT 200
        `,
        params,
      );
      res.json({ results: rows });
    } catch (err) {
      console.error('[website_inbox/threads] list error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── DETAIL ────────────────────────────────────────────────────
  router.get('/threads/:id', async (req, res) => {
    try {
      const threadRes = await query(
        `SELECT * FROM inbox_threads WHERE id = $1`,
        [req.params.id],
      );
      if (threadRes.rows.length === 0) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      const eventsRes = await query(
        `
        SELECT id, reference, event_type, source, payload, signed_at, created_at
        FROM inbox_events
        WHERE thread_id = $1
        ORDER BY created_at ASC
        `,
        [req.params.id],
      );
      const jobsRes = await query(
        `
        SELECT id, job_type, status, attempts, next_attempt_at, last_error,
               payload, result, created_at, updated_at
        FROM inbox_guesty_jobs
        WHERE thread_id = $1
        ORDER BY created_at ASC
        `,
        [req.params.id],
      );
      res.json({
        thread: threadRes.rows[0],
        events: eventsRes.rows,
        guesty_jobs: jobsRes.rows,
      });
    } catch (err) {
      console.error('[website_inbox/threads] detail error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH (status / notes) ────────────────────────────────────
  router.patch('/threads/:id', async (req, res) => {
    try {
      const { status, notes } = req.body || {};
      const sets = [];
      const params = [];
      if (status !== undefined) {
        if (!['open', 'in_progress', 'paid', 'closed'].includes(status)) {
          return res.status(400).json({ error: 'invalid status' });
        }
        params.push(status);
        sets.push(`status = $${params.length}`);
      }
      if (notes !== undefined) {
        params.push(notes === null ? null : String(notes).slice(0, 4000));
        sets.push(`notes = $${params.length}`);
      }
      if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
      sets.push('updated_at = NOW()');
      params.push(req.params.id);
      const { rows } = await query(
        `UPDATE inbox_threads SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params,
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Thread not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('[website_inbox/threads] patch error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── REPLY BY EMAIL ─────────────────────────────────────────────────
  // Website-originated threads do not have a Guesty conversation id yet.
  // The truthful continuation path is email to the submitted contact
  // address, then append a staff.reply_sent event so the unified Inbox
  // history shows what the team actually sent.
  router.post('/threads/:id/reply', attachIdentity, async (req, res) => {
    try {
      const body = String(req.body?.body || '').trim();
      const channel = String(req.body?.channel || 'email').toLowerCase();
      if (!body) return res.status(400).json({ error: 'body is required' });
      if (channel !== 'email' && channel !== 'website') {
        return res.status(409).json({
          error: 'channel_not_available',
          message: 'Website enquiries can be continued by email until a Guesty/WhatsApp conversation exists.',
          state: 'blocked',
        });
      }

      const threadRes = await query(
        `SELECT * FROM inbox_threads WHERE id = $1`,
        [req.params.id],
      );
      if (threadRes.rows.length === 0) return res.status(404).json({ error: 'Thread not found' });
      const t = threadRes.rows[0];
      const toEmail = t.guest_email_raw || t.guest_email;
      if (!toEmail) return res.status(409).json({ error: 'missing_guest_email' });

      const subject = String(req.body?.subject || 'Re: Your Friday enquiry').slice(0, 200);
      const result = await sendEmail({
        to: toEmail,
        toName: t.guest_name || undefined,
        subject,
        body,
      });

      const eventRes = await query(
        `INSERT INTO inbox_events (thread_id, event_type, source, payload)
         VALUES ($1, 'staff.reply_sent', 'fad', $2::jsonb)
         RETURNING id, created_at`,
        [req.params.id, JSON.stringify({
          channel: 'email',
          body,
          subject,
          to: toEmail,
          sent_by: {
            user_id: req.identity?.userId || null,
            display_name: req.identity?.displayName || req.identity?.username || null,
          },
          provider: result || null,
        })],
      );

      await query(
        `UPDATE inbox_threads
         SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
             last_event_type = 'staff.reply_sent',
             last_event_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [req.params.id],
      );

      res.json({
        ok: true,
        message_id: eventRes.rows[0]?.id,
        sent_at: eventRes.rows[0]?.created_at,
        sent_via: 'email',
      });
    } catch (err) {
      console.error('[website_inbox/threads] reply error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── MARK PAID ─────────────────────────────────────────────────
  // Flip Guesty status to confirmed (via DLQ for retry safety) and
  // queue the Resend confirmation email. The actual API calls run in
  // the worker; this endpoint is fast + idempotent.
  router.post('/threads/:id/mark-paid', attachIdentity, async (req, res) => {
    try {
      const threadRes = await query(
        `SELECT * FROM inbox_threads WHERE id = $1`,
        [req.params.id],
      );
      if (threadRes.rows.length === 0) return res.status(404).json({ error: 'Thread not found' });
      const t = threadRes.rows[0];
      if (t.status === 'paid') {
        return res.json({ status: 'already_paid', thread: t });
      }
      if (!t.guesty_reservation_id) {
        // We can still mark the thread paid (e.g. it was a manual
        // booking) but skip the Guesty flip.
        await query(
          `UPDATE inbox_threads SET status = 'paid', paid_at = NOW(),
             paid_by_user_id = $1, paid_by_display_name = $2, updated_at = NOW()
           WHERE id = $3`,
          [req.identity?.userId, req.identity?.displayName || req.identity?.username, req.params.id],
        );
        return res.json({ status: 'marked_paid_no_guesty', thread_id: req.params.id });
      }

      // Queue a confirm_reservation job. The worker handles the Guesty
      // PUT + on success queues the Resend email. We DO mark the
      // thread paid immediately so the inbox reflects ops intent even
      // if Guesty is slow.
      await query(
        `INSERT INTO inbox_guesty_jobs (thread_id, job_type, status, payload)
         VALUES ($1, 'confirm_reservation', 'pending', $2::jsonb)`,
        [req.params.id, JSON.stringify({
          reservation_id: t.guesty_reservation_id,
          email_payload: {
            toEmail: t.guest_email_raw || t.guest_email,
            toName: t.guest_name,
          },
        })],
      );

      await query(
        `UPDATE inbox_threads
         SET status = 'paid', paid_at = NOW(),
             paid_by_user_id = $1, paid_by_display_name = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [req.identity?.userId, req.identity?.displayName || req.identity?.username, req.params.id],
      );

      res.json({ status: 'marked_paid', thread_id: req.params.id });
    } catch (err) {
      console.error('[website_inbox/threads] mark-paid error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { mountThreads };

// Re-export for the worker's use — keeps the API surface from this
// module clean while letting jobs.js verify reservation IDs.
module.exports.__guesty = { confirmReservation };
