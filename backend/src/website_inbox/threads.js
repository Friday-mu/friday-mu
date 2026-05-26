'use strict';

// Auth-gated read/write endpoints for the website-inbox UI.
//
// GET    /threads                 list with status + type filters
// GET    /threads/:id             detail + all events (chronological)
// PATCH  /threads/:id             update status / notes
// POST   /threads/:id/mark-paid   staff-approved funds-received path;
//                                 can queue Guesty confirmation without
//                                 sending duplicate FAD confirmation email
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
const { listingIdForSlug } = require('./property-map');
const {
  getVisibleDraftsForThread,
  triggerWebsiteDraftGeneration,
  approveWebsiteDraft,
  reviseWebsiteDraft,
  rejectWebsiteDraft,
} = require('./drafts');
const { recordAiTakeoverForThread } = require('./ai_handoff');

function bookingRequestIdFromRecord(record) {
  return record?.request_id || record?.reference || null;
}

function normalizeProofPayload(body, request, identity) {
  const now = new Date().toISOString();
  return {
    event_version: '2026-05-26',
    reference: bookingRequestIdFromRecord(request),
    thread_id: request.thread_id,
    booking_request_id: bookingRequestIdFromRecord(request),
    residence_name: request.listing_title || null,
    residence_slug: request.listing_slug || null,
    check_in: request.check_in || null,
    check_out: request.check_out || null,
    nights: request.nights || null,
    quote: {
      currency: request.quoted_total_currency || request.payment_currency || null,
      total: request.quoted_total_amount_minor != null ? Number(request.quoted_total_amount_minor) / 100 : null,
    },
    proof_url: body.proof_url || body.proofUrl || null,
    proof_viewer_url: body.proof_viewer_url || body.proofViewerUrl || body.proof_url || body.proofUrl || null,
    file_name: body.file_name || body.fileName || null,
    file_type: body.file_type || body.fileType || null,
    file_size: Number.isFinite(Number(body.file_size || body.fileSize)) ? Number(body.file_size || body.fileSize) : null,
    uploaded_at: body.uploaded_at || body.uploadedAt || now,
    proof_source: body.proof_source || body.proofSource || 'staff_upload',
    next_action: 'verify_bank_funds_before_confirming',
    notes: body.notes ? String(body.notes).slice(0, 2000) : null,
    uploaded_by: {
      user_id: identity?.userId || null,
      display_name: identity?.displayName || identity?.username || null,
    },
  };
}

async function applyProofToBookingRequest({ threadId, tenantId, requestId, eventId, payload, actorId }) {
  const proofReceivedAt = payload?.uploaded_at ? new Date(payload.uploaded_at) : new Date();
  const safeProofReceivedAt = Number.isNaN(proofReceivedAt.getTime()) ? new Date() : proofReceivedAt;
  const { rows } = await query(
    `UPDATE fad_portal_booking_requests
        SET status = CASE
              WHEN status IN ('confirmed', 'declined') THEN status
              ELSE 'proof_received'
            END,
            proof_url = COALESCE($1, proof_url),
            proof_viewer_url = COALESCE($2, proof_viewer_url),
            proof_file_name = COALESCE($3, proof_file_name),
            proof_file_type = COALESCE($4, proof_file_type),
            proof_file_size = COALESCE($5, proof_file_size),
            proof_received_at = COALESCE($6, proof_received_at, NOW()),
            proof_source = COALESCE($7, proof_source, 'website'),
            proof_event_id = COALESCE($8::uuid, proof_event_id),
            last_status_actor_id = COALESCE($9::uuid, last_status_actor_id),
            last_status_change_at = NOW(),
            updated_at = NOW()
      WHERE tenant_id = $10
        AND (
          thread_id = $11
          OR request_id = $12
        )
      RETURNING *`,
    [
      payload?.proof_url || payload?.proofUrl || null,
      payload?.proof_viewer_url || payload?.proofViewerUrl || null,
      payload?.file_name || payload?.fileName || null,
      payload?.file_type || payload?.fileType || null,
      Number.isFinite(Number(payload?.file_size || payload?.fileSize)) ? Number(payload?.file_size || payload?.fileSize) : null,
      safeProofReceivedAt,
      payload?.proof_source || payload?.source || 'website',
      eventId || null,
      actorId || null,
      tenantId,
      threadId,
      requestId,
    ],
  );
  return rows[0] || null;
}

function mountThreads(router) {
  // ── LIST ──────────────────────────────────────────────────────
  // T3.7 — attachIdentity + tenant scoping so the FAD-side list only
  // returns threads belonging to the caller's tenant. Pre-migration
  // 087 data is backfilled to FR_TENANT_ID, so existing rows
  // continue to land for the FR-team requests; non-FR tenants would
  // see an empty list (correct — they have no website-inbox traffic
  // yet).
  router.get('/threads', attachIdentity, async (req, res) => {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'tenant context required' });
      }
      const { status, q } = req.query;
      const filters = [];
      const params = [tenantId];
      // First filter is always tenant_id; subsequent filters add to params.
      filters.push(`t.tenant_id = $1`);
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
  // T3.7 — scope by tenant_id so an admin from tenant A can't fetch
  // a thread belonging to tenant B by guessing the UUID.
  router.get('/threads/:id', attachIdentity, async (req, res) => {
    try {
      if (!req.tenantId) return res.status(401).json({ error: 'tenant context required' });
      const threadRes = await query(
        `SELECT * FROM inbox_threads WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId],
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
  // T3.7 — tenant_id scope so admin from tenant A can't mutate
  // tenant B's threads.
  router.patch('/threads/:id', attachIdentity, async (req, res) => {
    try {
      if (!req.tenantId) return res.status(401).json({ error: 'tenant context required' });
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
      params.push(req.tenantId);
      const { rows } = await query(
        `UPDATE inbox_threads SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`,
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

      if (!req.tenantId) return res.status(401).json({ error: 'tenant context required' });
      const threadRes = await query(
        `SELECT * FROM inbox_threads WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId],
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
  // Staff-approved funds-received path. If a Guesty reservation is
  // already linked, queue Guesty confirmation via DLQ. The worker does
  // not send a duplicate FAD confirmation email unless explicitly
  // requested in the job payload.
  router.post('/threads/:id/mark-paid', attachIdentity, async (req, res) => {
    try {
      if (!req.tenantId) return res.status(401).json({ error: 'tenant context required' });
      const threadRes = await query(
        `SELECT * FROM inbox_threads WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId],
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
      // PUT. We DO mark the
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
          send_fad_confirmation: false,
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

  // ── BOOKING REQUEST PANEL (Portal v2 slice 2) ──────────────────────
  //
  // GET   /threads/:id/booking-request
  // PATCH /threads/:id/booking-request
  //
  // Operator-side controls for the fad_portal_booking_requests sidecar
  // (mig 092). Mutating status here is what drives the
  // public/stays/resolve responses on the website — once status flips
  // to 'awaiting_payment', the guest's portal shows the payment
  // tracker advanced; on 'confirmed' + converted_to_reservation_id set,
  // the resolver auto-switches the same stayToken to reservation mode.
  //
  // Tenant-scoped via attachIdentity (admin operator session, NOT the
  // public Bearer token used by the website).

  router.get('/threads/:id/booking-request', attachIdentity, async (req, res) => {
    try {
      if (!req.tenantId) return res.status(401).json({ error: 'tenant context required' });
      const { rows } = await query(
        `SELECT id, thread_id, request_id, listing_slug, listing_title,
                check_in, check_out, nights,
                party_adults, party_children, party_infants,
                quoted_total_amount_minor, quoted_total_currency,
                status, payment_choice, payment_currency,
                paid_amount_minor, confirmation_deadline,
                proof_url, proof_viewer_url, proof_file_name,
                proof_file_type, proof_file_size, proof_received_at,
                proof_source, proof_event_id,
                converted_to_reservation_id,
                declined_at, declined_reason,
                last_status_actor_id, last_status_change_at,
                created_at, updated_at
           FROM fad_portal_booking_requests
          WHERE thread_id = $1 AND tenant_id = $2
          LIMIT 1`,
        [req.params.id, req.tenantId],
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'booking_request_not_found' });
      }
      res.json(rows[0]);
    } catch (err) {
      console.error('[website_inbox/threads] booking-request get error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/threads/:id/booking-request', attachIdentity, async (req, res) => {
    try {
      if (!req.tenantId) return res.status(401).json({ error: 'tenant context required' });
      const action = String(req.body?.action || '').trim();
      if (!['set_payment_terms', 'mark_proof_received', 'upload_proof_elsewhere', 'mark_funds_received', 'queue_guesty_reservation_create', 'decline', 'reset_to_review'].includes(action)) {
        return res.status(400).json({
          error: 'invalid_action',
          message: 'action must be set_payment_terms | mark_proof_received | upload_proof_elsewhere | mark_funds_received | queue_guesty_reservation_create | decline | reset_to_review',
        });
      }
      // Confirm the sidecar exists for this thread + tenant.
      const lookup = await query(
        `SELECT * FROM fad_portal_booking_requests
          WHERE thread_id = $1 AND tenant_id = $2 LIMIT 1`,
        [req.params.id, req.tenantId],
      );
      if (lookup.rows.length === 0) {
        return res.status(404).json({ error: 'booking_request_not_found' });
      }
      const actorId = req.identity?.userId || null;

      let updateSql = '';
      let updateParams = [];

      if (action === 'set_payment_terms') {
        const choice = req.body?.payment_choice;
        const currency = req.body?.payment_currency;
        const deadlineRaw = req.body?.confirmation_deadline;
        if (!['deposit_50', 'full'].includes(choice)) {
          return res.status(400).json({ error: 'invalid_payment_choice' });
        }
        if (!['EUR', 'MUR', 'USD'].includes(currency)) {
          return res.status(400).json({ error: 'invalid_payment_currency' });
        }
        let deadline = null;
        if (deadlineRaw) {
          const d = new Date(deadlineRaw);
          if (Number.isNaN(d.getTime())) {
            return res.status(400).json({ error: 'invalid_confirmation_deadline' });
          }
          deadline = d.toISOString();
        }
        updateSql = `UPDATE fad_portal_booking_requests
                        SET status = CASE
                              WHEN status IN ('proof_received', 'confirmed', 'declined') THEN status
                              ELSE 'awaiting_payment'
                            END,
                            payment_choice = $1,
                            payment_currency = $2,
                            confirmation_deadline = $3,
                            last_status_actor_id = $4,
                            last_status_change_at = NOW(),
                            updated_at = NOW()
                      WHERE thread_id = $5 AND tenant_id = $6
                      RETURNING *`;
        updateParams = [choice, currency, deadline, actorId, req.params.id, req.tenantId];
      } else if (action === 'mark_proof_received' || action === 'upload_proof_elsewhere') {
        const request = lookup.rows[0];
        const payload = normalizeProofPayload(req.body || {}, request, req.identity);
        let eventId = null;
        if (action === 'upload_proof_elsewhere') {
          if (!payload.proof_url && !payload.proof_viewer_url && !payload.file_name && !payload.notes) {
            return res.status(400).json({ error: 'proof_evidence_required', message: 'Provide a proof URL, viewer URL, file name, or note.' });
          }
          const eventRes = await query(
            `INSERT INTO inbox_events (tenant_id, thread_id, reference, event_type, source, payload)
             VALUES ($1, $2, $3, 'booking.proof_uploaded', 'fad', $4::jsonb)
             RETURNING id`,
            [
              req.tenantId,
              req.params.id,
              `staff-proof:${request.request_id}:${Date.now()}`,
              JSON.stringify(payload),
            ],
          );
          eventId = eventRes.rows[0]?.id || null;
        }
        const updated = await applyProofToBookingRequest({
          threadId: req.params.id,
          tenantId: req.tenantId,
          requestId: request.request_id,
          eventId,
          payload,
          actorId,
        });
        if (!updated) return res.status(404).json({ error: 'booking_request_not_found' });
        await query(
          `UPDATE inbox_threads
              SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
                  last_event_type = CASE WHEN $1::uuid IS NULL THEN last_event_type ELSE 'booking.proof_uploaded' END,
                  last_event_at = CASE WHEN $1::uuid IS NULL THEN last_event_at ELSE NOW() END,
                  updated_at = NOW()
            WHERE id = $2 AND tenant_id = $3`,
          [eventId, req.params.id, req.tenantId],
        );
        await publishFadEvent({
          type: 'website_inbox.thread_updated',
          payload: { threadId: req.params.id, eventId, eventType: 'booking.proof_uploaded' },
        }).catch(() => {});
        return res.json(updated);
      } else if (action === 'mark_funds_received') {
        const paidAmountMajor = req.body?.paid_amount;
        const reservationId = req.body?.reservation_id || null;
        if (paidAmountMajor == null || !Number.isFinite(Number(paidAmountMajor)) || Number(paidAmountMajor) <= 0) {
          return res.status(400).json({ error: 'invalid_paid_amount', message: 'paid_amount required (positive number)' });
        }
        const paidMinor = Math.round(Number(paidAmountMajor) * 100);
        // reservation_id optional — if provided we validate it exists
        // for this tenant, then set converted_to_reservation_id so the
        // public resolver auto-switches to reservation mode.
        if (reservationId) {
          const rsv = await query(
            `SELECT id FROM fad_reservations WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
            [reservationId, req.tenantId],
          );
          if (rsv.rows.length === 0) {
            return res.status(400).json({ error: 'reservation_not_found', message: 'reservation_id does not exist for this tenant' });
          }
        }
        updateSql = `UPDATE fad_portal_booking_requests
                        SET status = 'confirmed',
                            paid_amount_minor = $1,
                            converted_to_reservation_id = COALESCE($2::uuid, converted_to_reservation_id),
                            last_status_actor_id = $3,
                            last_status_change_at = NOW(),
                            updated_at = NOW()
                      WHERE thread_id = $4 AND tenant_id = $5
                      RETURNING *`;
        updateParams = [paidMinor, reservationId, actorId, req.params.id, req.tenantId];
      } else if (action === 'queue_guesty_reservation_create') {
        const request = lookup.rows[0];
        if (!['proof_received', 'confirmed'].includes(request.status)) {
          return res.status(409).json({
            error: 'proof_not_verified',
            message: 'Queue Guesty reservation creation only after proof is received or funds are confirmed.',
          });
        }
        const listingId = listingIdForSlug(request.listing_slug);
        if (!listingId) {
          return res.status(409).json({
            error: 'unmapped_residence_slug',
            message: `No Guesty listing mapping found for ${request.listing_slug || '(missing slug)'}.`,
          });
        }
        const eventRes = await query(
          `SELECT payload FROM inbox_events
            WHERE tenant_id = $1
              AND thread_id = $2
              AND event_type IN ('booking.request_submitted', 'booking.proof_uploaded')
            ORDER BY created_at DESC, id::text DESC
            LIMIT 1`,
          [req.tenantId, req.params.id],
        );
        const latestPayload = eventRes.rows[0]?.payload || {};
        await query(
          `INSERT INTO inbox_guesty_jobs (tenant_id, thread_id, job_type, status, payload)
           VALUES ($1, $2, 'create_reservation', 'pending', $3::jsonb)`,
          [req.tenantId, req.params.id, JSON.stringify({
            listingId,
            slug: request.listing_slug,
            checkInDate: request.check_in,
            checkOutDate: request.check_out,
            guestsCount: Number(request.party_adults || 0) + Number(request.party_children || 0) || 1,
            reference: request.request_id,
            proofUrl: request.proof_viewer_url || request.proof_url || latestPayload.proof_viewer_url || latestPayload.proof_url || null,
            guest: latestPayload.guest || {},
            requested_by_user_id: actorId,
            explicit_staff_action: true,
          })],
        );
        await publishFadEvent({
          type: 'website_inbox.thread_updated',
          payload: { threadId: req.params.id, eventType: 'booking.reservation_create_queued' },
        }).catch(() => {});
        return res.json({ ...request, guesty_create_queued: true });
      } else if (action === 'decline') {
        const reason = req.body?.reason ? String(req.body.reason).slice(0, 2000) : null;
        updateSql = `UPDATE fad_portal_booking_requests
                        SET status = 'declined',
                            declined_at = NOW(),
                            declined_reason = $1,
                            last_status_actor_id = $2,
                            last_status_change_at = NOW(),
                            updated_at = NOW()
                      WHERE thread_id = $3 AND tenant_id = $4
                      RETURNING *`;
        updateParams = [reason, actorId, req.params.id, req.tenantId];
      } else if (action === 'reset_to_review') {
        // Escape hatch: ops mis-clicked, bring it back to pending_review.
        // Clears the payment terms + declined fields but PRESERVES
        // converted_to_reservation_id (the linked reservation row, if
        // it exists, is a fact ops shouldn't accidentally unlink).
        updateSql = `UPDATE fad_portal_booking_requests
                        SET status = 'pending_review',
                            payment_choice = NULL,
                            payment_currency = NULL,
                            paid_amount_minor = NULL,
                            confirmation_deadline = NULL,
                            declined_at = NULL,
                            declined_reason = NULL,
                            last_status_actor_id = $1,
                            last_status_change_at = NOW(),
                            updated_at = NOW()
                      WHERE thread_id = $2 AND tenant_id = $3
                      RETURNING *`;
        updateParams = [actorId, req.params.id, req.tenantId];
      }

      const result = await query(updateSql, updateParams);
      res.json(result.rows[0]);
    } catch (err) {
      console.error('[website_inbox/threads] booking-request patch error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { mountThreads };

// Re-export for the worker's use — keeps the API surface from this
// module clean while letting jobs.js verify reservation IDs.
module.exports.__guesty = { confirmReservation };
