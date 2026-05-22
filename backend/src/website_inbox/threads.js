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
const { publishFadEvent } = require('../realtime');
const { attachIdentity } = require('../design/auth');
const { confirmReservation } = require('./guesty');
const { sendEmail } = require('./resend');
const {
  getVisibleDraftsForThread,
  triggerWebsiteDraftGeneration,
  approveWebsiteDraft,
  reviseWebsiteDraft,
  rejectWebsiteDraft,
} = require('./drafts');
const { recordAiTakeoverForThread } = require('./ai_handoff');

function mountThreads(router) {
  // ── LIST ──────────────────────────────────────────────────────
  router.get('/threads', async (req, res) => {
    try {
      const { status, q } = req.query;
      const filters = [];
      const params = [];
      if (status && ['open', 'in_progress', 'paid', 'closed'].includes(status)) {
        params.push(status);
        filters.push(`t.status = $${params.length}`);
      } else {
        // Default to active (not closed) so the inbox doesn't show
        // archived threads on first load.
        filters.push(`t.status <> 'closed'`);
      }
      if (typeof q === 'string' && q.trim().length > 0) {
        params.push(`%${q.trim().toLowerCase()}%`);
        filters.push(`(LOWER(t.guest_email) LIKE $${params.length} OR LOWER(COALESCE(t.guest_name, '')) LIKE $${params.length})`);
      }
      const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
      const { rows } = await query(
        `
        SELECT
          t.id, t.guest_email, t.guest_email_raw, t.guest_name, t.guest_phone,
          t.status, t.last_event_type, t.last_event_at,
          t.guesty_reservation_id, t.guesty_listing_id, t.guesty_reservation_status,
          t.guesty_expiration_at, t.paid_at, t.notes,
          latest_draft.id AS latest_draft_id,
          latest_draft.payload->>'state' AS latest_draft_state,
          latest_draft.payload->>'confidence' AS latest_draft_confidence,
          latest_handoff.payload->>'handoffId' AS latest_ai_handoff_id,
          latest_handoff.payload->>'surface' AS latest_ai_surface,
          latest_handoff.payload->>'confidence' AS latest_ai_confidence,
          latest_handoff.payload->>'aiReplyState' AS latest_ai_reply_state,
          latest_handoff.payload->>'escalationReason' AS latest_ai_escalation_reason,
          latest_handoff.payload->>'recommendedNextAction' AS latest_ai_recommended_next_action,
          CASE
            WHEN latest_handoff.id IS NULL THEN NULL
            WHEN latest_handoff_takeover.id IS NULL THEN 'ai_active'
            ELSE 'human_takeover'
          END AS latest_ai_takeover_state,
          CASE
            WHEN latest_handoff.id IS NULL THEN NULL
            WHEN latest_handoff_takeover.id IS NULL THEN TRUE
            ELSE FALSE
          END AS latest_ai_may_reply,
          (SELECT COUNT(*) FROM inbox_events e WHERE e.thread_id = t.id) AS event_count
        FROM inbox_threads t
        LEFT JOIN LATERAL (
          SELECT e.id, e.created_at
            FROM inbox_events e
           WHERE e.thread_id = t.id
             AND e.source <> 'fad'
             AND e.event_type NOT LIKE 'ai.%'
             AND e.event_type NOT LIKE 'staff.%'
           ORDER BY e.created_at DESC, e.id::text DESC
           LIMIT 1
        ) latest_guest_event ON TRUE
        LEFT JOIN LATERAL (
          SELECT d.id, d.payload, d.created_at
            FROM inbox_events d
           WHERE d.thread_id = t.id
             AND d.event_type IN ('ai.friday_drafting', 'ai.draft_ready', 'ai.draft_generation_failed')
             AND d.payload->>'source_event_id' = latest_guest_event.id::text
             AND COALESCE(d.payload->>'state', '') IN ('friday_drafting', 'draft_ready', 'under_review', 'generation_failed')
             AND NOT EXISTS (
               SELECT 1
                 FROM inbox_events sr
                WHERE sr.thread_id = t.id
                  AND sr.event_type = 'staff.reply_sent'
                  AND sr.created_at > latest_guest_event.created_at
             )
           ORDER BY d.created_at DESC, d.id::text DESC
           LIMIT 1
        ) latest_draft ON TRUE
        LEFT JOIN LATERAL (
          SELECT e.id, e.payload, e.created_at
            FROM inbox_events e
           WHERE e.thread_id = t.id
             AND e.event_type = 'website.ai_handoff'
           ORDER BY e.created_at DESC, e.id::text DESC
           LIMIT 1
        ) latest_handoff ON TRUE
        LEFT JOIN LATERAL (
          SELECT MIN(e.created_at) AS started_at
            FROM inbox_events e
           WHERE e.thread_id = t.id
             AND latest_handoff.id IS NOT NULL
             AND e.event_type = 'website.ai_handoff'
             AND e.payload->>'conversationKey' = latest_handoff.payload->>'conversationKey'
        ) latest_handoff_window ON TRUE
        LEFT JOIN LATERAL (
          SELECT e.id, e.payload, e.created_at
            FROM inbox_events e
           WHERE e.thread_id = t.id
             AND latest_handoff.id IS NOT NULL
             AND e.created_at >= COALESCE(latest_handoff_window.started_at, latest_handoff.created_at)
             AND e.event_type IN ('website.ai_handoff_takeover', 'staff.reply_sent')
           ORDER BY e.created_at DESC, e.id::text DESC
           LIMIT 1
        ) latest_handoff_takeover ON TRUE
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
      const drafts = await getVisibleDraftsForThread(req.params.id);
      res.json({
        thread: threadRes.rows[0],
        events: eventsRes.rows,
        drafts,
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
      if (/^website-ai\+/i.test(toEmail)) {
        if (channel !== 'website') {
          return res.status(409).json({
            error: 'website_ai_handoff_reply_requires_website_channel',
            message: 'Website AI handoff threads can only be continued through the live website channel.',
            state: 'blocked',
          });
        }
        const takeover = await recordAiTakeoverForThread({
          threadId: req.params.id,
          identity: req.identity,
          reason: 'staff_reply_sent',
        });
        if (!takeover.ok && takeover.reason === 'no_ai_handoff') {
          return res.status(409).json({ error: 'no_ai_handoff' });
        }
        const eventRes = await query(
          `INSERT INTO inbox_events (thread_id, event_type, source, payload)
           VALUES ($1, 'staff.reply_sent', 'fad', $2::jsonb)
           RETURNING id, created_at`,
          [req.params.id, JSON.stringify({
            channel: 'website',
            body,
            delivery: 'website_live',
            handoff_id: takeover.handoffId || null,
            sent_by: {
              user_id: req.identity?.userId || null,
              display_name: req.identity?.displayName || req.identity?.username || null,
            },
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

        await publishFadEvent({
          type: 'inbox.message_sent',
          payload: {
            conversationId: `web-${req.params.id}`,
            threadId: req.params.id,
            messageId: eventRes.rows[0]?.id || null,
            sentVia: 'website',
          },
        }).catch(() => {});
        await publishFadEvent({
          type: 'website_inbox.thread_updated',
          payload: { threadId: req.params.id, eventId: eventRes.rows[0]?.id || null, eventType: 'staff.reply_sent' },
        }).catch(() => {});

        return res.json({
          ok: true,
          message_id: eventRes.rows[0]?.id,
          sent_at: eventRes.rows[0]?.created_at,
          sent_via: 'website',
          delivery: 'website_live',
        });
      }

      await recordAiTakeoverForThread({
        threadId: req.params.id,
        identity: req.identity,
        reason: 'staff_reply_sent',
      });

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

  // ── AI DRAFTS FOR WEBSITE THREADS ───────────────────────────────────
  // Website threads do not have Guesty conversation IDs, so their draft
  // lifecycle is stored as inbox_events and sends via email only.
  router.post('/threads/:id/drafts', attachIdentity, async (req, res) => {
    try {
      const latest = await query(
        `SELECT id, event_type
           FROM inbox_events
          WHERE thread_id = $1
            AND source <> 'fad'
            AND event_type NOT LIKE 'ai.%'
            AND event_type NOT LIKE 'staff.%'
          ORDER BY created_at DESC, id::text DESC
          LIMIT 1`,
        [req.params.id],
      );
      const sourceEvent = latest.rows[0];
      if (!sourceEvent) return res.status(409).json({ error: 'no_website_event_to_draft' });
      if (sourceEvent.event_type === 'website.ai_handoff') {
        return res.status(409).json({
          error: 'website_ai_handoff_takeover_only',
          message: 'Website AI handoff threads require explicit human takeover before any outbound action.',
        });
      }
      triggerWebsiteDraftGeneration(req.params.id, sourceEvent.id, {
        revisionInstruction: typeof req.body?.instruction === 'string' ? req.body.instruction : undefined,
      }).catch((e) => {
        console.error(`[website_inbox/threads] draft create trigger failed for ${sourceEvent.id}:`, e.message);
      });
      return res.status(202).json({ ok: true, state: 'friday_drafting' });
    } catch (err) {
      console.error('[website_inbox/threads] draft create error:', err.message);
      res.status(err.status || 500).json({ error: err.code || err.message });
    }
  });

  router.post('/threads/:id/drafts/:draftId/approve', attachIdentity, async (req, res) => {
    try {
      const result = await approveWebsiteDraft({
        threadId: req.params.id,
        draftId: req.params.draftId,
        body: req.body?.draft_body || req.body?.body,
        channel: String(req.body?.channel || 'email').toLowerCase(),
        identity: req.identity,
      });
      res.json(result);
    } catch (err) {
      console.error('[website_inbox/threads] draft approve error:', err.message);
      res.status(err.status || 500).json({ error: err.code || err.message });
    }
  });

  router.post('/threads/:id/drafts/:draftId/revise', attachIdentity, async (req, res) => {
    try {
      const result = await reviseWebsiteDraft({
        threadId: req.params.id,
        draftId: req.params.draftId,
        instruction: req.body?.revision_instruction || req.body?.instruction,
      });
      res.status(202).json(result);
    } catch (err) {
      console.error('[website_inbox/threads] draft revise error:', err.message);
      res.status(err.status || 500).json({ error: err.code || err.message });
    }
  });

  router.post('/threads/:id/drafts/:draftId/reject', attachIdentity, async (req, res) => {
    try {
      const result = await rejectWebsiteDraft({
        threadId: req.params.id,
        draftId: req.params.draftId,
        reason: req.body?.reason,
        identity: req.identity,
      });
      res.json(result);
    } catch (err) {
      console.error('[website_inbox/threads] draft reject error:', err.message);
      res.status(err.status || 500).json({ error: err.code || err.message });
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
