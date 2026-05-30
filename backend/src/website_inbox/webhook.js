'use strict';

// POST /api/inbox/friday-website — webhook receiver from friday.mu.
//
// Auth: HMAC-SHA256 over `${timestamp}.${rawBody}` using
// FRIDAY_WEBSITE_INBOX_SECRET. Same pattern as the friday.mu Bokun
// webhook the user referenced — symmetric secret, hex-encoded
// signature, timestamp anti-replay.
//
// Headers:
//   X-Friday-Inbox-Signature: <hex>
//   X-Friday-Inbox-Timestamp: <unix-ms or ISO8601>
//
// Idempotency: payload.reference (FBR-..., FE-...) + event_type is
// the natural dedup key. Unique index on inbox_events covers this.
// Retries return 200 with `{ status: 'duplicate' }` so friday.mu's
// retry loop doesn't loop forever on transient errors that already
// landed.
//
// Response contract:
//   200  — event accepted (new or duplicate). friday.mu can stop retrying.
//   4xx  — malformed payload / bad signature. friday.mu should NOT retry.
//   5xx  — our DB is down. friday.mu retries.

const crypto = require('node:crypto');
const { query } = require('../database/client');
const { publishFadEvent } = require('../realtime');
const { shouldAutoDraftWebsiteEvent, triggerWebsiteDraftGeneration } = require('./drafts');

// 5-minute replay window. Slightly generous to absorb clock drift +
// network delay; tight enough to make replay attacks impractical.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

// T3.7 v0.2 — friday.mu is single-tenant (Friday Mauritius) for now,
// so every website-inbox INSERT lands on FR. When per-tenant routing
// arrives we'll derive this from the signature / payload instead.
const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const ALLOWED_EVENT_TYPES = new Set([
  'booking.request_submitted',
  'booking.proof_uploaded',
  'experience.enquiry_submitted',
  'contact.form_submitted',
  'owner.enquiry_submitted',
]);

// Constant-time compare so timing analysis can't leak the secret.
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

// HMAC verify. Returns { ok: true } or { ok: false, reason }.
function verifySignature({ rawBody, timestampHeader, signatureHeader, secret }) {
  if (!secret) return { ok: false, reason: 'FRIDAY_WEBSITE_INBOX_SECRET not configured' };
  if (!timestampHeader) return { ok: false, reason: 'missing X-Friday-Inbox-Timestamp' };
  if (!signatureHeader) return { ok: false, reason: 'missing X-Friday-Inbox-Signature' };

  // Accept either unix-ms or ISO8601. Reject anything older than 5 min.
  const parsedTs = /^\d+$/.test(timestampHeader)
    ? Number(timestampHeader)
    : Date.parse(timestampHeader);
  if (!Number.isFinite(parsedTs)) return { ok: false, reason: 'unparseable timestamp' };
  if (Math.abs(Date.now() - parsedTs) > REPLAY_WINDOW_MS) {
    return { ok: false, reason: 'timestamp outside replay window' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestampHeader}.${rawBody}`, 'utf8')
    .digest('hex');
  if (!safeEq(expected, String(signatureHeader).toLowerCase())) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}

// Pull guest contact fields out of a payload, tolerating slight shape
// differences across event types (booking vs experience vs contact).
function extractGuest(payload) {
  const g = payload?.guest || payload?.customer || payload || {};
  const email = (g.email || payload?.email || '').trim().toLowerCase();
  const name = g.name || payload?.name
    || [g.firstName, g.lastName].filter(Boolean).join(' ').trim()
    || null;
  const phone = g.phone || payload?.phone || null;
  return {
    email,
    name: name && name.length > 0 ? name : null,
    phone: phone || null,
    raw: g.email || payload?.email || null, // preserve casing
  };
}

function bookingRequestId(payload) {
  return payload?.booking_request_id || payload?.request_id || payload?.reference || null;
}

function stableEventReference(eventType, payload) {
  const ref = bookingRequestId(payload);
  if (eventType !== 'booking.proof_uploaded') return ref;
  const uploadKey = [
    payload?.uploaded_at,
    payload?.file_name,
    payload?.file_size,
    payload?.proof_viewer_url,
    payload?.proof_url,
  ].filter(Boolean).join(':');
  const fallback = crypto
    .createHash('sha1')
    .update(JSON.stringify(payload || {}))
    .digest('hex')
    .slice(0, 12);
  return `proof:${ref || 'unknown'}:${uploadKey || fallback}`;
}

async function upsertThreadForGuest({ guest, eventType, tenantId }) {
  const threadRes = await query(
    `
    INSERT INTO inbox_threads (
      tenant_id, guest_email, guest_email_raw, guest_name, guest_phone,
      last_event_type, last_event_at
    )
    VALUES ($6::uuid, LOWER($1), $2, $3, $4, $5, NOW())
    ON CONFLICT (tenant_id, (LOWER(guest_email))) DO UPDATE SET
      -- Refresh contact details if the new event carries them; keep
      -- the prior value otherwise.
      guest_email_raw   = COALESCE(EXCLUDED.guest_email_raw, inbox_threads.guest_email_raw),
      guest_name        = COALESCE(EXCLUDED.guest_name, inbox_threads.guest_name),
      guest_phone       = COALESCE(EXCLUDED.guest_phone, inbox_threads.guest_phone),
      last_event_type   = EXCLUDED.last_event_type,
      last_event_at     = NOW(),
      updated_at        = NOW()
    RETURNING id
    `,
    [guest.email, guest.raw, guest.name, guest.phone, eventType, tenantId],
  );
  return threadRes.rows[0].id;
}

async function findThreadByPayload({ payload, tenantId }) {
  const explicitThreadId = payload?.thread_id || payload?.threadId;
  if (explicitThreadId) {
    const { rows } = await query(
      `SELECT id FROM inbox_threads WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [explicitThreadId, tenantId],
    );
    if (rows[0]?.id) return rows[0].id;
  }

  const requestId = bookingRequestId(payload);
  if (!requestId) return null;

  const sidecar = await query(
    `SELECT thread_id
       FROM fad_portal_booking_requests
      WHERE tenant_id = $1 AND request_id = $2
      LIMIT 1`,
    [tenantId, requestId],
  );
  if (sidecar.rows[0]?.thread_id) return sidecar.rows[0].thread_id;

  const event = await query(
    `SELECT thread_id
       FROM inbox_events
      WHERE tenant_id = $1
        AND event_type = 'booking.request_submitted'
        AND (
          reference = $2
          OR payload->>'reference' = $2
          OR payload->>'booking_request_id' = $2
          OR payload->>'request_id' = $2
        )
      ORDER BY created_at DESC, id::text DESC
      LIMIT 1`,
    [tenantId, requestId],
  );
  return event.rows[0]?.thread_id || null;
}

async function resolveThreadId({ guest, eventType, payload, tenantId }) {
  const existingThreadId = await findThreadByPayload({ payload, tenantId });
  if (existingThreadId) return existingThreadId;
  if (guest.email) {
    return upsertThreadForGuest({ guest, eventType, tenantId });
  }
  if (eventType === 'booking.proof_uploaded') {
    const err = new Error('proof_upload_link_required');
    err.status = 400;
    err.publicMessage = 'Proof upload must include thread_id, booking_request_id, reference, or guest.email.';
    throw err;
  }
  const err = new Error('guest_email_required');
  err.status = 400;
  err.publicMessage = 'guest email is required (data.guest.email or data.email)';
  throw err;
}

function dateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : value;
}

function amountMinor(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

async function ensureBookingRequestSidecar({ tenantId, threadId, payload }) {
  const requestId = bookingRequestId(payload);
  if (!requestId) return null;
  const party = payload?.party_size_detail || {};
  const quote = payload?.quote || {};
  const { rows } = await query(
    `
    INSERT INTO fad_portal_booking_requests (
      tenant_id, thread_id, request_id,
      listing_slug, listing_title,
      check_in, check_out, nights,
      party_adults, party_children, party_infants,
      quoted_total_amount_minor, quoted_total_currency,
      status
    ) VALUES (
      $1::uuid, $2::uuid, $3,
      $4, $5,
      $6, $7, $8,
      $9, $10, $11,
      $12, $13,
      'awaiting_payment'
    )
    ON CONFLICT (tenant_id, request_id) DO UPDATE SET
      thread_id = COALESCE(fad_portal_booking_requests.thread_id, EXCLUDED.thread_id),
      listing_slug = COALESCE(EXCLUDED.listing_slug, fad_portal_booking_requests.listing_slug),
      listing_title = COALESCE(EXCLUDED.listing_title, fad_portal_booking_requests.listing_title),
      check_in = COALESCE(EXCLUDED.check_in, fad_portal_booking_requests.check_in),
      check_out = COALESCE(EXCLUDED.check_out, fad_portal_booking_requests.check_out),
      nights = COALESCE(EXCLUDED.nights, fad_portal_booking_requests.nights),
      party_adults = COALESCE(EXCLUDED.party_adults, fad_portal_booking_requests.party_adults),
      party_children = COALESCE(EXCLUDED.party_children, fad_portal_booking_requests.party_children),
      party_infants = COALESCE(EXCLUDED.party_infants, fad_portal_booking_requests.party_infants),
      quoted_total_amount_minor = COALESCE(EXCLUDED.quoted_total_amount_minor, fad_portal_booking_requests.quoted_total_amount_minor),
      quoted_total_currency = COALESCE(EXCLUDED.quoted_total_currency, fad_portal_booking_requests.quoted_total_currency),
      status = CASE
        WHEN fad_portal_booking_requests.status = 'pending_review' THEN 'awaiting_payment'
        ELSE fad_portal_booking_requests.status
      END,
      updated_at = NOW()
    RETURNING id
    `,
    [
      tenantId,
      threadId,
      requestId,
      payload?.residence_slug || payload?.residenceSlug || null,
      payload?.residence_name || payload?.residenceName || null,
      dateOrNull(payload?.check_in || payload?.checkIn),
      dateOrNull(payload?.check_out || payload?.checkOut),
      Number.isFinite(Number(payload?.nights)) ? Number(payload.nights) : null,
      Number.isFinite(Number(party.adults)) ? Number(party.adults) : null,
      Number.isFinite(Number(party.children)) ? Number(party.children) : null,
      Number.isFinite(Number(party.infants)) ? Number(party.infants) : null,
      amountMinor(quote.total),
      ['EUR', 'MUR', 'USD'].includes(quote.currency) ? quote.currency : null,
    ],
  );
  return rows[0]?.id || null;
}

async function markProofReceived({ tenantId, threadId, eventId, payload }) {
  const requestId = bookingRequestId(payload);
  if (requestId) {
    await ensureBookingRequestSidecar({ tenantId, threadId, payload });
  }
  const proofReceivedAt = payload?.uploaded_at ? new Date(payload.uploaded_at) : new Date();
  const safeProofReceivedAt = Number.isNaN(proofReceivedAt.getTime()) ? new Date() : proofReceivedAt;
  const { rows } = await query(
    `
    UPDATE fad_portal_booking_requests
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
           last_status_change_at = NOW(),
           updated_at = NOW()
     WHERE tenant_id = $9
       AND (
         thread_id = $10
         OR request_id = $11
       )
     RETURNING id
    `,
    [
      payload?.proof_url || payload?.proofUrl || null,
      payload?.proof_viewer_url || payload?.proofViewerUrl || null,
      payload?.file_name || payload?.fileName || null,
      payload?.file_type || payload?.fileType || null,
      Number.isFinite(Number(payload?.file_size || payload?.fileSize)) ? Number(payload?.file_size || payload?.fileSize) : null,
      safeProofReceivedAt,
      payload?.proof_source || payload?.source || 'website',
      eventId || null,
      tenantId,
      threadId,
      requestId,
    ],
  );
  return rows[0]?.id || null;
}

// Resolve thread + insert the event row. Returns
// { threadId, eventId, isDuplicate }. Idempotency: the unique index on
// (reference, event_type) makes the INSERT throw a conflict on retry,
// which we catch and treat as success. Proof uploads use a stable
// per-upload reference so multiple proof files can coexist.
async function recordEvent({
  guest,
  eventType,
  source,
  reference,
  payload,
  signature,
  signedAt,
  tenantId = FR_TENANT_ID,
}) {
  const threadId = await resolveThreadId({ guest, eventType, payload, tenantId });

  // 2. Insert the event. On unique-violation (reference, event_type) we
  // treat as a successful duplicate.
  //
  // signedAt arrives as the X-Friday-Inbox-Timestamp header, which is
  // a numeric string (unix-ms). `new Date(numericString)` returns
  // Invalid Date because Date parses strings as ISO 8601 — coerce to
  // Number first when it's all digits.
  const signedAtParsed = (() => {
    if (!signedAt) return null;
    const s = String(signedAt);
    const asDate = /^\d+$/.test(s) ? new Date(Number(s)) : new Date(s);
    return Number.isNaN(asDate.getTime()) ? null : asDate;
  })();
  try {
    const eventRes = await query(
      `
      INSERT INTO inbox_events (
        thread_id, reference, event_type, source, payload, signature, signed_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
      RETURNING id
      `,
      [
        threadId,
        reference || null,
        eventType,
        source || 'website',
        JSON.stringify(payload),
        signature || null,
        signedAtParsed,
      ],
    );
    return { threadId, eventId: eventRes.rows[0].id, isDuplicate: false };
  } catch (err) {
    // 23505 = unique_violation on Postgres. Retry from friday.mu —
    // event already recorded.
    if (err && err.code === '23505') {
      const existing = await query(
        `SELECT id FROM inbox_events WHERE reference = $1 AND event_type = $2 LIMIT 1`,
        [reference || null, eventType],
      );
      return { threadId, eventId: existing.rows[0]?.id || null, isDuplicate: true };
    }
    throw err;
  }
}

function mountWebhook(router) {
  router.post('/friday-website', async (req, res) => {
    // express.raw on this route gives us the body as a Buffer so HMAC
    // can verify the EXACT bytes friday.mu signed. We re-parse JSON
    // ourselves below; express.json() can't run on this route or it
    // would re-serialize the body and break the signature.
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!rawBody) {
      return res.status(400).json({ error: 'empty body' });
    }

    const sig = verifySignature({
      rawBody,
      timestampHeader: req.header('X-Friday-Inbox-Timestamp'),
      signatureHeader: req.header('X-Friday-Inbox-Signature'),
      secret: process.env.FRIDAY_WEBSITE_INBOX_SECRET,
    });
    if (!sig.ok) {
      console.warn('[website_inbox/webhook] rejecting:', sig.reason);
      return res.status(401).json({ error: 'Unauthorized', reason: sig.reason });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: 'invalid JSON' });
    }

    const eventType = payload?.event_type || payload?.type;
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: 'unknown event_type', event_type: eventType });
    }

    const data = payload?.data || payload;
    const guest = extractGuest(data);

    try {
      const eventReference = stableEventReference(eventType, data);
      const recorded = await recordEvent({
        guest,
        eventType,
        source: payload?.source || 'website',
        reference: eventReference,
        payload: data,
        signature: req.header('X-Friday-Inbox-Signature'),
        signedAt: req.header('X-Friday-Inbox-Timestamp'),
      });
      if (recorded.isDuplicate) {
        if (eventType === 'booking.request_submitted') {
          await ensureBookingRequestSidecar({
            tenantId: FR_TENANT_ID,
            threadId: recorded.threadId,
            payload: data,
          });
        }
        if (eventType === 'booking.proof_uploaded') {
          await markProofReceived({
            tenantId: FR_TENANT_ID,
            threadId: recorded.threadId,
            eventId: recorded.eventId,
            payload: data,
          });
        }
        if (recorded.eventId && shouldAutoDraftWebsiteEvent(eventType)) {
          triggerWebsiteDraftGeneration(recorded.threadId, recorded.eventId).catch((e) => {
            console.error(`[website_inbox/webhook] duplicate draft recovery failed for ${recorded.eventId}:`, e.message);
          });
        }
        return res.json({ status: 'duplicate', thread_id: recorded.threadId });
      }

      // Side effects per event type.
      if (eventType === 'booking.request_submitted') {
        await ensureBookingRequestSidecar({
          tenantId: FR_TENANT_ID,
          threadId: recorded.threadId,
          payload: data,
        });
      }

      if (eventType === 'booking.proof_uploaded') {
        await markProofReceived({
          tenantId: FR_TENANT_ID,
          threadId: recorded.threadId,
          eventId: recorded.eventId,
          payload: data,
        });
      }

      if (shouldAutoDraftWebsiteEvent(eventType)) {
        triggerWebsiteDraftGeneration(recorded.threadId, recorded.eventId).catch((e) => {
          console.error(`[website_inbox/webhook] draft trigger failed for ${recorded.eventId}:`, e.message);
        });
      }

      publishFadEvent({
        tenantId: '00000000-0000-0000-0000-000000000001',
        type: 'website_inbox.thread_updated',
        payload: { threadId: recorded.threadId, eventId: recorded.eventId, eventType },
      }).catch(() => {});

      return res.json({
        status: 'accepted',
        thread_id: recorded.threadId,
        event_id: recorded.eventId,
      });
    } catch (err) {
      if (err.status && err.status < 500) {
        return res.status(err.status).json({ error: err.message, message: err.publicMessage || err.message });
      }
      // 5xx so friday.mu retries — DB write failed.
      console.error('[website_inbox/webhook] persist error:', err.message);
      return res.status(500).json({ error: 'persist failed', detail: err.message });
    }
  });
}

module.exports = { mountWebhook, verifySignature };
