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
//   5xx  — our DB / Guesty is down. friday.mu retries.

const crypto = require('node:crypto');
const { query } = require('../database/client');
const { publishFadEvent } = require('../realtime');
const { listingIdForSlug } = require('./property-map');
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

// Upsert thread (by lower-cased email) + insert the event row. Returns
// { threadId, eventId, isDuplicate }. Idempotency: the unique index on
// (reference, event_type) makes the INSERT throw a conflict on retry,
// which we catch and treat as success.
async function recordEvent({
  guest,
  eventType,
  source,
  reference,
  payload,
  signature,
  signedAt,
}) {
  // 1. Upsert the thread. T3.7 v0.2 — explicit tenant_id matches the
  // new unique index `idx_inbox_threads_tenant_email_unique` from
  // mig 087. Pre-fix this conflict path errored with "no unique or
  // exclusion constraint matching the ON CONFLICT specification".
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
    [guest.email, guest.raw, guest.name, guest.phone, eventType, FR_TENANT_ID],
  );
  const threadId = threadRes.rows[0].id;

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

// Queue a Guesty create_reservation job. We don't call Guesty
// synchronously — webhook response stays fast + we get retry
// semantics for free.
async function queueCreateReservationJob({ threadId, eventId, payload }) {
  // Resolve listing ID from residence slug. If unmapped, mark the job
  // dead immediately so it surfaces in the DLQ panel — but still
  // record it so ops can see WHY no reservation was created.
  const slug = payload?.residence_slug || payload?.residenceSlug || payload?.slug;
  const listingId = listingIdForSlug(slug);

  const guestyPayload = {
    listingId,
    slug,
    checkInDate: payload?.check_in || payload?.checkIn || null,
    checkOutDate: payload?.check_out || payload?.checkOut || null,
    guestsCount: payload?.party_size || payload?.partySize || payload?.guests || 1,
    reference: payload?.reference || null,
    proofUrl: payload?.proof_url || payload?.proofUrl || payload?.blob_url || payload?.blobUrl || null,
    guest: payload?.guest || payload,
  };

  await query(
    `
    INSERT INTO inbox_guesty_jobs (thread_id, event_id, job_type, status, payload, last_error)
    VALUES ($1, $2, 'create_reservation', $3, $4::jsonb, $5)
    `,
    [
      threadId,
      eventId,
      listingId ? 'pending' : 'dead',
      JSON.stringify(guestyPayload),
      listingId ? null : `Unmapped residence slug: ${slug || '(none)'}. Add it to property-map.json.`,
    ],
  );

  // Also stamp the thread with the listing ID we'll use, so the UI can
  // show it before the job runs.
  if (listingId) {
    await query(
      `UPDATE inbox_threads SET guesty_listing_id = $1, updated_at = NOW() WHERE id = $2`,
      [listingId, threadId],
    );
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
    if (!guest.email) {
      return res.status(400).json({ error: 'guest email is required (data.guest.email or data.email)' });
    }

    try {
      const recorded = await recordEvent({
        guest,
        eventType,
        source: payload?.source || 'website',
        reference: data?.reference || null,
        payload: data,
        signature: req.header('X-Friday-Inbox-Signature'),
        signedAt: req.header('X-Friday-Inbox-Timestamp'),
      });
      if (recorded.isDuplicate) {
        if (recorded.eventId && shouldAutoDraftWebsiteEvent(eventType)) {
          triggerWebsiteDraftGeneration(recorded.threadId, recorded.eventId).catch((e) => {
            console.error(`[website_inbox/webhook] duplicate draft recovery failed for ${recorded.eventId}:`, e.message);
          });
        }
        return res.json({ status: 'duplicate', thread_id: recorded.threadId });
      }

      // Side effects per event type.
      if (eventType === 'booking.proof_uploaded') {
        await queueCreateReservationJob({
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
      // 5xx so friday.mu retries — DB or Guesty job queue failed.
      console.error('[website_inbox/webhook] persist error:', err.message);
      return res.status(500).json({ error: 'persist failed', detail: err.message });
    }
  });
}

module.exports = { mountWebhook, verifySignature };
